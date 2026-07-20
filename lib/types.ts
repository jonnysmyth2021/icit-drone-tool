export type DroneType = "Multi-Rotor" | "Fixed Wing" | "Unknown"

export type LightsVisible = "Yes" | "No" | "Unknown"

export type Altitude =
  | "Below Treeline"
  | "Treeline Height"
  | "Above Treeline"
  | "Above Buildings"
  | "High Altitude"
  | "Unknown"

export type LightColor = "White" | "Red" | "Green" | "Blue" | "Orange/Amber" | "Strobing/Flashing"

export type EvidenceKind = "photo" | "video"

export interface EvidenceItem {
  id: string
  kind: EvidenceKind
  /** Compressed data URL (photos) or poster frame (video). Empty for large videos. */
  preview: string
  fileName: string
  mimeType: string
  sizeBytes: number
  source: "camera" | "upload"
  capturedAt: string
  /** Parsed EXIF / media metadata. */
  metadata: Record<string, unknown>
}

export interface ReportLocation {
  lat: number
  lng: number
  accuracy: number | null
  /** Compass bearing (deg) the observer is facing toward the drone. */
  bearing: number | null
  /** Device heading (deg) at time of capture, if available. */
  deviceHeading: number | null
}

export interface AircraftMatch {
  callsign: string
  icao24: string
  distanceKm: number
  altitudeM: number | null
  headingDeg: number | null
  velocityMs: number | null
  origin: string
  /** Aircraft position captured at the moment of reporting (for map plotting). */
  lat?: number
  lng?: number
}

export interface AstronomyMatch {
  body: string
  type: "satellite" | "star" | "planet"
  note: string
  distanceKm?: number
}

export type Verdict = "likely_drone" | "possible_aircraft" | "possible_astronomical" | "inconclusive"

export interface IntelligenceAssessment {
  verdict: Verdict
  confidence: number
  summary: string
  probabilities?: {
    drone: number
    aircraft: number
    astronomical: number
    inconclusive: number
  }
  reasoningFactors?: string[]
  recommendedAction?: string
  aircraftNearby: AircraftMatch[]
  astronomyMatches: AstronomyMatch[]
  generatedAt: string
  dataSources: { name: string; status: "ok" | "fallback" | "error" }[]
}

export type ReportStatus = "submitted" | "reviewing" | "confirmed" | "rejected"

export interface DroneReport {
  id: string
  reference: string
  createdAt: string
  reporter: string
  droneType: DroneType
  lightsVisible: LightsVisible
  lightColors: LightColor[]
  altitude: Altitude
  evidence: EvidenceItem[]
  location: ReportLocation
  intelligence: IntelligenceAssessment | null
  status: ReportStatus
  reviewerNote?: string
}

export interface DraftReport {
  droneType?: DroneType
  lightsVisible?: LightsVisible
  lightColors: LightColor[]
  altitude?: Altitude
  evidence: EvidenceItem[]
  location?: ReportLocation
  intelligence?: IntelligenceAssessment | null
}

export const LIGHT_COLOR_OPTIONS: { value: LightColor; swatch: string }[] = [
  { value: "White", swatch: "#f8fafc" },
  { value: "Red", swatch: "#ef4444" },
  { value: "Green", swatch: "#22c55e" },
  { value: "Blue", swatch: "#3b82f6" },
  { value: "Orange/Amber", swatch: "#f59e0b" },
  { value: "Strobing/Flashing", swatch: "#e2e8f0" },
]
