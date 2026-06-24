// Principal UK airport Flight Restriction Zones (FRZ).
// Each aerodrome with a runway has a legally defined FRZ around it: a circle of
// 2.5 NM (~4.6 km) radius from the aerodrome reference point (plus runway
// extensions). Drones may not be flown inside an FRZ without ATC permission.
//
// This is a curated set of the principal UK FRZs for situational awareness on
// the reviewer map. It is an approximation (circular zones only) and is NOT a
// substitute for an official pre-flight airspace check (e.g. CAA / Drone Assist).

export interface FlightRestrictionZone {
  name: string
  /** ICAO code where applicable. */
  code?: string
  lat: number
  lng: number
  /** Radius of the restriction zone in kilometres. */
  radiusKm: number
}

export const UK_FLIGHT_RESTRICTION_ZONES: FlightRestrictionZone[] = [
  { name: "London Heathrow", code: "EGLL", lat: 51.47, lng: -0.4543, radiusKm: 5.5 },
  { name: "London Gatwick", code: "EGKK", lat: 51.1537, lng: -0.1821, radiusKm: 5 },
  { name: "London Stansted", code: "EGSS", lat: 51.886, lng: 0.2389, radiusKm: 5 },
  { name: "London Luton", code: "EGGW", lat: 51.8747, lng: -0.3683, radiusKm: 4.6 },
  { name: "London City", code: "EGLC", lat: 51.5048, lng: 0.0495, radiusKm: 4.6 },
  { name: "London Southend", code: "EGMC", lat: 51.5714, lng: 0.6956, radiusKm: 4.6 },
  { name: "Farnborough", code: "EGLF", lat: 51.2758, lng: -0.7763, radiusKm: 4.6 },
  { name: "Biggin Hill", code: "EGKB", lat: 51.3307, lng: 0.0325, radiusKm: 4.6 },
  { name: "Manchester", code: "EGCC", lat: 53.3537, lng: -2.275, radiusKm: 5 },
  { name: "Liverpool John Lennon", code: "EGGP", lat: 53.3336, lng: -2.8497, radiusKm: 4.6 },
  { name: "Leeds Bradford", code: "EGNM", lat: 53.8659, lng: -1.6606, radiusKm: 4.6 },
  { name: "Newcastle", code: "EGNT", lat: 55.0375, lng: -1.6917, radiusKm: 4.6 },
  { name: "Teesside", code: "EGNV", lat: 54.5092, lng: -1.4294, radiusKm: 4.6 },
  { name: "Humberside", code: "EGNJ", lat: 53.5744, lng: -0.3508, radiusKm: 4.6 },
  { name: "East Midlands", code: "EGNX", lat: 52.8311, lng: -1.3281, radiusKm: 4.6 },
  { name: "Birmingham", code: "EGBB", lat: 52.4539, lng: -1.748, radiusKm: 5 },
  { name: "Bristol", code: "EGGD", lat: 51.3827, lng: -2.7191, radiusKm: 4.6 },
  { name: "Cardiff", code: "EGFF", lat: 51.3967, lng: -3.3433, radiusKm: 4.6 },
  { name: "Southampton", code: "EGHI", lat: 50.9503, lng: -1.3568, radiusKm: 4.6 },
  { name: "Bournemouth", code: "EGHH", lat: 50.78, lng: -1.8425, radiusKm: 4.6 },
  { name: "Exeter", code: "EGTE", lat: 50.7344, lng: -3.4139, radiusKm: 4.6 },
  { name: "Norwich", code: "EGSH", lat: 52.6758, lng: 1.2828, radiusKm: 4.6 },
  { name: "Edinburgh", code: "EGPH", lat: 55.95, lng: -3.3725, radiusKm: 5 },
  { name: "Glasgow", code: "EGPF", lat: 55.8719, lng: -4.4331, radiusKm: 5 },
  { name: "Glasgow Prestwick", code: "EGPK", lat: 55.5094, lng: -4.5867, radiusKm: 4.6 },
  { name: "Aberdeen", code: "EGPD", lat: 57.2019, lng: -2.1978, radiusKm: 4.6 },
  { name: "Inverness", code: "EGPE", lat: 57.5425, lng: -4.0475, radiusKm: 4.6 },
  { name: "Belfast International", code: "EGAA", lat: 54.6575, lng: -6.2158, radiusKm: 5 },
  { name: "Belfast City", code: "EGAC", lat: 54.6181, lng: -5.8725, radiusKm: 4.6 },
]

const EARTH_RADIUS_KM = 6371

/** Great-circle distance between two coordinates in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Returns all FRZs that contain the given point. */
export function zonesContaining(point: { lat: number; lng: number }): FlightRestrictionZone[] {
  return UK_FLIGHT_RESTRICTION_ZONES.filter((z) => distanceKm(point, z) <= z.radiusKm)
}
