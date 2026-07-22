import type {
  AirspaceIntersection,
  AirspacePointQuery,
  AirspaceRiskAssessment,
  RiskLevel,
  ScoredRestriction,
} from "./types"

export const AIRSPACE_RISK_ENGINE_VERSION = "1.0.0"

const BASE_RISK: Record<RiskLevel, number> = {
  LOW: 20,
  MEDIUM: 45,
  HIGH: 70,
  CRITICAL: 90,
}

function altitudeApplies(
  altitudeMetres: number | null | undefined,
  limits: AirspaceIntersection["verticalLimits"],
) {
  if (altitudeMetres == null || !limits) return true
  if (limits.lowerMetres != null && altitudeMetres < limits.lowerMetres) return false
  if (limits.upperMetres != null && altitudeMetres > limits.upperMetres) return false
  return true
}

function scoreRestriction(item: AirspaceIntersection, query: AirspacePointQuery): ScoredRestriction {
  const reasons: string[] = []
  const applicable = altitudeApplies(query.altitudeMetres, item.verticalLimits)
  let score = BASE_RISK[item.riskLevel]

  if (item.inside) {
    score += 10
    reasons.push("Location intersects the restriction polygon")
  } else if (item.distanceMetres <= 250) {
    score += 7
    reasons.push("Location is within 250 metres of the restriction boundary")
  } else if (item.distanceMetres <= 1_000) {
    score += 3
    reasons.push("Location is within one kilometre of the restriction boundary")
  }

  if (item.recordType === "temporary") {
    score += 8
    reasons.push("An active temporary restriction applies")
  }
  if (item.recordType === "infrastructure") {
    score += 5
    reasons.push("Critical infrastructure is nearby")
  }
  if (/prohibited|restricted|statutory|mandatory/i.test(item.legalStatus)) {
    score += 5
    reasons.push(`Legal status is ${item.legalStatus}`)
  }
  if (!applicable) {
    score = Math.max(0, score - 35)
    reasons.push("Reported altitude is outside the published vertical limits")
  }

  return { ...item, altitudeApplicable: applicable, reasons, score: Math.min(100, score) }
}

function levelFor(score: number): RiskLevel {
  if (score >= 85) return "CRITICAL"
  if (score >= 65) return "HIGH"
  if (score >= 35) return "MEDIUM"
  return "LOW"
}

export function assessAirspaceRisk(
  intersections: AirspaceIntersection[],
  query: AirspacePointQuery,
): AirspaceRiskAssessment {
  const restrictions = intersections
    .map((item) => scoreRestriction(item, query))
    .sort((a, b) => b.score - a.score || b.displayPriority - a.displayPriority)
  const active = restrictions.filter((item) => item.altitudeApplicable)
  const score = active[0]?.score ?? 0
  const temporary = active.filter((item) => item.recordType === "temporary")
  const infrastructure = active.filter((item) => item.recordType === "infrastructure")
  const statutory = active.filter((item) => /prohibited|restricted|statutory|mandatory/i.test(item.legalStatus))

  const operationalRisks = [
    statutory.length ? `${statutory.length} statutory or mandatory restriction(s) intersect the location.` : null,
    temporary.length ? `${temporary.length} active temporary restriction(s) require immediate verification.` : null,
    infrastructure.length ? `${infrastructure.length} critical infrastructure site(s) are nearby.` : null,
  ].filter((value): value is string => value !== null)

  const recommendedActions = [
    statutory.length ? "Escalate for legal and operational review before deployment." : null,
    temporary.length ? "Verify the current NOTAM or temporary restriction with the issuing authority." : null,
    infrastructure.length ? "Notify the relevant site security liaison if operational thresholds are met." : null,
    restrictions.length ? "Retain the source version and assessment timestamp with the incident record." : "No known indexed restriction intersects this location; complete normal pre-flight checks.",
  ].filter((value): value is string => value !== null)

  return {
    riskLevel: levelFor(score),
    score,
    restrictions,
    permanentRestrictions: active.filter((item) => item.recordType === "permanent"),
    temporaryRestrictions: temporary,
    criticalInfrastructure: infrastructure,
    operationalRisks,
    recommendedActions,
    assessedAt: new Date().toISOString(),
    engineVersion: AIRSPACE_RISK_ENGINE_VERSION,
  }
}
