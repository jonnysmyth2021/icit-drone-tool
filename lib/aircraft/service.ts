import { AirplanesLiveProvider } from "./airplanes-live-provider"
import { OpenSkyProvider } from "./opensky-provider"
import type {
  AircraftBounds,
  AircraftProvider,
  AircraftProviderResult,
  AircraftServiceResult,
} from "./types"

const CACHE_TTL_MS = 8_000
const MAX_CACHE_ENTRIES = 100
const successCache = new Map<string, { expiresAt: number; result: AircraftServiceResult & { ok: true } }>()
const inFlight = new Map<string, Promise<AircraftServiceResult>>()

function cacheKey(bounds: AircraftBounds) {
  return [bounds.lamin, bounds.lomin, bounds.lamax, bounds.lomax]
    .map((value) => value.toFixed(5))
    .join(":")
}

/** Coordinates providers, normalization, failover, request coalescing and short-lived caching. */
export class AircraftService {
  constructor(
    private readonly primary: AircraftProvider = new OpenSkyProvider(),
    private readonly fallback: AircraftProvider = new AirplanesLiveProvider(),
  ) {}

  async getAircraft(bounds: AircraftBounds): Promise<AircraftServiceResult> {
    const key = cacheKey(bounds)
    const cached = successCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.result,
        diagnostics: { ...cached.result.diagnostics, responseTimeMs: 0, cacheHit: true },
      }
    }
    if (cached) successCache.delete(key)

    const activeRequest = inFlight.get(key)
    if (activeRequest) return activeRequest

    const request = this.fetchWithFallback(bounds).finally(() => inFlight.delete(key))
    inFlight.set(key, request)
    const result = await request
    if (result.ok) {
      const now = Date.now()
      for (const [cachedKey, entry] of successCache) {
        if (entry.expiresAt <= now) successCache.delete(cachedKey)
      }
      if (successCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = successCache.keys().next().value
        if (oldestKey) successCache.delete(oldestKey)
      }
      successCache.set(key, { expiresAt: now + CACHE_TTL_MS, result })
    }
    return result
  }

  private async fetchWithFallback(bounds: AircraftBounds): Promise<AircraftServiceResult> {
    const startedAt = Date.now()
    const primary = await this.primary.fetchAircraft(bounds)
    if (primary.ok) {
      return {
        ok: true,
        provider: primary.provider,
        fallbackUsed: false,
        aircraft: primary.aircraft,
        diagnostics: {
          openskyStatus: primary.status,
          airplanesStatus: "not_attempted",
          responseTimeMs: Date.now() - startedAt,
          cacheHit: false,
        },
      }
    }

    console.warn(
      JSON.stringify({
        service: "aircraft",
        event: "fallback_triggered",
        provider: primary.provider,
        durationMs: primary.durationMs,
        status: primary.status,
        timeout: primary.status === "timeout",
        httpStatus: primary.httpStatus,
        fallbackTriggered: true,
      }),
    )
    const fallback = await this.fallback.fetchAircraft(bounds)
    if (fallback.ok) {
      return {
        ok: true,
        provider: fallback.provider,
        fallbackUsed: true,
        aircraft: fallback.aircraft,
        diagnostics: {
          openskyStatus: primary.status,
          airplanesStatus: fallback.status,
          responseTimeMs: Date.now() - startedAt,
          cacheHit: false,
        },
      }
    }

    return this.allProvidersFailed(primary, fallback, Date.now() - startedAt)
  }

  private allProvidersFailed(
    primary: Extract<AircraftProviderResult, { ok: false }>,
    fallback: Extract<AircraftProviderResult, { ok: false }>,
    responseTimeMs: number,
  ): AircraftServiceResult {
    return {
      ok: false,
      provider: null,
      fallbackUsed: true,
      aircraft: null,
      diagnostics: {
        openskyStatus: primary.status,
        airplanesStatus: fallback.status,
        responseTimeMs,
        cacheHit: false,
      },
      error: {
        code: "all_providers_failed",
        message: "Live aircraft temporarily unavailable.",
        providers: { opensky: primary.error, airplaneslive: fallback.error },
      },
    }
  }
}

export const aircraftService = new AircraftService()
