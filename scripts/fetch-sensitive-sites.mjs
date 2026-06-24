// Fetches UK prisons, police stations and MOD/military sites from the
// OpenStreetMap Overpass API and writes a single GeoJSON point dataset to
// public/uk-sensitive-sites.geojson.
//
// Polygons/relations are reduced to a representative centre point via Overpass
// `out center`. Run with: node scripts/fetch-sensitive-sites.mjs
//
// Data: © OpenStreetMap contributors, ODbL.

import fs from "node:fs"
import path from "node:path"

const UA = "ICIT-DroneMap/1.0 (research security incident mapping; contact: ops@icit.example)"

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

// Each category defines the Overpass selectors used to collect its features.
const CATEGORIES = [
  {
    id: "prison",
    label: "Prisons",
    query: `nwr["amenity"="prison"](area.uk);`,
  },
  {
    id: "police",
    label: "Police stations",
    // Only true police stations, not booth/box phone markers.
    query: `nwr["amenity"="police"](area.uk);`,
  },
  {
    id: "mod",
    label: "MOD / military sites",
    // Military estate footprints + named installations (bases, barracks,
    // airfields, naval bases, training areas).
    query: `
      nwr["landuse"="military"](area.uk);
      nwr["military"="base"](area.uk);
      nwr["military"="barracks"](area.uk);
      nwr["military"="naval_base"](area.uk);
      nwr["military"="airfield"](area.uk);
      nwr["military"="training_area"](area.uk);
      nwr["military"="danger_area"](area.uk);
    `,
  },
]

async function runQuery(overpassQL) {
  let lastErr
  for (const url of MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
          },
          body: "data=" + encodeURIComponent(overpassQL),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
        const json = await res.json()
        return json
      } catch (err) {
        lastErr = err
        console.warn(`  ! ${url} attempt ${attempt} failed: ${err.message}`)
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }
  throw lastErr
}

function pointFor(el) {
  if (el.type === "node") return [el.lon, el.lat]
  if (el.center) return [el.center.lon, el.center.lat]
  return null
}

function nameFor(tags = {}) {
  return (
    tags.name ||
    tags["official_name"] ||
    tags["operator"] ||
    tags.ref ||
    null
  )
}

async function fetchCategory(cat) {
  const ql = `[out:json][timeout:300];
area["ISO3166-1"="GB"][admin_level=2]->.uk;
(${cat.query});
out center tags;`
  console.log(`Fetching ${cat.label}...`)
  const json = await runQuery(ql)
  const seen = new Set()
  const features = []
  for (const el of json.elements ?? []) {
    const coords = pointFor(el)
    if (!coords) continue
    // Dedupe by rounded coordinate to avoid node+way duplicates of one site.
    const key = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(coords[0].toFixed(5)), Number(coords[1].toFixed(5))] },
      properties: {
        category: cat.id,
        name: nameFor(el.tags),
      },
    })
  }
  console.log(`  -> ${features.length} ${cat.label}`)
  return features
}

async function main() {
  const only = process.argv[2] // optional category id
  const cats = only ? CATEGORIES.filter((c) => c.id === only) : CATEGORIES
  if (only && cats.length === 0) {
    throw new Error(`Unknown category "${only}". Use one of: ${CATEGORIES.map((c) => c.id).join(", ")}`)
  }

  const all = []
  for (const cat of cats) {
    const features = await fetchCategory(cat)
    all.push(...features)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // When a single category is requested, write to a temp per-category file so
  // runs can be parallelised; otherwise write the combined dataset.
  if (only) {
    const tmpPath = path.join(process.cwd(), "public", `.sites-${only}.json`)
    fs.writeFileSync(tmpPath, JSON.stringify(all))
    console.log(`\nWrote ${all.length} ${only} features to ${tmpPath}`)
    return
  }

  writeCombined(all)
}

function writeCombined(all) {
  const fc = {
    type: "FeatureCollection",
    meta: {
      source: "OpenStreetMap contributors (Overpass API)",
      license: "ODbL",
      generated: new Date().toISOString().slice(0, 10),
    },
    features: all,
  }
  const outPath = path.join(process.cwd(), "public", "uk-sensitive-sites.geojson")
  fs.writeFileSync(outPath, JSON.stringify(fc))
  const counts = all.reduce((acc, f) => {
    acc[f.properties.category] = (acc[f.properties.category] || 0) + 1
    return acc
  }, {})
  console.log(`\nWrote ${all.length} features to ${outPath}`)
  console.log("Counts:", JSON.stringify(counts))
}

main().catch((err) => {
  console.error("Failed:", err)
  process.exit(1)
})
