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

  // Defend the upstream service even if an older client sends a very large
  // viewport. A 4° × 4° regional box is ample for the operational map.
  const centerLat = (lamin + lamax) / 2
  const centerLng = (lomin + lomax) / 2
  const safeLamin = Math.max(-90, centerLat - Math.min(2, (lamax - lamin) / 2))
  const safeLamax = Math.min(90, centerLat + Math.min(2, (lamax - lamin) / 2))
  const safeLomin = Math.max(-180, centerLng - Math.min(2, (lomax - lomin) / 2))
  const safeLomax = Math.min(180, centerLng + Math.min(2, (lomax - lomin) / 2))

  const result = await fetchOpenSkyStates({
    lamin: safeLamin,
    lomin: safeLomin,
    lamax: safeLamax,
    lomax: safeLomax,
  })
  if (!result.states) {
    const responseBody = {
      aircraft: [],
      authenticated: result.authenticated,
      credentialsConfigured: result.credentialsConfigured,
      authenticationStatus: result.authenticationStatus,
      unavailable: true,
    }
    console.error(
      JSON.stringify({
        service: "opensky",
        event: "aircraft_api_upstream_unavailable",
        responseBody,
      }),
    )
    return NextResponse.json(responseBody)
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

  const responseBody = {
    aircraft,
    authenticated: result.authenticated,
    credentialsConfigured: result.credentialsConfigured,
    authenticationStatus: result.authenticationStatus,
    updatedAt: new Date().toISOString(),
  }
  console.info(
    JSON.stringify({
      service: "opensky",
      event: "aircraft_api_response",
      aircraftParsed: aircraft.length,
      responseBody,
    }),
  )
  return NextResponse.json(responseBody)
}
