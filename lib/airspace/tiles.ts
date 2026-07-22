export function airspaceTileUrl(z: number, x: number, y: number, categories: string[] = []) {
  const query = categories.length ? `?categories=${encodeURIComponent(categories.join(","))}` : ""
  return `/api/airspace/tiles/${z}/${x}/${y}${query}`
}

export function isValidTileCoordinate(z: number, x: number, y: number) {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 22) return false
  const maximum = 2 ** z
  return x >= 0 && y >= 0 && x < maximum && y < maximum
}
