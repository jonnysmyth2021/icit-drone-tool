"use server"

import { createClient } from "@/lib/supabase/server"
import type { DroneReport, EvidenceItem, ReportStatus } from "@/lib/types"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type ReportRow = {
  id: string
  created_at: string
  user_id: string | null
  remote_id: { reference?: string } | string | null
  type: string | null
  height: string | null
  has_lights: boolean | null
  lights_visible: boolean | null
  light_colors: DroneReport["lightColors"] | null
  latitude: number | null
  longitude: number | null
  location: DroneReport["location"] | null
  status: string | null
  observation: Record<string, unknown> | null
  map_context: Record<string, unknown> | null
  intelligence_summary: Record<string, unknown> | null
}

type MediaRow = {
  id: string
  report_id: string
  file_path: string
  file_type: string
  mime_type: string
  file_size: number | null
  created_at: string
  metadata: Record<string, unknown> | null
}

type EnrichmentRow = {
  report_id: string
  classification: string | null
  confidence: number | null
  source: string | null
  created_at: string
  airspace: Record<string, unknown> | null
  astronomy: Record<string, unknown> | null
  assessment: Record<string, unknown> | null
}

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error("You must be signed in to access reports.")
  return { supabase, user: data.user }
}

async function isReviewer(supabase: SupabaseClient, userId: string, metadataRole: unknown) {
  const { data } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  if (data) return data.role === "reviewer" || data.role === "admin"
  return metadataRole === "admin" || metadataRole === "reviewer"
}

function dataUrlToUpload(item: EvidenceItem) {
  const match = item.preview.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") }
}

async function saveMedia(
  supabase: SupabaseClient,
  userId: string,
  reportId: string,
  evidence: EvidenceItem[],
) {
  for (const item of evidence) {
    const upload = dataUrlToUpload(item)
    if (!upload) continue

    const extension = upload.mimeType === "image/png" ? "png" : "jpg"
    const filePath = `${userId}/${reportId}/${item.id}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from("report-media")
      .upload(filePath, upload.bytes, { contentType: upload.mimeType, upsert: false })
    if (uploadError) throw new Error(`Unable to upload ${item.fileName}: ${uploadError.message}`)

    const { error: mediaError } = await supabase.from("report_media").insert({
      report_id: reportId,
      user_id: userId,
      file_path: filePath,
      file_type: item.kind,
      mime_type: upload.mimeType,
      file_size: upload.bytes.byteLength,
      metadata: {
        ...item.metadata,
        evidenceId: item.id,
        filename: item.fileName,
        originalMimeType: item.mimeType,
        originalSizeBytes: item.sizeBytes,
        source: item.source,
        capturedAt: item.capturedAt,
      },
    })
    if (mediaError) throw new Error(`Unable to register ${item.fileName}: ${mediaError.message}`)
  }
}

export async function createReport(report: DroneReport): Promise<{ ok: true }> {
  const { supabase, user } = await getAuthenticatedUser()
  const location = report.location
  const intelligence = report.intelligence

  const { error } = await supabase.from("reports").insert({
    id: report.id,
    user_id: user.id,
    reporter_id: user.id,
    remote_id: { reference: report.reference },
    type: report.droneType,
    height: report.altitude,
    has_lights: report.lightsVisible === "Yes",
    lights_visible: report.lightsVisible === "Yes",
    light_colors: report.lightColors,
    latitude: location.lat,
    longitude: location.lng,
    location,
    status: "submitted",
    submitted_at: report.createdAt,
    observation: {
      approximateAltitude: report.altitude,
      lightsVisible: report.lightsVisible,
      lightColors: report.lightColors,
      droneType: report.droneType,
    },
    map_context: {
      reporterPosition: { lat: location.lat, lng: location.lng, accuracy: location.accuracy },
      sightingDirection: location.bearing,
      deviceHeading: location.deviceHeading,
    },
    intelligence_summary: intelligence
      ? {
          classification: intelligence.verdict,
          confidence: intelligence.confidence,
          summary: intelligence.summary,
          generatedAt: intelligence.generatedAt,
          dataSources: intelligence.dataSources,
        }
      : null,
  })

  if (error) throw new Error(`Unable to save report: ${error.message}`)

  await saveMedia(supabase, user.id, report.id, report.evidence)

  if (intelligence) {
    const { error: enrichmentError } = await supabase.from("report_enrichment").insert({
      report_id: report.id,
      source: "icit-intelligence-v1",
      classification: intelligence.verdict,
      confidence: intelligence.confidence,
      priority: intelligence.confidence >= 0.75 ? "high" : "medium",
      recommended_action:
        intelligence.verdict === "likely_drone"
          ? "Prioritise reviewer validation"
          : "Review supporting evidence",
      airspace: { nearby_flights: intelligence.aircraftNearby },
      astronomy: { matches: intelligence.astronomyMatches },
      assessment: intelligence,
      enrichment_version: "1.0",
    })
    if (enrichmentError) {
      throw new Error(`Report saved, but intelligence enrichment failed: ${enrichmentError.message}`)
    }
  }

  return { ok: true }
}

function toAppStatus(status: string | null): ReportStatus {
  if (status === "Validated" || status === "confirmed") return "confirmed"
  if (status === "Dismissed" || status === "rejected") return "rejected"
  if (status === "Pending" || status === "reviewing") return "reviewing"
  return "submitted"
}

function toAppAltitude(height: string | null): DroneReport["altitude"] {
  const normalized = height?.toLowerCase()
  if (normalized === "below treeline") return "Below Treeline"
  if (normalized === "at treeline level" || normalized === "treeline height") {
    return "Treeline Height"
  }
  if (normalized === "above treeline") return "Above Treeline"
  if (normalized === "above buildings") return "Above Buildings"
  if (normalized === "high altitude") return "High Altitude"
  return "Unknown"
}

function toIntelligence(row: EnrichmentRow): DroneReport["intelligence"] {
  const assessment = row.assessment ?? {}
  if (typeof assessment.verdict === "string") {
    return assessment as unknown as NonNullable<DroneReport["intelligence"]>
  }

  const classification = row.classification
  const verdict =
    classification === "likely_drone" || classification === "possible_drone"
      ? "likely_drone"
      : classification === "possible_aircraft"
        ? "possible_aircraft"
        : classification === "possible_astronomical"
          ? "possible_astronomical"
          : "inconclusive"
  const nearby = row.airspace?.nearby_flights
  const matches = row.astronomy?.matches

  return {
    verdict,
    confidence: row.confidence ?? 0,
    summary:
      typeof assessment.assessment === "string"
        ? assessment.assessment
        : "Legacy intelligence assessment",
    aircraftNearby: Array.isArray(nearby) ? nearby : [],
    astronomyMatches: Array.isArray(matches) ? matches : [],
    generatedAt: row.created_at,
    dataSources: [{ name: row.source ?? "Legacy enrichment pipeline", status: "ok" }],
  }
}

async function mediaToEvidence(supabase: SupabaseClient, media: MediaRow): Promise<EvidenceItem> {
  const { data } = await supabase.storage.from("report-media").createSignedUrl(media.file_path, 3600)
  const metadata = media.metadata ?? {}
  return {
    id: String(metadata.evidenceId ?? media.id),
    kind: media.file_type === "video" ? "video" : "photo",
    preview: data?.signedUrl ?? "",
    fileName: String(metadata.filename ?? media.file_path.split("/").at(-1) ?? "Evidence"),
    mimeType: String(metadata.originalMimeType ?? media.mime_type),
    sizeBytes: Number(metadata.originalSizeBytes ?? media.file_size ?? 0),
    source: metadata.source === "camera" ? "camera" : "upload",
    capturedAt: String(metadata.capturedAt ?? media.created_at),
    metadata,
  }
}

export async function listReports(): Promise<DroneReport[]> {
  const { supabase, user } = await getAuthenticatedUser()
  if (!(await isReviewer(supabase, user.id, user.app_metadata?.role))) {
    throw new Error("Only reviewers can list submitted reports.")
  }

  const { data: rows, error } = await supabase
    .from("reports")
    .select(
      "id, created_at, user_id, remote_id, type, height, has_lights, lights_visible, light_colors, latitude, longitude, location, status, observation, map_context, intelligence_summary",
    )
    .order("created_at", { ascending: false })
  if (error) throw new Error(`Unable to load reports: ${error.message}`)

  const ids = (rows as ReportRow[]).map((row) => row.id)
  const [{ data: mediaRows }, { data: enrichmentRows }] = ids.length
    ? await Promise.all([
        supabase.from("report_media").select("*").in("report_id", ids),
        supabase
          .from("report_enrichment")
          .select("report_id, classification, confidence, source, created_at, airspace, astronomy, assessment")
          .in("report_id", ids),
      ])
    : [{ data: [] }, { data: [] }]

  const mediaByReport = new Map<string, EvidenceItem[]>()
  for (const media of (mediaRows ?? []) as MediaRow[]) {
    const items = mediaByReport.get(media.report_id) ?? []
    items.push(await mediaToEvidence(supabase, media))
    mediaByReport.set(media.report_id, items)
  }
  const enrichmentByReport = new Map(
    ((enrichmentRows ?? []) as EnrichmentRow[]).map((row) => [row.report_id, toIntelligence(row)]),
  )

  return (rows as ReportRow[]).map((row) => {
    const observation = row.observation ?? {}
    const location = row.location ?? {
      lat: row.latitude ?? 51.5072,
      lng: row.longitude ?? -0.1276,
      accuracy: null,
      bearing: Number(row.map_context?.sightingDirection ?? 0),
      deviceHeading: Number(row.map_context?.deviceHeading ?? 0),
    }
    return {
      id: row.id,
      reference:
        typeof row.remote_id === "string"
          ? row.remote_id
          : row.remote_id?.reference ?? `ICIT-${row.id.slice(0, 8).toUpperCase()}`,
      createdAt: row.created_at,
      reporter: row.user_id ?? "Unknown",
      droneType:
        row.type === "Fixed-Wing" || row.type === "Fixed Wing"
          ? "Fixed Wing"
          : row.type === "Unknown"
            ? "Unknown"
            : "Multi-Rotor",
      lightsVisible:
        observation.lightsVisible === "Unknown"
          ? "Unknown"
          : row.lights_visible ?? row.has_lights
            ? "Yes"
            : "No",
      lightColors: row.light_colors ?? [],
      altitude: toAppAltitude(row.height),
      evidence: mediaByReport.get(row.id) ?? [],
      location,
      intelligence: enrichmentByReport.get(row.id) ?? null,
      status: toAppStatus(row.status),
    }
  })
}

function toDatabaseStatus(status: ReportStatus) {
  if (status === "confirmed") return "Validated"
  if (status === "rejected") return "Dismissed"
  if (status === "reviewing") return "Pending"
  return "submitted"
}

export async function setReportStatus(
  id: string,
  status: ReportStatus,
  reviewerNote?: string,
): Promise<{ ok: true }> {
  const { supabase, user } = await getAuthenticatedUser()
  if (!(await isReviewer(supabase, user.id, user.app_metadata?.role))) {
    throw new Error("Only reviewers can update report status.")
  }

  const { data, error } = await supabase
    .from("reports")
    .update({
      status: toDatabaseStatus(status),
      reviewer_action: status,
      reviewed_at: new Date().toISOString(),
      ...(reviewerNote !== undefined ? { reviewer_notes: reviewerNote } : {}),
    })
    .eq("id", id)
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Unable to update report: ${error?.message ?? "Report not found"}`)
  }
  return { ok: true }
}
