import "server-only"

import { createClient } from "@/lib/supabase/server"
import { assessAirspaceRisk } from "./risk-engine"
import type {
  AirspaceIntersection,
  AirspacePointQuery,
  AirspaceRiskAssessment,
  RestrictionCollection,
} from "./types"

export interface AirspaceBounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

function assertCoordinate(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`)
  }
}

export class AirspaceService {
  async queryBounds(
    bounds: AirspaceBounds,
    options: { timestamp?: string; categories?: string[] } = {},
  ): Promise<RestrictionCollection> {
    assertCoordinate(bounds.minLat, -90, 90, "minLat")
    assertCoordinate(bounds.maxLat, -90, 90, "maxLat")
    assertCoordinate(bounds.minLon, -180, 180, "minLon")
    assertCoordinate(bounds.maxLon, -180, 180, "maxLon")
    if (bounds.minLat >= bounds.maxLat || bounds.minLon >= bounds.maxLon) {
      throw new Error("Airspace bounds are invalid.")
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc("query_airspace_bbox", {
      min_lon: bounds.minLon,
      min_lat: bounds.minLat,
      max_lon: bounds.maxLon,
      max_lat: bounds.maxLat,
      at_time: options.timestamp ?? new Date().toISOString(),
      categories: options.categories?.length ? options.categories : null,
    })
    if (error) throw new Error(`Unable to query airspace: ${error.message}`)
    return data as RestrictionCollection
  }

  async queryPoint(query: AirspacePointQuery): Promise<AirspaceIntersection[]> {
    assertCoordinate(query.lat, -90, 90, "lat")
    assertCoordinate(query.lon, -180, 180, "lon")
    const radiusMetres = query.radiusMetres ?? 0
    if (!Number.isFinite(radiusMetres) || radiusMetres < 0 || radiusMetres > 100_000) {
      throw new Error("radiusMetres must be between 0 and 100000.")
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc("query_airspace_point", {
      query_lon: query.lon,
      query_lat: query.lat,
      radius_metres: radiusMetres,
      at_time: query.timestamp ?? new Date().toISOString(),
    })
    if (error) throw new Error(`Unable to query airspace intelligence: ${error.message}`)
    return (data ?? []) as AirspaceIntersection[]
  }

  async assessRisk(query: AirspacePointQuery): Promise<AirspaceRiskAssessment> {
    return assessAirspaceRisk(await this.queryPoint(query), query)
  }
}

export const airspaceService = new AirspaceService()
