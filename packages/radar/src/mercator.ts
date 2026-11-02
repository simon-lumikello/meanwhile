/** Converts WGS84 coordinates to Web Mercator meters without selecting a data provider. */
export function latLonToWebMercator(lat: number, lon: number): { x: number; y: number } {
  const x = (lon * 20037508.34) / 180
  const yRaw = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180) * 20037508.34) / 180
  return { x: Object.is(x, -0) ? 0 : x, y: Math.abs(yRaw) < 1e-9 ? 0 : yRaw }
}
