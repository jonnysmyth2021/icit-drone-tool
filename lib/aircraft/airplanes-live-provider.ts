import type { Aircraft, AircraftBounds, AircraftProvider, AircraftProviderResult } from "./types"
import {
  configuredTimeout,
  isTimeoutError,
  networkErrorCode,
  providerLog,
  serializeProviderError,
} from "./provider-utils"

const API_URL = "https://api.airplanes.live/v2"
const KM_PER_NAUTICAL_MILE = 1.852

type AirplanesLiveAircraft = {
  hex?: unknown
  flight?: unknown
  r?: unknown
  t?: unknown
  desc?: unknown
  lat?: unknown
  lon?: unknown
  alt_baro?: unknown
  alt_geom?: unknown
  gs?: unknown
  track?: unknown
  true_heading?: unknown
  mag_heading?: unknown
  baro_rate?: unknown
  geom_rate?: unknown
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radiusKm = 6_371
  const latDelta = ((bLat - aLat) * Math.PI) / 180
  const lonDelta = ((bLon - aLon) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const value =
    Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2
  return 2 * radiusKm * Math.asin(Math.sqrt(value))
}

export function boundsToAirplanesLivePoint(bounds: AircraftBounds) {
  const latitude = (bounds.lamin + bounds.lamax) / 2
  const longitude = (bounds.lomin + bounds.lomax) / 2
  const cornerDistanceKm = haversineKm(latitude, longitude, bounds.lamax, bounds.lomax)
  return {
    latitude,
    longitude,
    radiusNm: Math.min(250, Math.max(1, Math.ceil(cornerDistanceKm / KM_PER_NAUTICAL_MILE))),
  }
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeAirplanesLiveAircraft(item: AirplanesLiveAircraft): Aircraft | null {
  const latitude = numberValue(item.lat)
  const longitude = numberValue(item.lon)
  if (latitude == null || longitude == null) return null
  const altitudeFeet = numberValue(item.alt_geom) ?? numberValue(item.alt_baro)
  const verticalFeetPerMinute = numberValue(item.geom_rate) ?? numberValue(item.baro_rate)
  const speedKnots = numberValue(item.gs)
  return {
    icao24: textValue(item.hex) ?? "unknown",
    callsign: textValue(item.flight) ?? "Unknown",
    registration: textValue(item.r),
    latitude,
    longitude,
    altitude: altitudeFeet == null ? null : altitudeFeet * 0.3048,
    heading:
      numberValue(item.true_heading) ?? numberValue(item.track) ?? numberValue(item.mag_heading),
    velocity: speedKnots == null ? null : speedKnots * 0.514444,
    verticalRate: verticalFeetPerMinute == null ? null : verticalFeetPerMinute * 0.00508,
    aircraftType: textValue(item.t) ?? textValue(item.desc),
    originCountry: null,
    provider: "airplaneslive",
  }
}

export class AirplanesLiveProvider implements AircraftProvider {
  readonly name = "airplaneslive" as const

  async fetchAircraft(bounds: AircraftBounds): Promise<AircraftProviderResult> {
    const startedAt = Date.now()
    const timeoutMs = configuredTimeout("AIRPLANES_LIVE_TIMEOUT_MS", 8_000)
    const point = boundsToAirplanesLivePoint(bounds)
    const url = `${API_URL}/point/${point.latitude.toFixed(5)}/${point.longitude.toFixed(5)}/${point.radiusNm}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "ICIT-Drone-Tool/1.0" },
      })
      const body = await response.text()
      const durationMs = Date.now() - startedAt
      if (!response.ok) {
        providerLog(this.name, "point", {
          durationMs,
          status: "provider_unavailable",
          timeout: false,
          httpStatus: response.status,
          fallbackTriggered: true,
        })
        return {
          ok: false,
          provider: this.name,
          status: "provider_unavailable",
          durationMs,
          httpStatus: response.status,
          error: {
            message: `Airplanes.live returned HTTP ${response.status}: ${body.slice(0, 500)}`,
            httpStatus: response.status,
          },
        }
      }

      try {
        const data = JSON.parse(body) as { ac?: unknown }
        if (!Array.isArray(data.ac)) throw new Error("Airplanes.live response did not contain ac.")
        const aircraft = data.ac
          .filter((item): item is AirplanesLiveAircraft => typeof item === "object" && item !== null)
          .map(normalizeAirplanesLiveAircraft)
          .filter((item): item is Aircraft => item !== null)
          .filter(
            (item) =>
              item.latitude >= bounds.lamin &&
              item.latitude <= bounds.lamax &&
              item.longitude >= bounds.lomin &&
              item.longitude <= bounds.lomax,
          )
          .slice(0, 400)
        providerLog(this.name, "point", {
          durationMs,
          status: "success",
          timeout: false,
          httpStatus: response.status,
          fallbackTriggered: true,
        })
        return {
          ok: true,
          provider: this.name,
          aircraft,
          status: "success",
          durationMs,
          httpStatus: response.status,
        }
      } catch (error) {
        providerLog(this.name, "point", {
          durationMs,
          status: "invalid_response",
          timeout: false,
          httpStatus: response.status,
          fallbackTriggered: true,
          error: serializeProviderError(error),
        })
        return {
          ok: false,
          provider: this.name,
          status: "invalid_response",
          durationMs,
          httpStatus: response.status,
          error: { message: error instanceof Error ? error.message : String(error), httpStatus: response.status },
        }
      }
    } catch (error) {
      const timedOut = isTimeoutError(error)
      const durationMs = Date.now() - startedAt
      const status = timedOut ? "timeout" : "network_error"
      providerLog(this.name, "point", {
        durationMs,
        status,
        timeout: timedOut,
        fallbackTriggered: true,
        error: serializeProviderError(error),
      })
      return {
        ok: false,
        provider: this.name,
        status,
        durationMs,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: networkErrorCode(error),
        },
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}
