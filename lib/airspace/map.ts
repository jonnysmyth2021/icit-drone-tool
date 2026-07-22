import type * as L from "leaflet"

import type { RestrictionCollection, RestrictionProperties } from "./types"

export async function loadAirspaceBounds(
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  categories: string[],
) {
  const params = new URLSearchParams({
    minLon: String(bounds.minLon),
    minLat: String(bounds.minLat),
    maxLon: String(bounds.maxLon),
    maxLat: String(bounds.maxLat),
    categories: categories.join(","),
  })
  const response = await fetch(`/api/airspace?${params}`, { credentials: "same-origin" })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Airspace request failed (${response.status}).`)
  }
  return response.json() as Promise<RestrictionCollection>
}

function value(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value} m`
  return typeof value === "string" && value ? value : "—"
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function popupHtml(properties: RestrictionProperties) {
  const limits = properties.verticalLimits
  const vertical = limits
    ? `${value(limits.lowerLabel ?? limits.lowerMetres)} – ${value(limits.upperLabel ?? limits.upperMetres)}`
    : "Not published"
  return `<div style="min-width:240px;line-height:1.45">
    <strong style="font-size:14px">${escapeHtml(properties.name)}</strong>
    <div style="margin-top:6px;font-size:12px">
      <div><b>Authority:</b> ${escapeHtml(properties.authority)}</div>
      <div><b>Type:</b> ${escapeHtml(properties.subCategory.replaceAll("_", " "))}</div>
      <div><b>Legal status:</b> ${escapeHtml(properties.legalStatus)}</div>
      <div><b>Effective:</b> ${escapeHtml(value(properties.effectiveFrom))} – ${escapeHtml(value(properties.effectiveUntil))}</div>
      <div><b>Vertical limits:</b> ${escapeHtml(vertical)}</div>
      <div><b>Reference:</b> ${escapeHtml(properties.referenceNumber)}</div>
      <div><b>Risk:</b> ${escapeHtml(properties.riskLevel)}</div>
      <div><b>Source:</b> ${escapeHtml(properties.authority)} / ${escapeHtml(properties.sourceVersion)}</div>
      <div><b>Source version:</b> ${escapeHtml(properties.sourceVersion)}</div>
      <div><b>Last updated:</b> ${escapeHtml(properties.lastUpdated)}</div>
      ${properties.notes ? `<div style="margin-top:6px"><b>Guidance:</b> ${escapeHtml(properties.notes)}</div>` : ""}
    </div>
  </div>`
}

export function buildCanonicalAirspaceLayer(
  leaflet: typeof import("leaflet"),
  collection: RestrictionCollection,
): L.GeoJSON {
  return leaflet.geoJSON(collection as GeoJSON.GeoJsonObject, {
    style: (feature) => {
      const properties = feature?.properties as RestrictionProperties
      return {
        color: properties.colour,
        weight: properties.recordType === "temporary" ? 3 : 2,
        opacity: 0.95,
        fillColor: properties.colour,
        fillOpacity: properties.recordType === "temporary" ? 0.22 : 0.13,
        dashArray: properties.recordType === "temporary" ? "7 5" : undefined,
      }
    },
    onEachFeature: (feature, layer) => {
      const properties = feature.properties as RestrictionProperties
      layer.bindTooltip(`${escapeHtml(properties.name)} · ${escapeHtml(properties.riskLevel)}`, { sticky: true })
      layer.bindPopup(popupHtml(properties), { maxWidth: 360 })
      layer.on({
        mouseover: () => (layer as L.Path).setStyle?.({ weight: 4, fillOpacity: 0.25 }),
        mouseout: () => (layer as L.Path).setStyle?.({
          weight: properties.recordType === "temporary" ? 3 : 2,
          fillOpacity: properties.recordType === "temporary" ? 0.22 : 0.13,
        }),
        click: () => (layer as L.Path).setStyle?.({ weight: 5, opacity: 1 }),
      })
    },
  })
}
