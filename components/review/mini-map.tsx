"use client"

import "leaflet/dist/leaflet.css"

import type * as L from "leaflet"
import { useEffect, useRef } from "react"
import type { ReportLocation } from "@/lib/types"

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

export function MiniMap({ location }: { location: ReportLocation }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!el.current || mapRef.current) return
      const L = (await import("leaflet")).default
      if (cancelled || !el.current || mapRef.current) return

      const map = L.map(el.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
      }).setView([location.lat, location.lng], 16)
      L.tileLayer(ESRI_IMAGERY, { maxZoom: 19 }).addTo(map)

      const heading = location.bearing ?? location.deviceHeading ?? 0
      const icon = L.divIcon({
        className: "",
        html: `<div class="user-location-marker" style="--heading:${heading}deg">
          <div class="accuracy-pulse"></div>
          <div class="heading-cone"></div>
          <div class="location-dot"></div>
        </div>`,
        iconSize: [64, 64],
        iconAnchor: [32, 32],
      })
      L.marker([location.lat, location.lng], { icon }).addTo(map)
      mapRef.current = map
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [location])

  return <div ref={el} className="h-44 w-full" />
}
