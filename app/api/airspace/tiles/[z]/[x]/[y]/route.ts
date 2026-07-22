import { NextRequest, NextResponse } from "next/server"

import { isValidTileCoordinate } from "@/lib/airspace/tiles"
import { apiError, requireApiUser } from "../../../../_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const auth = await requireApiUser()
  if (!auth) return apiError(new Error("Authentication required."), 401)
  try {
    const values = await params
    const z = Number(values.z)
    const x = Number(values.x)
    const y = Number(values.y.replace(/\.pbf$/, ""))
    if (!isValidTileCoordinate(z, x, y)) throw new Error("Invalid vector tile coordinate.")
    const categories = request.nextUrl.searchParams.get("categories")?.split(",").filter(Boolean) ?? null
    const { data, error } = await auth.supabase.rpc("airspace_vector_tile", {
      tile_z: z,
      tile_x: x,
      tile_y: y,
      categories,
    })
    if (error) throw new Error(`Unable to generate vector tile: ${error.message}`)
    const tile = typeof data === "string" ? Buffer.from(data.replace(/^\\x/, ""), "hex") : Buffer.alloc(0)
    return new NextResponse(tile, {
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
