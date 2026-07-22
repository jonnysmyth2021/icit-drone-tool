import type {
  Aircraft,
  AircraftBounds,
  AircraftProvider,
  AircraftProviderResult,
  AircraftProviderStatus,
} from "./types"
import {
  configuredTimeout,
  isTimeoutError,
  networkErrorCode,
  providerLog,
  serializeProviderError,
} from "./provider-utils"

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
const STATES_URL = "https://opensky-network.org/api/states/all"

let cachedToken: { value: string; expiresAt: number } | null = null

type RequestResult =
  | { ok: true; body: string; httpStatus: number; durationMs: number }
  | {
      ok: false
      status: Exclude<AircraftProviderStatus, "success" | "not_attempted">
      error: string
      code?: string
      httpStatus?: number
      durationMs: number
    }

function redactOAuthBody(body: string) {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    for (const key of ["access_token", "refresh_token", "id_token", "client_secret"]) {
      if (key in parsed) parsed[key] = "[REDACTED]"
    }
    return parsed
  } catch {
    return body.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
  }
}

async function requestWithTimeoutRetry(
  requestName: "oauth" | "states",
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<RequestResult> {
  const overallStartedAt = Date.now()
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      const body = await response.text()
      const durationMs = Date.now() - startedAt
      if (!response.ok) {
        const status =
          response.status === 401 || response.status === 403
            ? "authentication_error"
            : "provider_unavailable"
        providerLog("opensky", requestName, {
          durationMs,
          status,
          timeout: false,
          httpStatus: response.status,
          fallbackTriggered: false,
          attempt,
        })
        console.error(
          JSON.stringify({
            service: "aircraft",
            event: "provider_http_error",
            provider: "opensky",
            request: requestName,
            httpStatus: response.status,
            body: requestName === "oauth" ? redactOAuthBody(body) : body.slice(0, 1_000),
          }),
        )
        return {
          ok: false,
          status,
          error: `OpenSky ${requestName} request returned HTTP ${response.status}.`,
          httpStatus: response.status,
          durationMs: Date.now() - overallStartedAt,
        }
      }
      providerLog("opensky", requestName, {
        durationMs,
        status: "success",
        timeout: false,
        httpStatus: response.status,
        fallbackTriggered: false,
        attempt,
      })
      return { ok: true, body, httpStatus: response.status, durationMs: Date.now() - overallStartedAt }
    } catch (error) {
      const timedOut = isTimeoutError(error)
      const status = timedOut ? "timeout" : "network_error"
      const durationMs = Date.now() - startedAt
      providerLog("opensky", requestName, {
        durationMs,
        status,
        timeout: timedOut,
        fallbackTriggered: false,
        attempt,
        error: serializeProviderError(error),
      })
      if (timedOut && attempt === 1) continue
      return {
        ok: false,
        status,
        error: error instanceof Error ? error.message : String(error),
        code: networkErrorCode(error),
        durationMs: Date.now() - overallStartedAt,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  return { ok: false, status: "timeout", error: "OpenSky request timed out.", durationMs: Date.now() - overallStartedAt }
}

async function getAccessToken(timeoutMs: number): Promise<RequestResult & { token?: string }> {
  const id = process.env.OPENSKY_CLIENT_ID
  const secret = process.env.OPENSKY_CLIENT_SECRET
  if (!id || !secret) {
    return {
      ok: false,
      status: "authentication_error",
      error: "OpenSky OAuth credentials are not configured.",
      durationMs: 0,
    }
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return { ok: true, body: "", token: cachedToken.value, httpStatus: 200, durationMs: 0 }
  }

  const result = await requestWithTimeoutRetry(
    "oauth",
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
    },
    timeoutMs,
  )
  if (!result.ok) return result

  try {
    const data = JSON.parse(result.body) as { access_token?: string; expires_in?: number }
    if (!data.access_token) {
      return {
        ok: false,
        status: "invalid_response",
        error: "OpenSky OAuth response did not contain an access token.",
        httpStatus: result.httpStatus,
        durationMs: result.durationMs,
      }
    }
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1_800) * 1_000,
    }
    return { ...result, token: cachedToken.value }
  } catch {
    return {
      ok: false,
      status: "invalid_response",
      error: "OpenSky OAuth response was not valid JSON.",
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
    }
  }
}

function normalizeOpenSkyState(state: unknown[]): Aircraft | null {
  const longitude = state[5]
  const latitude = state[6]
  if (typeof latitude !== "number" || typeof longitude !== "number") return null
  return {
    icao24: String(state[0] ?? "").trim(),
    callsign: String(state[1] ?? "").trim() || "Unknown",
    registration: null,
    latitude,
    longitude,
    altitude:
      typeof state[13] === "number" ? state[13] : typeof state[7] === "number" ? state[7] : null,
    heading: typeof state[10] === "number" ? state[10] : null,
    velocity: typeof state[9] === "number" ? state[9] : null,
    verticalRate: typeof state[11] === "number" ? state[11] : null,
    aircraftType: null,
    originCountry: String(state[2] ?? "").trim() || null,
    provider: "opensky",
  }
}

export class OpenSkyProvider implements AircraftProvider {
  readonly name = "opensky" as const

  async fetchAircraft(bounds: AircraftBounds): Promise<AircraftProviderResult> {
    const startedAt = Date.now()
    const timeoutMs = configuredTimeout("OPENSKY_TIMEOUT_MS", 8_000)
    const tokenResult = await getAccessToken(timeoutMs)
    if (!tokenResult.ok || !tokenResult.token) {
      return {
        ok: false,
        provider: this.name,
        status: tokenResult.ok ? "invalid_response" : tokenResult.status,
        durationMs: Date.now() - startedAt,
        httpStatus: tokenResult.httpStatus,
        error: {
          message: tokenResult.ok ? "OpenSky OAuth did not produce a token." : tokenResult.error,
          httpStatus: tokenResult.httpStatus,
          code: tokenResult.ok ? undefined : tokenResult.code,
        },
      }
    }

    const params = new URLSearchParams({
      lamin: String(bounds.lamin),
      lomin: String(bounds.lomin),
      lamax: String(bounds.lamax),
      lomax: String(bounds.lomax),
    })
    const result = await requestWithTimeoutRetry(
      "states",
      `${STATES_URL}?${params.toString()}`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${tokenResult.token}` } },
      timeoutMs,
    )
    if (!result.ok) {
      return {
        ok: false,
        provider: this.name,
        status: result.status,
        durationMs: Date.now() - startedAt,
        httpStatus: result.httpStatus,
        error: { message: result.error, httpStatus: result.httpStatus, code: result.code },
      }
    }

    try {
      const data = JSON.parse(result.body) as { states?: unknown }
      if (!Array.isArray(data.states)) throw new Error("OpenSky response did not contain states.")
      const aircraft = data.states
        .filter((state): state is unknown[] => Array.isArray(state))
        .map(normalizeOpenSkyState)
        .filter((item): item is Aircraft => item !== null)
        .slice(0, 400)
      return {
        ok: true,
        provider: this.name,
        aircraft,
        status: "success",
        durationMs: Date.now() - startedAt,
        httpStatus: result.httpStatus,
      }
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        status: "invalid_response",
        durationMs: Date.now() - startedAt,
        httpStatus: result.httpStatus,
        error: { message: error instanceof Error ? error.message : String(error), httpStatus: result.httpStatus },
      }
    }
  }
}
