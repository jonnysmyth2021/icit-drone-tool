"use client"

import "leaflet/dist/leaflet.css"

import type * as L from "leaflet"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Compass, Crosshair, Layers, Loader2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReportLocation } from "@/lib/types"
import { cn } from "@/lib/utils"
import { UK_FLIGHT_RESTRICTION_ZONES } from "@/lib/uk-frz"
import { buildAirspaceLayer, buildNsaProhibitedLayer, loadUkAirspace } from "@/lib/uk-airspace"
import { buildSensitiveSitesLayer, loadUkSensitiveSites } from "@/lib/uk-sensitive-sites"
import { buildCanonicalAirspaceLayer, loadAirspaceBounds } from "@/lib/airspace/map"
import { StepShell } from "./step-shell"

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

const FRZ_COLOR = "#ef4444"

const AIRSPACE_LAYER_OPTIONS = [
  { id: "frz", label: "FRZ", categories: ["frz"], color: "#ef4444" },
  { id: "notam", label: "NOTAM", categories: ["notam", "temporary_aviation"], color: "#f97316" },
  { id: "military", label: "Military", categories: ["military"], color: "#16a34a" },
  { id: "police", label: "Police", categories: ["police", "police_air_operation"], color: "#2563eb" },
  { id: "prison", label: "Prison", categories: ["prison"], color: "#a855f7" },
  { id: "critical", label: "Critical", categories: ["critical_infrastructure"], color: "#dc2626" },
  { id: "airports", label: "Airports", categories: ["airport", "aerodrome"], color: "#06b6d4" },
  { id: "utilities", label: "Utilities", categories: ["power_station", "substation", "water_treatment", "reservoir", "oil_gas", "telecom"], color: "#eab308" },
  { id: "environmental", label: "Environmental", categories: ["advisory"], color: "#22c55e" },
] as const

const MARKER_HTML = `
  <div class="user-location-marker" style="--heading:0deg">
    <div class="accuracy-pulse"></div>
    <div class="heading-cone"></div>
    <div class="location-dot"></div>
  </div>`

export function StepLocation({
  stepIndex,
  stepCount,
  value,
  onChange,
  onContinue,
  onBack,
}: {
  stepIndex: number
  stepCount: number
  value?: ReportLocation
  onChange: (loc: ReportLocation) => void
  onContinue: () => void
  onBack: () => void
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const frzRef = useRef<L.LayerGroup | null>(null)
  const uasRef = useRef<L.GeoJSON | null>(null)
  const showUasRef = useRef(false)
  const nsaRef = useRef<L.GeoJSON | null>(null)
  const showNsaRef = useRef(false)
  const sitesRef = useRef<L.GeoJSON | null>(null)
  const intelligenceLayerRef = useRef<L.GeoJSON | null>(null)
  const showSitesRef = useRef(false)
  const [locating, setLocating] = useState(false)
  const [bearing, setBearing] = useState<number>(value?.bearing ?? 0)
  const [deviceHeading, setDeviceHeading] = useState<number | null>(value?.deviceHeading ?? null)
  const [compassOn, setCompassOn] = useState(false)
  const [showFrz, setShowFrz] = useState(true)
  const [showUas, setShowUas] = useState(false)
  const [showNsa, setShowNsa] = useState(false)
  const [showSites, setShowSites] = useState(false)
  const [mapRevision, setMapRevision] = useState(0)
  const [airspaceUnavailable, setAirspaceUnavailable] = useState(false)
  const [enabledAirspaceLayers, setEnabledAirspaceLayers] = useState<Set<string>>(
    () => new Set(["frz", "notam"]),
  )
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number | null }>({
    lat: value?.lat ?? 51.5072,
    lng: value?.lng ?? -0.1276,
    accuracy: value?.accuracy ?? null,
  })

  const emit = useCallback(
    (next: Partial<ReportLocation>) => {
      const merged: ReportLocation = {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        bearing,
        deviceHeading,
        ...next,
      }
      onChange(merged)
    },
    [coords, bearing, deviceHeading, onChange],
  )

  // Init map once (Leaflet is loaded client-side only).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!mapEl.current || mapRef.current) return
      const L = (await import("leaflet")).default
      if (cancelled || !mapEl.current || mapRef.current) return

      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView(
        [coords.lat, coords.lng],
        16,
      )
      L.tileLayer(ESRI_IMAGERY, {
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      }).addTo(map)
      L.control.zoom({ position: "bottomright" }).addTo(map)
      map.on("moveend", () => setMapRevision((revision) => revision + 1))

      // FRZ layer (off by default, toggled by button).
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
      frzRef.current = frz

      // UAS airspace restrictions layer — real UK AIP geometry (off by default).
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

      // Sensitive sites (prisons, police, MOD) — real OSM points (off by default).
      void loadUkSensitiveSites()
        .then((data) => {
          if (cancelled || !mapRef.current) return
          const sites = buildSensitiveSitesLayer(L, data)
          sitesRef.current = sites
          if (showSitesRef.current) sites.addTo(map)
        })
        .catch((err) => console.log("[v0] sensitive sites load failed:", err))

      const icon = L.divIcon({ className: "", html: MARKER_HTML, iconSize: [64, 64], iconAnchor: [32, 32] })
      const marker = L.marker([coords.lat, coords.lng], { icon, draggable: true }).addTo(map)
      marker.on("dragend", () => {
        const p = marker.getLatLng()
        setCoords((c) => ({ ...c, lat: p.lat, lng: p.lng }))
      })
      mapRef.current = map
      markerRef.current = marker

      // Try to locate the observer immediately.
      locate()
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      frzRef.current = null
      uasRef.current = null
      nsaRef.current = null
      sitesRef.current = null
      intelligenceLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toggle FRZ layer visibility.
  useEffect(() => {
    const map = mapRef.current
    const frz = frzRef.current
    if (!map || !frz) return
    if (showFrz) frz.addTo(map)
    else map.removeLayer(frz)
  }, [showFrz])

  // Toggle UAS layer visibility. The layer may still be loading when this runs,
  // so the load callback also consults showUasRef.
  useEffect(() => {
    showUasRef.current = showUas
    const map = mapRef.current
    const uas = uasRef.current
    if (!map || !uas) return
    if (showUas) uas.addTo(map)
    else map.removeLayer(uas)
  }, [showUas])

  // Toggle NSA prohibited places layer visibility (loaded asynchronously).
  useEffect(() => {
    showNsaRef.current = showNsa
    const map = mapRef.current
    const nsa = nsaRef.current
    if (!map || !nsa) return
    if (showNsa) nsa.addTo(map)
    else map.removeLayer(nsa)
  }, [showNsa])

  // Toggle sensitive-sites layer visibility (loaded asynchronously).
  useEffect(() => {
    showSitesRef.current = showSites
    const map = mapRef.current
    const sites = sitesRef.current
    if (!map || !sites) return
    if (showSites) sites.addTo(map)
    else map.removeLayer(sites)
  }, [showSites])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const categories = AIRSPACE_LAYER_OPTIONS
          .filter((layer) => enabledAirspaceLayers.has(layer.id))
          .flatMap((layer) => [...layer.categories])
        intelligenceLayerRef.current?.removeFrom(map)
        intelligenceLayerRef.current = null
        if (categories.length === 0) return
        const bounds = map.getBounds()
        try {
          const [L, collection] = await Promise.all([
            import("leaflet").then((module) => module.default),
            loadAirspaceBounds({
              minLon: bounds.getWest(), minLat: bounds.getSouth(),
              maxLon: bounds.getEast(), maxLat: bounds.getNorth(),
            }, categories),
          ])
          if (cancelled || !mapRef.current) return
          intelligenceLayerRef.current = buildCanonicalAirspaceLayer(L, collection).addTo(map)
          setAirspaceUnavailable(false)
        } catch (error) {
          if (!cancelled) {
            console.error("[icit] reporter airspace layer unavailable", error)
            setAirspaceUnavailable(true)
          }
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabledAirspaceLayers, mapRevision])

  // Keep marker position synced and propagate changes up.
  useEffect(() => {
    if (markerRef.current) markerRef.current.setLatLng([coords.lat, coords.lng])
    emit({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords])

  // Update heading cone rotation.
  useEffect(() => {
    const el = markerRef.current?.getElement()?.querySelector(".user-location-marker") as
      | HTMLElement
      | undefined
    el?.style.setProperty("--heading", `${bearing}deg`)
    emit({ bearing })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearing])

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        setCoords({ lat: latitude, lng: longitude, accuracy })
        mapRef.current?.setView([latitude, longitude], 17)
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 9000 },
    )
  }

  async function enableCompass() {
    type OrientationEventWithPermission = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">
    }
    const D = DeviceOrientationEvent as unknown as OrientationEventWithPermission
    try {
      if (typeof D?.requestPermission === "function") {
        const res = await D.requestPermission()
        if (res !== "granted") return
      }
    } catch {
      return
    }
    setCompassOn(true)
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const heading = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
      if (heading != null) {
        const rounded = Math.round(heading)
        setDeviceHeading(rounded)
        setBearing(rounded)
      }
    }
    window.addEventListener("deviceorientation", handler as EventListener, true)
  }

  return (
    <StepShell
      stepIndex={stepIndex}
      stepCount={stepCount}
      eyebrow="Step 5 — Location"
      title="Confirm location"
      subtitle="Drag the blue dot to your exact position, then point the arc toward the drone."
      onBack={onBack}
      footer={
        <Button className="w-full" onClick={onContinue}>
          <MapPin className="size-4" />
          Confirm &amp; run assessment
        </Button>
      }
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <div ref={mapEl} className="h-[46vh] w-full" />
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={locate} disabled={locating}>
          {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
          My location
        </Button>
        <Button
          variant={compassOn ? "default" : "secondary"}
          size="sm"
          className="flex-1"
          onClick={enableCompass}
        >
          <Compass className={cn("size-4", compassOn && "animate-pulse")} />
          {compassOn ? "Following" : "Use compass"}
        </Button>
      </div>

      <details className="mt-2 rounded-lg border border-border bg-card/70">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium">
          <Layers className="size-4" />
          Airspace layers
          <span className="ml-auto font-mono text-xs text-muted-foreground">{enabledAirspaceLayers.size} active</span>
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
          {AIRSPACE_LAYER_OPTIONS.map((layer) => {
            const enabled = enabledAirspaceLayers.has(layer.id)
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => {
                  setEnabledAirspaceLayers((current) => {
                    const next = new Set(current)
                    if (next.has(layer.id)) next.delete(layer.id)
                    else next.add(layer.id)
                    return next
                  })
                  if (layer.id === "frz") setShowFrz((current) => !current)
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium",
                  enabled ? "border-primary/40 bg-primary/15" : "border-border text-muted-foreground",
                )}
              >
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: layer.color }} />
                <span className="flex-1 text-left">{layer.label}</span>
                <Check className={cn("size-3.5", enabled ? "opacity-100" : "opacity-0")} />
              </button>
            )
          })}
          {airspaceUnavailable ? (
            <p className="col-span-2 text-xs text-destructive">Live restriction intelligence unavailable.</p>
          ) : null}
        </div>
      </details>

      <div className="mt-4 rounded-lg border border-border bg-card/70 p-4">
        <div className="flex items-center justify-between">
          <label htmlFor="bearing" className="text-sm font-medium">
            Direction to drone
          </label>
          <span className="font-mono text-sm text-primary">{Math.round(bearing)}°</span>
        </div>
        <input
          id="bearing"
          type="range"
          min={0}
          max={359}
          value={bearing}
          onChange={(e) => setBearing(Number(e.target.value))}
          className="mt-3 w-full accent-[color:var(--primary)]"
        />
        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px] text-muted-foreground">
          <span>LAT {coords.lat.toFixed(5)}</span>
          <span className="text-center">LNG {coords.lng.toFixed(5)}</span>
          <span className="text-right">
            {coords.accuracy != null ? `±${Math.round(coords.accuracy)}m` : "±—"}
          </span>
        </div>
      </div>
    </StepShell>
  )
}
