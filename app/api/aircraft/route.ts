import { NextResponse } from "next/server"

import { aircraftService } from "@/lib/aircraft"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const preferredRegion = "fra1"
export const maxDuration = 60

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lamin = Math.max(-90, numberParam(url.searchParams.get("lamin"), 49.5))
  const lomin = Math.max(-180, numberParam(url.searchParams.get("lomin"), -8.5))
  const lamax = Math.min(90, numberParam(url.searchParams.get("lamax"), 61))
  const lomax = Math.min(180, numberParam(url.searchParams.get("lomax"), 2.5))

  if (lamin >= lamax || lomin >= lomax) {
    return NextResponse.json({ error: "Invalid bounding box" }, { status: 400 })
  }

  // Defend the upstream service even if an older client sends a very large
  // viewport. A 4° × 4° regional box is ample for the operational map.
  const centerLat = (lamin + lamax) / 2
  const centerLng = (lomin + lomax) / 2
  const safeLamin = Math.max(-90, centerLat - Math.min(2, (lamax - lamin) / 2))
  const safeLamax = Math.min(90, centerLat + Math.min(2, (lamax - lamin) / 2))
  const safeLomin = Math.max(-180, centerLng - Math.min(2, (lomax - lomin) / 2))
  const safeLomax = Math.min(180, centerLng + Math.min(2, (lomax - lomin) / 2))

  const result = await aircraftService.getAircraft({
    lamin: safeLamin,
    lomin: safeLomin,
    lamax: safeLamax,
    lomax: safeLomax,
  })
  if (!result.ok) {
    return NextResponse.json(
      {
        provider: result.provider,
        fallbackUsed: result.fallbackUsed,
        aircraft: result.aircraft,
        diagnostics: result.diagnostics,
        error: result.error,
        updatedAt: new Date().toISOString(),
        unavailable: true,
      },
      { status: 503 },
    )
  }

  const responseBody = {
    provider: result.provider,
    fallbackUsed: result.fallbackUsed,
    aircraft: result.aircraft,
    diagnostics: result.diagnostics,
    updatedAt: new Date().toISOString(),
    unavailable: false,
  }
  console.info(
    JSON.stringify({
      service: "aircraft",
      event: "aircraft_api_response",
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      aircraftParsed: result.aircraft.length,
      diagnostics: result.diagnostics,
    }),
  )
  return NextResponse.json(responseBody, {
    headers: {
      "Cache-Control": "public, s-maxage=8, stale-while-revalidate=2",
    },
  })
}
