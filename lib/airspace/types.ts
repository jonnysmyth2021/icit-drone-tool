export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

export type RestrictionCategory =
  | "permanent_aviation"
  | "temporary_aviation"
  | "critical_infrastructure"
  | "government"
  | "security"
  | "advisory"

export type RestrictionSubCategory =
  | "frz"
  | "restricted_airspace"
  | "danger_area"
  | "prohibited_area"
  | "controlled_airspace"
  | "aerodrome"
  | "heliport"
  | "notam"
  | "temporary_flight_restriction"
  | "air_display"
  | "royal_flight"
  | "laser_display"
  | "fireworks"
  | "sporting_event"
  | "emergency_incident"
  | "disaster_zone"
  | "police_air_operation"
  | "construction_crane"
  | "nuclear"
  | "power_station"
  | "substation"
  | "water_treatment"
  | "reservoir"
  | "port"
  | "airport"
  | "rail"
  | "telecom"
  | "data_centre"
  | "oil_gas"
  | "wind_farm"
  | "solar_farm"
  | "parliament"
  | "government_building"
  | "court"
  | "embassy"
  | "military"
  | "police"
  | "fire_station"
  | "prison"
  | "border_force"
  | "customs"
  | "hospital"
  | "school"
  | "national_park"
  | "nature_reserve"
  | "sssi"
  | "bird_protection"
  | "landowner"
  | (string & {})

export interface VerticalLimits {
  lowerMetres?: number | null
  upperMetres?: number | null
  lowerLabel?: string | null
  upperLabel?: string | null
  reference?: "AGL" | "AMSL" | "FL" | "UNKNOWN"
}

export interface RestrictionProperties {
  id: string
  referenceNumber: string
  name: string
  category: RestrictionCategory
  subCategory: RestrictionSubCategory
  authority: string
  country: string
  legalStatus: string
  sourceVersion: string
  effectiveFrom: string | null
  effectiveUntil: string | null
  schedule: Record<string, unknown> | null
  verticalLimits: VerticalLimits | null
  contactDetails: Record<string, unknown> | null
  riskLevel: RiskLevel
  displayPriority: number
  colour: string
  icon: string
  notes: string | null
  properties: Record<string, unknown>
  lastUpdated: string
  recordType: "permanent" | "temporary" | "infrastructure"
}

export type RestrictionFeature = GeoJSON.Feature<GeoJSON.MultiPolygon, RestrictionProperties>
export type RestrictionCollection = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, RestrictionProperties>

export interface AirspacePointQuery {
  lat: number
  lon: number
  altitudeMetres?: number | null
  timestamp?: string
  radiusMetres?: number
}

export interface AirspaceIntersection {
  id: string
  name: string
  category: RestrictionCategory
  subCategory: RestrictionSubCategory
  legalStatus: string
  riskLevel: RiskLevel
  effectiveFrom: string | null
  effectiveUntil: string | null
  verticalLimits: VerticalLimits | null
  displayPriority: number
  recordType: "permanent" | "temporary" | "infrastructure"
  inside: boolean
  distanceMetres: number
}

export interface ScoredRestriction extends AirspaceIntersection {
  score: number
  altitudeApplicable: boolean
  reasons: string[]
}

export interface AirspaceRiskAssessment {
  riskLevel: RiskLevel
  score: number
  restrictions: ScoredRestriction[]
  permanentRestrictions: ScoredRestriction[]
  temporaryRestrictions: ScoredRestriction[]
  criticalInfrastructure: ScoredRestriction[]
  operationalRisks: string[]
  recommendedActions: string[]
  assessedAt: string
  engineVersion: string
}

export interface AirspaceProvider {
  readonly id: string
  readonly country: string
  readonly authority: string
  readonly capabilities: readonly ("permanent" | "temporary" | "infrastructure" | "advisory")[]
  describe(): AirspaceProviderDescriptor
}

export interface AirspaceProviderDescriptor {
  id: string
  country: string
  authority: string
  capabilities: readonly string[]
  authoritative: boolean
  sourceUrl?: string
  notes?: string
}
