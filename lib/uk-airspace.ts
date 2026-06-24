/**
 * Real UK airspace restriction geometry.
 *
 * Source: the open-source UK AIP airspace dataset (ahsparrow/airspace), released
 * to the public domain (CC0) and sourced from the UK Aeronautical Information
 * Package. Converted from YAIXM to GeoJSON by `scripts/convert-airspace.mjs`,
 * with circles and arcs expanded into true polygon boundaries — this is the same
 * underlying airspace that drives open UK drone/gliding pre-flight tools.
 *
 * Note: the dataset excludes airspace above FL195, offshore airspace and
 * Northern Ireland. It is for situational awareness and is NOT a substitute for
 * an official CAA pre-flight check.
 */

import type * as L from "leaflet"

export interface AirspaceProperties {
  name: string
  id?: string
  type: string
  localtype?: string | null
  class?: string | null
  upper?: string | null
  lower?: string | null
}

export type AirspaceFeature = GeoJSON.Feature<GeoJSON.Polygon, AirspaceProperties>
export type AirspaceCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, AirspaceProperties>

/** Broad category used for colour-coding the many AIP airspace types. */
export type AirspaceCategory =
  | "prohibited"
  | "restricted"
  | "danger"
  | "controlled"
  | "atz"
  | "other"

export const AIRSPACE_CATEGORY_COLOR: Record<AirspaceCategory, string> = {
  prohibited: "#dc2626", // deep red — no-fly
  restricted: "#f43f5e", // rose — restricted
  danger: "#f97316", // orange — danger areas / ranges
  controlled: "#3b82f6", // blue — CTA / CTR / TMA
  atz: "#06b6d4", // cyan — aerodrome traffic zones (FRZ basis)
  other: "#eab308", // amber — MATZ, gliding, RMZ/TMZ, etc.
}

export const AIRSPACE_CATEGORY_LABEL: Record<AirspaceCategory, string> = {
  prohibited: "Prohibited area",
  restricted: "Restricted area",
  danger: "Danger area / range",
  controlled: "Controlled airspace (CTR/CTA/TMA)",
  atz: "Aerodrome Traffic Zone",
  other: "MATZ / gliding / other",
}

/** Map a raw AIP airspace type to a display category. */
export function categoryFor(type: string): AirspaceCategory {
  switch (type) {
    case "P":
      return "prohibited"
    case "R":
      return "restricted"
    case "D":
    case "D_OTHER":
      return "danger"
    case "CTA":
    case "CTR":
    case "TMA":
      return "controlled"
    case "ATZ":
      return "atz"
    default:
      return "other"
  }
}

let cache: Promise<AirspaceCollection> | null = null

/** Fetch the converted airspace GeoJSON once and cache the promise. */
export function loadUkAirspace(): Promise<AirspaceCollection> {
  if (!cache) {
    cache = fetch("/uk-airspace.geojson").then((r) => {
      if (!r.ok) throw new Error(`Failed to load airspace data: ${r.status}`)
      return r.json() as Promise<AirspaceCollection>
    })
  }
  return cache
}

function tooltipHtml(p: AirspaceProperties): string {
  const cat = categoryFor(p.type)
  const kind = p.localtype ? `${p.type} / ${p.localtype}` : p.type
  const limits =
    p.lower || p.upper ? `<br/>${p.lower ?? "SFC"} – ${p.upper ?? "—"}` : ""
  return (
    `<strong>${p.name}</strong>` +
    `<br/><span style="opacity:0.8">${AIRSPACE_CATEGORY_LABEL[cat]} · ${kind}</span>` +
    limits
  )
}

/**
 * Build a styled Leaflet GeoJSON layer for the airspace dataset. Each polygon is
 * coloured by category and carries a tooltip with its real name and vertical limits.
 */
export function buildAirspaceLayer(
  leaflet: typeof import("leaflet"),
  data: AirspaceCollection,
): L.GeoJSON {
  return leaflet.geoJSON(data as GeoJSON.GeoJsonObject, {
    style: (feature) => {
      const props = (feature?.properties ?? {}) as AirspaceProperties
      const color = AIRSPACE_CATEGORY_COLOR[categoryFor(props.type)]
      return {
        color,
        weight: 1.5,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.12,
      }
    },
    onEachFeature: (feature, layer) => {
      const props = (feature.properties ?? {}) as AirspaceProperties
      layer.bindTooltip(tooltipHtml(props), { sticky: true })
    },
  })
}

/**
 * Build a styled Leaflet GeoJSON layer for NSA Prohibited Place zones only
 * (type="P" in the AIP dataset). These are rendered with emphasised styling
 * (thicker borders, more prominent red).
 */
export function buildNsaProhibitedLayer(
  leaflet: typeof import("leaflet"),
  data: AirspaceCollection,
): L.GeoJSON {
  const prohibited = {
    type: "FeatureCollection" as const,
    features: data.features.filter((f) => f.properties.type === "P"),
  } as AirspaceCollection

  return leaflet.geoJSON(prohibited as GeoJSON.GeoJsonObject, {
    style: () => ({
      color: "#991b1b", // dark red, very prominent
      weight: 2.5, // thicker than general airspace
      opacity: 0.95,
      fillColor: "#dc2626",
      fillOpacity: 0.18,
      dashArray: "3, 3", // dash pattern to distinguish from FRZ
    }),
    onEachFeature: (feature, layer) => {
      const props = (feature.properties ?? {}) as AirspaceProperties
      const limits =
        props.lower || props.upper ? `<br/>${props.lower ?? "SFC"} – ${props.upper ?? "—"}` : ""
      const html =
        `<strong>${props.name}</strong><br/><span style="opacity:0.8">NSA Prohibited Place</span>` + limits
      layer.bindTooltip(html, { sticky: true })
    },
  })
}
