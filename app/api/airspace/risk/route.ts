import { NextRequest, NextResponse } from "next/server"

import { airspaceService } from "@/lib/airspace/service"
import { apiError, numberParameter, requireApiUser } from "../_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireApiUser())) return apiError(new Error("Authentication required."), 401)
  try {
    const params = request.nextUrl.searchParams
    const assessment = await airspaceService.assessRisk({
      lat: numberParameter(params.get("lat"), "lat"),
      lon: numberParameter(params.get("lon") ?? params.get("lng"), "lon"),
      altitudeMetres: params.has("altitude") ? numberParameter(params.get("altitude"), "altitude") : null,
      radiusMetres: params.has("radius") ? numberParameter(params.get("radius"), "radius") : 5_000,
      timestamp: params.get("timestamp") ?? undefined,
    })
    return NextResponse.json(assessment)
  } catch (error) {
    return apiError(error)
  }
}
