import { NextResponse } from "next/server"

import { fetchOpenSkyStates } from "@/lib/opensky"
import type { AircraftMatch } from "@/lib/types"

export const dynamic = "force-dynamic"

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

  const result = await fetchOpenSkyStates({ lamin, lomin, lamax, lomax })
  if (!result.states) {
    return NextResponse.json(
      { aircraft: [], authenticated: result.authenticated, unavailable: true },
      { status: 503 },
    )
  }

  const aircraft = result.states
    .map((state): AircraftMatch | null => {
      const lng = state[5] as number | null
      const lat = state[6] as number | null
      if (lat == null || lng == null) return null
      return {
        icao24: String(state[0] ?? "").trim(),
        callsign: String(state[1] ?? "").trim() || "Unknown",
        origin: String(state[2] ?? "").trim() || "Unknown",
        distanceKm: 0,
        altitudeM: (state[13] as number | null) ?? (state[7] as number | null),
        velocityMs: (state[9] as number | null) ?? null,
        headingDeg: (state[10] as number | null) ?? null,
        lat,
        lng,
      }
    })
    .filter((aircraft): aircraft is AircraftMatch => aircraft !== null)
    .slice(0, 400)

  return NextResponse.json({
    aircraft,
    authenticated: result.authenticated,
    updatedAt: new Date().toISOString(),
  })
}
