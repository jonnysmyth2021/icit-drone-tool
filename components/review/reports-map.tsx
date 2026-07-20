"use client"

import "leaflet/dist/leaflet.css"

import type * as L from "leaflet"
import { useEffect, useRef, useState } from "react"
import { Check, Flame, Layers, MapPinned, Plane } from "lucide-react"

// leaflet.heat has no bundled types; describe the bits we use.
type HeatPoint = [number, number, number]
type HeatLayer = L.Layer & { setLatLngs: (points: HeatPoint[]) => void }
type LeafletWithHeat = typeof import("leaflet") & {
  heatLayer: (points: HeatPoint[], options?: Record<string, unknown>) => HeatLayer
}

import type { AircraftMatch, DroneReport, Verdict } from "@/lib/types"
import { UK_FLIGHT_RESTRICTION_ZONES, zonesContaining } from "@/lib/uk-frz"
import {
  AIRSPACE_CATEGORY_COLOR,
  AIRSPACE_CATEGORY_LABEL,
  buildAirspaceLayer,
  buildNsaProhibitedLayer,
  loadUkAirspace,
} from "@/lib/uk-airspace"
import {
  SITE_CATEGORIES,
  SITE_CATEGORY_COLOR,
  SITE_CATEGORY_LABEL,
  buildSensitiveSitesLayer,
  loadUkSensitiveSites,
} from "@/lib/uk-sensitive-sites"
import { cn } from "@/lib/utils"

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

const VERDICT_COLOR: Record<Verdict, string> = {
  likely_drone: "#22c55e",
  possible_aircraft: "#f59e0b",
  possible_astronomical: "#3b9eff",
  inconclusive: "#94a3b8",
}

const FRZ_COLOR = "#ef4444"

const LEGEND: { label: string; color: string }[] = [
  { label: "Likely drone", color: VERDICT_COLOR.likely_drone },
  { label: "Possible aircraft", color: VERDICT_COLOR.possible_aircraft },
  { label: "Possible astronomical", color: VERDICT_COLOR.possible_astronomical },
  { label: "Inconclusive", color: VERDICT_COLOR.inconclusive },
]

/** Larger dots when zoomed out (country view), smaller when zoomed in. */
function dotSizeForZoom(zoom: number) {
  const z = Math.max(5, Math.min(18, zoom))
  const t = (z - 5) / (18 - 5)
  return Math.round(20 - t * 12) // 20px → 8px
}

function markerHtml(
  color: string,
  selected: boolean,
  inFrz: boolean,
  zoom: number,
  heading: number | null,
) {
  const size = selected ? dotSizeForZoom(zoom) + 6 : dotSizeForZoom(zoom)
  const coneLen = size * 1.9
  const coneHalf = size * 0.85
  const box = Math.ceil(2 * coneLen + size + 10)
  const ring = selected ? "0 0 0 3px #ffffff, 0 0 0 5px " + color : "0 0 0 2px #ffffff"
  const frzRing = inFrz
    ? `<span style="position:absolute;left:50%;top:50%;width:${size + 14}px;height:${
        size + 14
      }px;transform:translate(-50%,-50%);border-radius:9999px;border:2px dashed ${FRZ_COLOR};"></span>`
    : ""
  const cone =
    heading != null
      ? `<span style="position:absolute;left:50%;top:50%;width:0;height:0;border-left:${coneHalf.toFixed(
          1,
        )}px solid transparent;border-right:${coneHalf.toFixed(
          1,
        )}px solid transparent;border-bottom:${coneLen.toFixed(
          1,
        )}px solid ${color}99;transform-origin:50% 100%;transform:translate(-50%,-100%) rotate(${heading}deg);"></span>`
      : ""
  return `<div style="position:relative;width:${box}px;height:${box}px;">
    ${frzRing}
    ${cone}
    <span style="position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;transform:translate(-50%,-50%);border-radius:9999px;background:${color};box-shadow:${ring},0 1px 3px rgba(0,0,0,0.5);"></span>
  </div>`
}

const AIRCRAFT_COLOR = "#facc15"

/** A top-down plane silhouette (nose pointing up) rotated to the aircraft's true track. */
function aircraftIconHtml(heading: number | null) {
  const rot = heading ?? 0
  return `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:rgba(15,23,42,0.88);border:2px solid ${AIRCRAFT_COLOR};box-shadow:0 2px 8px rgba(0,0,0,0.55);">
    <svg viewBox="0 0 24 24" width="34" height="34" style="transform:rotate(${rot}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.85));">
      <path fill="${AIRCRAFT_COLOR}" stroke="#ffffff" stroke-width="0.65" stroke-linejoin="round" d="M12 2c.7 0 1.2.9 1.2 2.2v4.3l8 4.7v2l-8-2.4v4.5l2.2 1.6v1.6L12 19.8l-3.4 1.5v-1.6l2.2-1.6v-4.5l-8 2.4v-2l8-4.7V4.2C10.8 2.9 11.3 2 12 2z"/>
    </svg>
  </div>`
}

export function ReportsMap({
  reports,
  selectedId,
  onSelect,
}: {
  reports: DroneReport[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const frzRef = useRef<L.LayerGroup | null>(null)
  const heatRef = useRef<HeatLayer | null>(null)
  const aircraftRef = useRef<L.LayerGroup | null>(null)
  const aircraftFittedRef = useRef(false)
  const uasRef = useRef<L.GeoJSON | null>(null)
  const showUasRef = useRef(false)
  const nsaRef = useRef<L.GeoJSON | null>(null)
  const showNsaRef = useRef(false)
  const sitesRef = useRef<L.GeoJSON | null>(null)
  const showSitesRef = useRef(false)
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [showFrz, setShowFrz] = useState(true)
  const [showHeat, setShowHeat] = useState(false)
  const [showAircraft, setShowAircraft] = useState(true)
  const [showUas, setShowUas] = useState(false)
  const [showNsa, setShowNsa] = useState(false)
  const [showSites, setShowSites] = useState(false)
  const [aircraftCount, setAircraftCount] = useState<number | null>(null)
  const [liveAircraft, setLiveAircraft] = useState<AircraftMatch[]>([])
  const [aircraftUpdatedAt, setAircraftUpdatedAt] = useState<string | null>(null)
  const [aircraftUnavailable, setAircraftUnavailable] = useState(false)
  const [aircraftViewportRevision, setAircraftViewportRevision] = useState(0)
  const [zoom, setZoom] = useState(5)

  // Init map once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!el.current || mapRef.current) return
      const L = (await import("leaflet")).default
      // leaflet.heat patches L with L.heatLayer().
      await import("leaflet.heat")
      if (cancelled || !el.current || mapRef.current) return
      leafletRef.current = L

      const map = L.map(el.current, { zoomControl: true, attributionControl: false }).setView(
        [54.5, -3],
        5,
      )
      L.tileLayer(ESRI_IMAGERY, { maxZoom: 19, detectRetina: true }).addTo(map)

      // Flight Restriction Zones.
      const frz = L.layerGroup()
      for (const z of UK_FLIGHT_RESTRICTION_ZONES) {
        L.circle([z.lat, z.lng], {
          radius: z.radiusKm * 1000,
          color: FRZ_COLOR,
          weight: 2.5,
          opacity: 0.7,
          fillColor: FRZ_COLOR,
          fillOpacity: 0.1,
        })
          .bindTooltip(`${z.name} FRZ${z.code ? ` (${z.code})` : ""}`, { sticky: true })
          .addTo(frz)
      }
      frz.addTo(map)
      frzRef.current = frz

      // Heatmap layer (off by default; toggled like the FRZ layer).
      heatRef.current = (L as LeafletWithHeat).heatLayer([], {
        radius: 28,
        blur: 22,
        maxZoom: 13,
        minOpacity: 0.35,
        gradient: { 0.2: "#3b9eff", 0.45: "#22c55e", 0.7: "#f59e0b", 1: "#ef4444" },
      })

      // UAS airspace restrictions layer — real UK AIP geometry (off by default).
      // Loaded asynchronously from the converted GeoJSON dataset.
      void loadUkAirspace()
        .then((data) => {
          if (cancelled || !mapRef.current) return
          const uas = buildAirspaceLayer(L, data)
          uasRef.current = uas
          if (showUasRef.current) uas.addTo(map)
          // NSA Prohibited Place zones — built from the same airspace dataset.
          const nsa = buildNsaProhibitedLayer(L, data)
          nsaRef.current = nsa
          if (showNsaRef.current) nsa.addTo(map)
        })
        .catch((err) => console.log("[v0] airspace load failed:", err))

      // Aircraft at report time layer (off by default).
      aircraftRef.current = L.layerGroup()

      // Sensitive sites (prisons, police, MOD) — real OSM points (off by default).
      void loadUkSensitiveSites()
        .then((data) => {
          if (cancelled || !mapRef.current) return
          const sites = buildSensitiveSitesLayer(L, data)
          sitesRef.current = sites
          if (showSitesRef.current) sites.addTo(map)
        })
        .catch((err) => console.log("[v0] sensitive sites load failed:", err))

      markersRef.current = L.layerGroup().addTo(map)
      map.on("zoomend", () => setZoom(map.getZoom()))
      map.on("moveend", () => setAircraftViewportRevision((revision) => revision + 1))
      mapRef.current = map
      setZoom(map.getZoom())
      setReady(true)
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = null
      frzRef.current = null
      heatRef.current = null
      aircraftRef.current = null
      uasRef.current = null
      nsaRef.current = null
      sitesRef.current = null
      fittedRef.current = false
    }
  }, [])

  // Toggle FRZ visibility.
  useEffect(() => {
    const map = mapRef.current
    const frz = frzRef.current
    if (!map || !frz) return
    if (showFrz) frz.addTo(map)
    else map.removeLayer(frz)
  }, [showFrz, ready])

  // Toggle heatmap visibility.
  useEffect(() => {
    const map = mapRef.current
    const heat = heatRef.current
    if (!map || !heat) return
    if (showHeat) heat.addTo(map)
    else map.removeLayer(heat)
  }, [showHeat, ready])

  // Fetch live OpenSky traffic around the current viewport and refresh it.
  useEffect(() => {
    if (!showAircraft || !ready) return
    let cancelled = false

    async function refreshAircraft() {
      const map = mapRef.current
      if (!map) return
      const bounds = map.getBounds()
      const center = bounds.getCenter()
      const latRadius = Math.max(0.25, (bounds.getNorth() - bounds.getSouth()) / 2)
      const lngRadius = Math.max(0.25, (bounds.getEast() - bounds.getWest()) / 2)
      const params = new URLSearchParams({
        lamin: String(center.lat - latRadius),
        lomin: String(center.lng - lngRadius),
        lamax: String(center.lat + latRadius),
        lomax: String(center.lng + lngRadius),
      })
      try {
        const response = await fetch(`/api/aircraft?${params.toString()}`, { cache: "no-store" })
        const data = (await response.json()) as {
          aircraft?: AircraftMatch[]
          updatedAt?: string
        }
        if (cancelled) return
        setLiveAircraft(Array.isArray(data.aircraft) ? data.aircraft : [])
        setAircraftUpdatedAt(data.updatedAt ?? new Date().toISOString())
        setAircraftUnavailable(!response.ok)
      } catch {
        if (!cancelled) setAircraftUnavailable(true)
      }
    }

    const initial = window.setTimeout(() => void refreshAircraft(), 350)
    const interval = window.setInterval(() => void refreshAircraft(), 30_000)
    return () => {
      cancelled = true
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [showAircraft, ready, aircraftViewportRevision])

  // Render the current live aircraft state.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    const layer = aircraftRef.current
    if (!L || !map || !layer) return

    layer.clearLayers()

    if (!showAircraft) {
      map.removeLayer(layer)
      setAircraftCount(null)
      aircraftFittedRef.current = false
      return
    }

    layer.addTo(map)
    let plotted = 0

    for (const a of liveAircraft) {
      if (typeof a.lat !== "number" || typeof a.lng !== "number") continue
        const icon = L.divIcon({
          className: "",
          html: aircraftIconHtml(a.headingDeg),
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        })
        const altFt = a.altitudeM != null ? Math.round(a.altitudeM * 3.281) : null
        const spdKt = a.velocityMs != null ? Math.round(a.velocityMs * 1.944) : null
        L.marker([a.lat, a.lng], { icon, zIndexOffset: 2000 })
          .bindTooltip(
            `<strong>${a.callsign}</strong> · ${a.origin}` +
              (altFt != null ? `<br/>${altFt.toLocaleString()} ft` : "") +
              (spdKt != null ? ` · ${spdKt} kt` : "") +
              `<br/><span style="opacity:0.7">Live OpenSky position</span>` +
              (aircraftUpdatedAt
                ? `<br/><span style="opacity:0.7">Updated ${new Date(aircraftUpdatedAt).toLocaleTimeString("en-GB")}</span>`
                : ""),
            { direction: "top" },
          )
          .addTo(layer)
        plotted++
    }

    setAircraftCount(plotted)

    if (plotted > 0 && !aircraftFittedRef.current) {
      const points = [
        ...reports
          .filter((report) => report.location)
          .map((report) => [report.location.lat, report.location.lng] as [number, number]),
        ...liveAircraft
          .filter((aircraft) => typeof aircraft.lat === "number" && typeof aircraft.lng === "number")
          .map((aircraft) => [aircraft.lat!, aircraft.lng!] as [number, number]),
      ]
      if (points.length > 1) {
        aircraftFittedRef.current = true
        map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 12 })
      }
    }
  }, [showAircraft, liveAircraft, aircraftUpdatedAt, reports, ready])

  // Toggle UAS restrictions layer visibility. The layer may still be loading
  // when this runs, so the load callback also consults showUasRef.
  useEffect(() => {
    showUasRef.current = showUas
    const map = mapRef.current
    const uas = uasRef.current
    if (!map || !uas) return
    if (showUas) uas.addTo(map)
    else map.removeLayer(uas)
  }, [showUas, ready])

  // Toggle NSA prohibited places layer visibility (loaded asynchronously).
  useEffect(() => {
    showNsaRef.current = showNsa
    const map = mapRef.current
    const nsa = nsaRef.current
    if (!map || !nsa) return
    if (showNsa) nsa.addTo(map)
    else map.removeLayer(nsa)
  }, [showNsa, ready])

  // Toggle sensitive-sites layer visibility (loaded asynchronously).
  useEffect(() => {
    showSitesRef.current = showSites
    const map = mapRef.current
    const sites = sitesRef.current
    if (!map || !sites) return
    if (showSites) sites.addTo(map)
    else map.removeLayer(sites)
  }, [showSites, ready])

  // Draw / update report markers.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    const layer = markersRef.current
    if (!L || !map || !layer) return

    layer.clearLayers()
    const points: [number, number][] = []

    for (const r of reports) {
      if (!r.location) continue
      const verdict = r.intelligence?.verdict ?? "inconclusive"
      const color = VERDICT_COLOR[verdict]
      const inFrz = zonesContaining(r.location).length > 0
      const selected = r.id === selectedId
      const heading = r.location.bearing ?? r.location.deviceHeading
      const dot = selected ? dotSizeForZoom(zoom) + 6 : dotSizeForZoom(zoom)
      const box = Math.ceil(2 * (dot * 1.9) + dot + 10)
      const icon = L.divIcon({
        className: "",
        html: markerHtml(color, selected, inFrz, zoom, heading),
        iconSize: [box, box],
        iconAnchor: [box / 2, box / 2],
      })
      const marker = L.marker([r.location.lat, r.location.lng], {
        icon,
        zIndexOffset: selected ? 1000 : 0,
      })
      marker.bindTooltip(`${r.reference} · ${r.droneType}${inFrz ? " · in FRZ" : ""}`)
      marker.on("click", () => onSelect(r.id))
      marker.addTo(layer)
      points.push([r.location.lat, r.location.lng])
    }

    // Update heatmap intensity points (lat, lng, weight).
    heatRef.current?.setLatLngs(points.map(([lat, lng]) => [lat, lng, 0.8] as HeatPoint))

    // Fit to reports the first time we have any.
    if (!fittedRef.current && points.length > 0) {
      if (points.length === 1) {
        // A single sighting: open zoomed right in so the location is legible.
        map.setView(points[0], 16)
      } else {
        const bounds = L.latLngBounds(points)
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 })
      }
      fittedRef.current = true
    }
  }, [reports, selectedId, ready, onSelect, zoom])

  // Fly to the selected report and zoom in close enough to read the ground.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const r = reports.find((x) => x.id === selectedId)
    if (r?.location) {
      const targetZoom = Math.max(map.getZoom(), 17)
      map.flyTo([r.location.lat, r.location.lng], targetZoom, { animate: true, duration: 0.8 })
    }
  }, [selectedId, reports])

  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-border">
      <div ref={el} className="h-[58vh] min-h-80 w-full" />

      <div className="absolute right-3 top-3 z-[500] w-52 rounded-lg border border-border bg-background/85 p-2 shadow-md backdrop-blur">
        <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" />
          Map layers
        </p>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowFrz((s) => !s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              showFrz
                ? "border-destructive/50 bg-destructive/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="size-2.5 shrink-0 rounded-full border-2 border-dashed" style={{ borderColor: FRZ_COLOR }} aria-hidden />
            <span className="flex-1 text-left">Flight Restriction Zones</span>
            <Check
              className={cn("size-3.5 shrink-0 transition-opacity", showFrz ? "opacity-100" : "opacity-0")}
              aria-hidden={!showFrz}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowHeat((s) => !s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              showHeat
                ? "border-accent/60 bg-accent/25 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <Flame className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">Sighting heatmap</span>
            <Check
              className={cn("size-3.5 shrink-0 transition-opacity", showHeat ? "opacity-100" : "opacity-0")}
              aria-hidden={!showHeat}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowAircraft((s) => !s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              showAircraft
                ? "border-primary/60 bg-primary/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <Plane className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">
              Live aircraft
              {showAircraft && aircraftCount != null && (
                <span className="ml-1 text-muted-foreground">({aircraftCount})</span>
              )}
              {showAircraft && aircraftUnavailable ? (
                <span className="ml-1 text-destructive">unavailable</span>
              ) : null}
            </span>
            <Check
              className={cn("size-3.5 shrink-0 transition-opacity", showAircraft ? "opacity-100" : "opacity-0")}
              aria-hidden={!showAircraft}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowUas((s) => !s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              showUas
                ? "border-blue-500/60 bg-blue-500/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">UAS Airspace</span>
            <Check
              className={cn("size-3.5 shrink-0 transition-opacity", showUas ? "opacity-100" : "opacity-0")}
              aria-hidden={!showUas}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowNsa((s) => !s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              showNsa
                ? "border-red-500/60 bg-red-500/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">NSA Prohibited</span>
            <Check
              className={cn("size-3.5 shrink-0 transition-opacity", showNsa ? "opacity-100" : "opacity-0")}
              aria-hidden={!showNsa}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowSites((s) => !s)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              showSites
                ? "border-emerald-500/60 bg-emerald-500/20 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <MapPinned className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">Sensitive sites</span>
            <Check
              className={cn("size-3.5 shrink-0 transition-opacity", showSites ? "opacity-100" : "opacity-0")}
              aria-hidden={!showSites}
            />
          </button>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-[500] rounded-md border border-border bg-background/85 p-2.5 text-[11px] shadow-md backdrop-blur">
        <p className="mb-1.5 font-medium text-muted-foreground">Sighting verdict</p>
        <ul className="flex flex-col gap-1">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className="text-foreground">{item.label}</span>
            </li>
          ))}
          <li className="mt-1 flex items-center gap-1.5 border-t border-border pt-1.5">
            <span
              className="size-2.5 rounded-full border-2 border-dashed"
              style={{ borderColor: FRZ_COLOR }}
              aria-hidden
            />
            <span className="text-foreground">Inside FRZ</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="size-0"
              style={{
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderBottom: "9px solid #94a3b8",
              }}
              aria-hidden
            />
            <span className="text-foreground">Heading toward drone</span>
          </li>
          {showAircraft && (
            <li className="flex items-center gap-1.5">
              <Plane className="size-3 text-foreground" aria-hidden />
              <span className="text-foreground">Live aircraft (OpenSky)</span>
            </li>
          )}
          {showUas && (
            <>
              {(
                ["controlled", "atz", "danger", "restricted", "prohibited", "other"] as const
              ).map((cat) => (
                <li key={cat} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: AIRSPACE_CATEGORY_COLOR[cat] }}
                    aria-hidden
                  />
                  <span className="text-foreground">{AIRSPACE_CATEGORY_LABEL[cat]}</span>
                </li>
              ))}
            </>
          )}
          {showSites && (
            <>
              {SITE_CATEGORIES.map((cat) => (
                <li key={cat} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full border border-[#0b1220]"
                    style={{ backgroundColor: SITE_CATEGORY_COLOR[cat] }}
                    aria-hidden
                  />
                  <span className="text-foreground">{SITE_CATEGORY_LABEL[cat]}</span>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
