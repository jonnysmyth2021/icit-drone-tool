import { NextResponse } from "next/server"
import { fetchOpenSkyStates } from "@/lib/opensky"
import type {
  AircraftMatch,
  AstronomyMatch,
  IntelligenceAssessment,
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

type AiAssessment = Pick<
  IntelligenceAssessment,
  "verdict" | "confidence" | "summary" | "probabilities" | "reasoningFactors" | "recommendedAction"
>

async function assessWithOpenAI(input: Record<string, unknown>): Promise<AiAssessment> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_INTELLIGENCE_MODEL ?? "gpt-5.4-mini",
        store: false,
        input: [
          {
            role: "system",
            content:
              "You are an aviation safety intelligence classifier for reported drone sightings. " +
              "Assess only the supplied observations and grounded external data. Compare four hypotheses: " +
              "uncrewed aircraft (drone), tracked crewed aircraft, astronomical object, and insufficient evidence. " +
              "Do not treat missing provider data as evidence for a drone. Account for aircraft distance, altitude, " +
              "heading and speed; observer bearing and altitude estimate; reported lights; timing; astronomy; and source health. " +
              "Probabilities must be calibrated, sum approximately to 1, and uncertainty must remain high when evidence is sparse. " +
              "The verdict must match the strongest supported hypothesis, using inconclusive when evidence is not discriminating. " +
              "Write a concise operational summary and concrete reviewer action. Never claim certainty or identify an object without evidence.",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "drone_intelligence_assessment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                verdict: {
                  type: "string",
                  enum: [
                    "likely_drone",
                    "possible_aircraft",
                    "possible_astronomical",
                    "inconclusive",
                  ],
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                probabilities: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    drone: { type: "number", minimum: 0, maximum: 1 },
                    aircraft: { type: "number", minimum: 0, maximum: 1 },
                    astronomical: { type: "number", minimum: 0, maximum: 1 },
                    inconclusive: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["drone", "aircraft", "astronomical", "inconclusive"],
                },
                summary: { type: "string" },
                reasoningFactors: {
                  type: "array",
                  minItems: 2,
                  maxItems: 6,
                  items: { type: "string" },
                },
                recommendedAction: { type: "string" },
              },
              required: [
                "verdict",
                "confidence",
                "probabilities",
                "summary",
                "reasoningFactors",
                "recommendedAction",
              ],
            },
          },
        },
      }),
    })

    const result = (await response.json()) as {
      error?: { message?: string }
      output?: { content?: { type?: string; text?: string }[] }[]
    }
    if (!response.ok) throw new Error(result.error?.message ?? "OpenAI assessment failed.")
    const outputText = result.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text")?.text
    if (!outputText) throw new Error("OpenAI returned no structured assessment.")
    return JSON.parse(outputText) as AiAssessment
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  let lat = 51.5072
  let lng = -0.1276
  let observation: Record<string, unknown> = {}
  try {
    const body = await request.json()
    if (typeof body.lat === "number") lat = body.lat
    if (typeof body.lng === "number") lng = body.lng
    if (body.observation && typeof body.observation === "object") observation = body.observation
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
  let ai: AiAssessment
  try {
    ai = await assessWithOpenAI({
      sighting: {
        location: { lat, lng },
        observedAt: new Date().toISOString(),
        ...observation,
      },
      aircraft: aircraftSafe,
      astronomy,
      sourceHealth: sources,
    })
    sources.push({ name: "OpenAI grounded classifier", status: "ok" })
  } catch (error) {
    console.error("[intelligence] OpenAI assessment failed", error)
    sources.push({ name: "OpenAI grounded classifier", status: "error" })
    return NextResponse.json(
      {
        error: "AI assessment is temporarily unavailable. Please retry.",
        dataSources: sources,
      },
      { status: 503 },
    )
  }

  const assessment: IntelligenceAssessment = {
    ...ai,
    confidence: Number(ai.confidence.toFixed(2)),
    aircraftNearby: aircraftSafe,
    astronomyMatches: astronomy,
    generatedAt: new Date().toISOString(),
    dataSources: sources,
  }

  return NextResponse.json(assessment)
}
