import { getFmiRadarMapUrl } from '../../src/sources/fmi'
import { CLOUD_FIXTURE as fixture } from './fixture-config'

const { name, latitude, longitude } = fixture.location
const { width, height, deltaMeters, style } = fixture
const url = getFmiRadarMapUrl(latitude, longitude, deltaMeters, width, height, style)
const response = await fetch(url)
if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) {
  throw new Error(`Radar capture failed: expected PNG, received HTTP ${response.status}`)
}

const png = new Uint8Array(await response.arrayBuffer())
const signature = [137, 80, 78, 71, 13, 10, 26, 10]
if (png.length < 24 || !signature.every((byte, index) => png[index] === byte)) {
  throw new Error('Radar capture did not contain a PNG image')
}
const header = new DataView(png.buffer, png.byteOffset, png.byteLength)
if (header.getUint32(16) !== width || header.getUint32(20) !== height) {
  throw new Error('Radar capture dimensions did not match the configured viewport')
}

const metadata = {
  name, latitude, longitude, width, height, deltaMeters, style, url,
  capturedAt: new Date().toISOString(),
  date: response.headers.get('date'),
}
await Bun.write(new URL('./radar-capture.png', import.meta.url), png)
await Bun.write(new URL('./radar-capture.json', import.meta.url), JSON.stringify(metadata, null, 2) + '\n')
console.log(`Captured radar for ${name}. Inspect the raster and review visual snapshots before accepting them.`)
