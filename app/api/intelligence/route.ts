import { NextResponse } from "next/server"
import { fetchOpenSkyStates } from "@/lib/opensky"
import type {
  AircraftMatch,
  AstronomyMatch,
  IntelligenceAssessment,
  Verdict,
} from "@/lib/types"

export const dynamic = "force-dynamic"

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function fetchWithTimeout(url: string, ms = 7000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function getAircraft(lat: number, lng: number) {
  // ~28km bounding box around the observer.
  const d = 0.25
  const { states } = await fetchOpenSkyStates({
    lamin: lat - d,
    lomin: lng - d,
    lamax: lat + d,
    lomax: lng + d,
  })
  if (!states) return { aircraft: null as AircraftMatch[] | null }
  const aircraft: AircraftMatch[] = states
    .map((s) => {
      const lon = s[5] as number | null
      const la = s[6] as number | null
      if (la == null || lon == null) return null
      return {
        icao24: String(s[0] ?? "").trim(),
        callsign: String(s[1] ?? "").trim() || "—",
        origin: String(s[2] ?? "").trim() || "Unknown",
        distanceKm: Number(haversineKm(lat, lng, la, lon).toFixed(1)),
        altitudeM: (s[13] as number | null) ?? (s[7] as number | null),
        velocityMs: (s[9] as number | null) ?? null,
        headingDeg: (s[10] as number | null) ?? null,
        lat: la,
        lng: lon,
      } as AircraftMatch
    })
    .filter((a): a is AircraftMatch => a !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 6)
  return { aircraft }
}

async function getIss(lat: number, lng: number): Promise<AstronomyMatch[]> {
  const data = await fetchWithTimeout("https://api.wheretheiss.at/v1/satellites/25544")
  const matches: AstronomyMatch[] = []
  if (data && typeof data.latitude === "number") {
    const groundKm = haversineKm(lat, lng, data.latitude, data.longitude)
    matches.push({
      body: "International Space Station",
      type: "satellite",
      distanceKm: Number(groundKm.toFixed(0)),
      note:
        groundKm < 1200
          ? `ISS ground track is ${groundKm.toFixed(0)} km away (~${Math.round(
              data.altitude,
            )} km up) — potentially overhead and visible as a fast-moving steady light.`
          : `ISS is ${groundKm.toFixed(0)} km away — not currently overhead.`,
    })
  }
  return matches
}

function getCelestial(lat: number, lng: number): AstronomyMatch[] {
  // Rough local solar hour to decide if the sky is dark.
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60
  const localSolar = (utcHour + lng / 15 + 24) % 24
  const isDark = localSolar < 6 || localSolar > 19
  if (!isDark) return []
  return [
    {
      body: "Bright planets / stars",
      type: "planet",
      note: "Sky is dark at this location. Bright steady points (Venus, Jupiter, Sirius) can be mistaken for stationary drone lights.",
    },
  ]
}

function buildVerdict(
  aircraft: AircraftMatch[],
  astronomy: AstronomyMatch[],
): { verdict: Verdict; confidence: number; summary: string } {
  const closest = aircraft[0]
  const issOverhead = astronomy.some(
    (a) => a.type === "satellite" && (a.distanceKm ?? Infinity) < 1200,
  )

  if (closest && closest.distanceKm <= 4) {
    return {
      verdict: "possible_aircraft",
      confidence: Math.min(0.92, 0.6 + (4 - closest.distanceKm) * 0.08),
      summary: `Tracked aircraft ${closest.callsign} is only ${closest.distanceKm} km away${
        closest.altitudeM ? ` at ${Math.round(closest.altitudeM)} m` : ""
      }. The sighting may be crewed aviation rather than a drone.`,
    }
  }
  if (issOverhead) {
    return {
      verdict: "possible_astronomical",
      confidence: 0.55,
      summary:
        "The ISS ground track is close to this location. A single, steadily moving light could be the space station.",
    }
  }
  if (closest && closest.distanceKm <= 12) {
    return {
      verdict: "inconclusive",
      confidence: 0.45,
      summary: `Nearest tracked aircraft is ${closest.distanceKm} km away — far enough that a low, manoeuvring object is more consistent with a drone, but aviation cannot be fully ruled out.`,
    }
  }
  return {
    verdict: "likely_drone",
    confidence: 0.78,
    summary:
      "No crewed aircraft are operating close to the sighting and no bright satellite is overhead. The observation is consistent with an uncrewed aircraft (drone).",
  }
}

export async function POST(request: Request) {
  let lat = 51.5072
  let lng = -0.1276
  try {
    const body = await request.json()
    if (typeof body.lat === "number") lat = body.lat
    if (typeof body.lng === "number") lng = body.lng
  } catch {
    // use defaults
  }

  const sources: IntelligenceAssessment["dataSources"] = []

  const { aircraft } = await getAircraft(lat, lng)
  sources.push({ name: "OpenSky aircraft network", status: aircraft ? "ok" : "fallback" })

  const iss = await getIss(lat, lng)
  sources.push({ name: "ISS tracking (wheretheiss.at)", status: iss.length ? "ok" : "fallback" })

  const celestial = getCelestial(lat, lng)
  sources.push({ name: "Night-sky / celestial check", status: "ok" })

  const aircraftSafe = aircraft ?? []
  const astronomy = [...iss, ...celestial]
  const { verdict, confidence, summary } = buildVerdict(aircraftSafe, astronomy)

  const assessment: IntelligenceAssessment = {
    verdict,
    confidence: Number(confidence.toFixed(2)),
    summary,
    aircraftNearby: aircraftSafe,
    astronomyMatches: astronomy,
    generatedAt: new Date().toISOString(),
    dataSources: sources,
  }

  return NextResponse.json(assessment)
}
