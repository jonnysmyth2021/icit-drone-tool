"use client"

import "leaflet/dist/leaflet.css"

import type * as L from "leaflet"
import { useEffect, useRef } from "react"
import type { AircraftMatch, ReportLocation } from "@/lib/types"

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

const ALTITUDE_BANDS = [
  { maxFeet: 2_000, color: "#ef4444" },
  { maxFeet: 10_000, color: "#f97316" },
  { maxFeet: 20_000, color: "#facc15" },
  { maxFeet: 30_000, color: "#22d3ee" },
  { maxFeet: Number.POSITIVE_INFINITY, color: "#a78bfa" },
] as const

function aircraftColor(altitudeM: number | null) {
  if (altitudeM == null) return "#94a3b8"
  const altitudeFeet = altitudeM * 3.28084
  return ALTITUDE_BANDS.find((band) => altitudeFeet < band.maxFeet)?.color ?? "#94a3b8"
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }
    return entities[character]
  })
}

function aircraftIconHtml(aircraft: AircraftMatch) {
  const color = aircraftColor(aircraft.altitude)
  const heading = aircraft.heading ?? 0
  const label = escapeHtml(aircraft.callsign || aircraft.registration || aircraft.icao24)
  return `<div style="position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center;">
    <svg viewBox="0 0 24 24" width="38" height="38" style="transform:rotate(${heading}deg);filter:drop-shadow(0 2px 3px rgba(0,0,0,0.9));">
      <path fill="${color}" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round" d="M12 2c.7 0 1.2.9 1.2 2.2v4.3l8 4.7v2l-8-2.4v4.5l2.2 1.6v1.6L12 19.8l-3.4 1.5v-1.6l2.2-1.6v-4.5l-8 2.4v-2l8-4.7V4.2C10.8 2.9 11.3 2 12 2z"/>
    </svg>
    <span style="position:absolute;left:50%;top:44px;transform:translateX(-50%);white-space:nowrap;border:1px solid rgba(255,255,255,.35);border-radius:4px;background:rgba(3,7,18,.86);padding:2px 5px;color:#fff;font:600 10px ui-monospace,monospace;box-shadow:0 1px 3px rgba(0,0,0,.5);">${label}</span>
  </div>`
}

/** Read-only visual of the aircraft positions persisted with the report. */
export function AircraftSnapshotMap({
  location,
  aircraft,
}: {
  location: ReportLocation
  aircraft: AircraftMatch[]
}) {
  const element = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!element.current || mapRef.current) return
      const leaflet = (await import("leaflet")).default
      if (cancelled || !element.current || mapRef.current) return

      const map = leaflet.map(element.current, {
        zoomControl: true,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: true,
        touchZoom: true,
      })
      leaflet.tileLayer(ESRI_IMAGERY, { maxZoom: 19 }).addTo(map)

      const points: L.LatLngExpression[] = [[location.lat, location.lng]]
      leaflet
        .circleMarker([location.lat, location.lng], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 1,
        })
        .bindTooltip("Sighting location")
        .addTo(map)

      for (const item of aircraft) {
        const icon = leaflet.divIcon({
          className: "",
          html: aircraftIconHtml(item),
          iconSize: [52, 64],
          iconAnchor: [26, 26],
        })
        leaflet
          .marker([item.latitude, item.longitude], { icon })
          .bindTooltip(
            `${item.callsign || item.icao24} · ${item.distanceKm} km${
              item.altitude == null ? "" : ` · ${Math.round(item.altitude * 3.28084).toLocaleString()} ft`
            }`,
          )
          .addTo(map)
        points.push([item.latitude, item.longitude])
      }

      map.fitBounds(leaflet.latLngBounds(points), { padding: [42, 42], maxZoom: 13 })
      mapRef.current = map
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [aircraft, location])

  return (
    <div
      ref={element}
      className="h-64 w-full"
      role="img"
      aria-label={`Map snapshot showing the sighting location and ${aircraft.length} nearby aircraft`}
    />
  )
}
