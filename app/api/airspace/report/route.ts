import { NextRequest, NextResponse } from "next/server"

import { AIRSPACE_RISK_ENGINE_VERSION } from "@/lib/airspace/risk-engine"
import { airspaceService } from "@/lib/airspace/service"
import { apiError, requireApiUser } from "../_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if (!auth) return apiError(new Error("Authentication required."), 401)
  try {
    const body = (await request.json()) as { reportId?: string; altitudeMetres?: number | null }
    if (!body.reportId) throw new Error("reportId is required.")
    const { data: report, error } = await auth.supabase
      .from("reports")
      .select("id, latitude, longitude, submitted_at, created_at")
      .eq("id", body.reportId)
      .single()
    if (error || !report || report.latitude == null || report.longitude == null) {
      throw new Error(error?.message ?? "Report location is unavailable.")
    }

    const query = {
      lat: report.latitude,
      lon: report.longitude,
      altitudeMetres: body.altitudeMetres ?? null,
      timestamp: report.submitted_at ?? report.created_at,
      radiusMetres: 5_000,
    }
    const assessment = await airspaceService.assessRisk(query)
    const { error: insertError } = await auth.supabase.from("risk_assessments").insert({
      report_id: report.id,
      user_id: auth.user.id,
      latitude: query.lat,
      longitude: query.lon,
      altitude_metres: query.altitudeMetres,
      assessed_for: query.timestamp,
      risk_level: assessment.riskLevel,
      risk_score: assessment.score,
      restriction_ids: assessment.restrictions.map((item) => item.id),
      result: assessment,
      engine_version: AIRSPACE_RISK_ENGINE_VERSION,
    })
    if (insertError) throw new Error(`Unable to retain risk assessment: ${insertError.message}`)
    return NextResponse.json(assessment, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
