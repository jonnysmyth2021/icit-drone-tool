// Converts the open-source UK AIP airspace dataset (ahsparrow/airspace, CC0)
// from YAIXM (YAML) into GeoJSON with real boundary geometry.
//
// Circles and arcs are expanded into polygon vertices so the output reflects
// the true published airspace shapes (not distance buffers).
//
// Usage: node scripts/convert-airspace.mjs [input.yaml] [output.geojson]

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const yaml = require("js-yaml")

const INPUT = process.argv[2] || "/tmp/airspace.yaml"
const OUTPUT = process.argv[3] || path.join(process.cwd(), "public", "uk-airspace.geojson")

const NM_TO_M = 1852
const M_PER_DEG_LAT = 111320

/** Parse a YAIXM "DDMMSS[.s]H DDDMMSS[.s]H" coordinate into [lon, lat]. */
function parseLatLon(token) {
  const [latStr, lonStr] = token.trim().split(/\s+/)
  const latM = latStr.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])$/)
  const lonM = lonStr.match(/^(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])$/)
  if (!latM || !lonM) throw new Error(`Bad coordinate: "${token}"`)
  let lat = +latM[1] + +latM[2] / 60 + +latM[3] / 3600
  if (latM[4] === "S") lat = -lat
  let lon = +lonM[1] + +lonM[2] / 60 + +lonM[3] / 3600
  if (lonM[4] === "W") lon = -lon
  return [+lon.toFixed(6), +lat.toFixed(6)]
}

/** Radius like "2.5 nm" or "1000 m" -> metres. */
function parseRadius(str) {
  const [val, unit] = String(str).trim().split(/\s+/)
  const n = parseFloat(val)
  return unit === "nm" ? n * NM_TO_M : n
}

function metresPerDegLon(lat) {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
}

/** A full circle as a closed ring of [lon,lat] points. */
function circleRing(centreTok, radiusStr, steps = 96) {
  const [clon, clat] = parseLatLon(centreTok)
  const r = parseRadius(radiusStr)
  const mLon = metresPerDegLon(clat)
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    const north = r * Math.cos(a)
    const east = r * Math.sin(a)
    ring.push([+(clon + east / mLon).toFixed(6), +(clat + north / M_PER_DEG_LAT).toFixed(6)])
  }
  return ring
}

/** Arc points from `from` to `to` around `centre`, honouring direction. */
function arcPoints(from, centreTok, radiusStr, toTok, dir) {
  const [clon, clat] = parseLatLon(centreTok)
  const r = parseRadius(radiusStr)
  const [tlon, tlat] = parseLatLon(toTok)
  const mLon = metresPerDegLon(clat)

  // Planar offsets (metres) relative to centre.
  const ang = (lon, lat) => Math.atan2((lon - clon) * mLon, (lat - clat) * M_PER_DEG_LAT)
  let a0 = ang(from[0], from[1])
  let a1 = ang(tlon, tlat)
  const cw = dir === "cw"

  // Normalise sweep in the chosen direction.
  if (cw) {
    while (a1 <= a0) a1 += 2 * Math.PI
  } else {
    while (a1 >= a0) a1 -= 2 * Math.PI
  }
  const sweep = Math.abs(a1 - a0)
  const steps = Math.max(2, Math.ceil((sweep / (2 * Math.PI)) * 96))
  const pts = []
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    const north = r * Math.cos(a)
    const east = r * Math.sin(a)
    pts.push([+(clon + east / mLon).toFixed(6), +(clat + north / M_PER_DEG_LAT).toFixed(6)])
  }
  return pts
}

/** Build a closed ring for one geometry volume's boundary list. */
function boundaryRing(boundary) {
  // Pure circle boundary.
  if (boundary.length === 1 && boundary[0].circle) {
    return circleRing(boundary[0].circle.centre, boundary[0].circle.radius)
  }
  const ring = []
  let cur = null
  for (const item of boundary) {
    if (item.line) {
      for (const tok of item.line) {
        cur = parseLatLon(tok)
        ring.push(cur)
      }
    } else if (item.arc) {
      if (!cur) cur = parseLatLon(item.arc.to) // defensive: arc first
      const pts = arcPoints(cur, item.arc.centre, item.arc.radius, item.arc.to, item.arc.dir)
      for (const p of pts) ring.push(p)
      cur = ring[ring.length - 1]
    } else if (item.circle) {
      // Mixed boundary containing a circle is not expected; treat as standalone.
      return circleRing(item.circle.centre, item.circle.radius)
    }
  }
  // Close the ring.
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0])
  }
  return ring
}

const doc = yaml.load(fs.readFileSync(INPUT, "utf8"))
const features = []
let failures = 0

for (const a of doc.airspace) {
  for (const vol of a.geometry || []) {
    try {
      const ring = boundaryRing(vol.boundary)
      if (ring.length < 4) continue
      features.push({
        type: "Feature",
        properties: {
          name: a.name,
          id: a.id,
          type: a.type,
          localtype: a.localtype || null,
          class: a.class || null,
          upper: vol.upper ?? null,
          lower: vol.lower ?? null,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      })
    } catch (e) {
      failures++
      console.error(`[v0] skip ${a.name}: ${e.message}`)
    }
  }
}

const fc = { type: "FeatureCollection", features }
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, JSON.stringify(fc))
console.log(`[v0] wrote ${features.length} features to ${OUTPUT} (${failures} failures)`)
