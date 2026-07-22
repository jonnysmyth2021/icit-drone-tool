import { NextRequest, NextResponse } from "next/server"

import { airspaceService } from "@/lib/airspace/service"
import { apiError, numberParameter, requireApiUser } from "./_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await requireApiUser())) return apiError(new Error("Authentication required."), 401)
  try {
    const params = request.nextUrl.searchParams
    const data = await airspaceService.queryBounds(
      {
        minLon: numberParameter(params.get("minLon") ?? params.get("lomin"), "minLon"),
        minLat: numberParameter(params.get("minLat") ?? params.get("lamin"), "minLat"),
        maxLon: numberParameter(params.get("maxLon") ?? params.get("lomax"), "maxLon"),
        maxLat: numberParameter(params.get("maxLat") ?? params.get("lamax"), "maxLat"),
      },
      {
        timestamp: params.get("timestamp") ?? undefined,
        categories: params.get("categories")?.split(",").filter(Boolean),
      },
    )
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=10" } })
  } catch (error) {
    return apiError(error)
  }
}
