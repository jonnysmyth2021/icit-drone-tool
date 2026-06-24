"use client"

import "leaflet/dist/leaflet.css"

import type * as L from "leaflet"
import { useCallback, useEffect, useRef, useState } from "react"
import { Compass, Crosshair, Layers, Loader2, MapPin, MapPinned } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReportLocation } from "@/lib/types"
import { cn } from "@/lib/utils"
import { UK_FLIGHT_RESTRICTION_ZONES } from "@/lib/uk-frz"
import { buildAirspaceLayer, buildNsaProhibitedLayer, loadUkAirspace } from "@/lib/uk-airspace"
import { buildSensitiveSitesLayer, loadUkSensitiveSites } from "@/lib/uk-sensitive-sites"
import { StepShell } from "./step-shell"

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

const FRZ_COLOR = "#ef4444"

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
  const showSitesRef = useRef(false)
  const [locating, setLocating] = useState(false)
  const [bearing, setBearing] = useState<number>(value?.bearing ?? 0)
  const [deviceHeading, setDeviceHeading] = useState<number | null>(value?.deviceHeading ?? null)
  const [compassOn, setCompassOn] = useState(false)
  const [showFrz, setShowFrz] = useState(false)
  const [showUas, setShowUas] = useState(false)
  const [showNsa, setShowNsa] = useState(false)
  const [showSites, setShowSites] = useState(false)
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

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          variant={showFrz ? "default" : "secondary"}
          size="sm"
          onClick={() => setShowFrz((s) => !s)}
        >
          <Layers className="size-4" />
          FRZ
        </Button>
        <Button
          variant={showUas ? "default" : "secondary"}
          size="sm"
          onClick={() => setShowUas((s) => !s)}
        >
          <Layers className="size-4" />
          UAS
        </Button>
        <Button
          variant={showNsa ? "default" : "secondary"}
          size="sm"
          onClick={() => setShowNsa((s) => !s)}
        >
          <Layers className="size-4" />
          NSA
        </Button>
        <Button
          variant={showSites ? "default" : "secondary"}
          size="sm"
          onClick={() => setShowSites((s) => !s)}
        >
          <MapPinned className="size-4" />
          Sites
        </Button>
      </div>

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
