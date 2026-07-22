export type AircraftProviderName = "opensky" | "airplaneslive"

/** Provider-neutral aircraft data. SI units are used throughout the application. */
export interface Aircraft {
  icao24: string
  callsign: string
  registration: string | null
  latitude: number
  longitude: number
  /** Metres above mean sea level, where available. */
  altitude: number | null
  /** Degrees clockwise from true north. */
  heading: number | null
  /** Ground speed in metres per second. */
  velocity: number | null
  /** Vertical speed in metres per second. */
  verticalRate: number | null
  aircraftType: string | null
  originCountry: string | null
  provider: AircraftProviderName
}

export interface AircraftBounds {
  lamin: number
  lomin: number
  lamax: number
  lomax: number
}

export type AircraftProviderStatus =
  | "success"
  | "not_attempted"
  | "timeout"
  | "authentication_error"
  | "network_error"
  | "provider_unavailable"
  | "invalid_response"

export interface AircraftErrorDetails {
  message: string
  httpStatus?: number
  code?: string
}

export type AircraftProviderResult =
  | {
      ok: true
      provider: AircraftProviderName
      aircraft: Aircraft[]
      status: "success"
      durationMs: number
      httpStatus: number
    }
  | {
      ok: false
      provider: AircraftProviderName
      status: Exclude<AircraftProviderStatus, "success" | "not_attempted">
      durationMs: number
      httpStatus?: number
      error: AircraftErrorDetails
    }

export interface AircraftProvider {
  readonly name: AircraftProviderName
  fetchAircraft(bounds: AircraftBounds): Promise<AircraftProviderResult>
}

export interface AircraftDiagnostics {
  openskyStatus: AircraftProviderStatus
  airplanesStatus: AircraftProviderStatus
  responseTimeMs: number
  cacheHit: boolean
}

export type AircraftServiceResult =
  | {
      ok: true
      provider: AircraftProviderName
      fallbackUsed: boolean
      aircraft: Aircraft[]
      diagnostics: AircraftDiagnostics
    }
  | {
      ok: false
      provider: null
      fallbackUsed: true
      aircraft: null
      diagnostics: AircraftDiagnostics
      error: {
        code: "all_providers_failed"
        message: string
        providers: {
          opensky: AircraftErrorDetails
          airplaneslive: AircraftErrorDetails
        }
      }
    }
