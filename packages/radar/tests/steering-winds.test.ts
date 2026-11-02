import { describe, expect, it } from 'bun:test'
import { createFmiRadarFrameSource, fetchFmiSteeringWinds, getFmiSteeringWindUrl, parseFmiSteeringWindXml } from '../src/sources/fmi'

const element = (lat: number, lon: number, time: string, name: string, value: string) => `
  <wfs:member><BsWfs:BsWfsElement gml:id="x">
    <BsWfs:Location><gml:Point><gml:pos>${lat.toFixed(5)} ${lon.toFixed(5)} </gml:pos></gml:Point></BsWfs:Location>
    <BsWfs:Time>${time}</BsWfs:Time>
    <BsWfs:ParameterName>${name}</BsWfs:ParameterName>
    <BsWfs:ParameterValue>${value}</BsWfs:ParameterValue>
  </BsWfs:BsWfsElement></wfs:member>`
const collection = (...members: string[]) => `<wfs:FeatureCollection>${members.join('')}</wfs:FeatureCollection>`

describe('FMI steering winds', () => {
  it('asks MEPS for wind at every point and the chosen level', () => {
    const url = new URL(getFmiSteeringWindUrl({ points: [{ latitude: 60.17, longitude: 24.94 }, { latitude: 62, longitude: 29.764 }], start: '2026-09-27T08:00:00Z', end: '2026-09-27T14:00:00Z' }, 850))
    expect(url.searchParams.get('storedquery_id')).toBe('fmi::forecast::meps::pressure::point::simple')
    expect(url.searchParams.getAll('latlon')).toEqual(['60.17,24.94', '62.00,29.76'])
    expect(url.searchParams.get('level')).toBe('850')
    expect(url.searchParams.get('parameters')).toBe('WindSpeedMS,WindDirection')
  })

  it('pairs speed and direction by place and time, dropping incomplete and missing values', () => {
    const samples = parseFmiSteeringWindXml(collection(
      element(60.17, 24.94, '2026-09-27T10:00:00Z', 'WindSpeedMS', '9.6'),
      element(60.17, 24.94, '2026-09-27T10:00:00Z', 'WindDirection', '324.0'),
      element(60.17, 24.94, '2026-09-27T11:00:00Z', 'WindSpeedMS', '10.2'),
      element(60.17, 24.94, '2026-09-27T11:00:00Z', 'WindDirection', 'NaN'),
    ))
    expect(samples).toEqual([{ latitude: 60.17, longitude: 24.94, time: '2026-09-27T10:00:00Z', speedMs: 9.6, directionDeg: 324 }])
  })

  it('retries a failed grid at its middle point, and fails quietly', async () => {
    const requested: string[][] = []
    const transport = { fetch: async (url: RequestInfo | URL) => {
      const points = new URL(String(url)).searchParams.getAll('latlon')
      requested.push(points)
      return points.length > 1
        ? new Response('<ExceptionReport>No data available</ExceptionReport>', { status: 400 })
        : new Response(collection(element(62, 25, '2026-09-27T10:00:00Z', 'WindSpeedMS', '12'), element(62, 25, '2026-09-27T10:00:00Z', 'WindDirection', '250')))
    } }
    const points = [{ latitude: 60, longitude: 21 }, { latitude: 62, longitude: 25 }, { latitude: 64, longitude: 29 }]
    const samples = await fetchFmiSteeringWinds({ points, start: 'a', end: 'b', transport })
    expect(requested.map(list => list.length)).toEqual([3, 1])
    expect(requested[1]).toEqual(['62.00,25.00'])
    expect(samples).toHaveLength(1)

    const offline = { fetch: async () => { throw new Error('offline') } }
    expect(await fetchFmiSteeringWinds({ points, start: 'a', end: 'b', transport: offline })).toEqual([])
  })

  it('the FMI frame source offers steering winds through its transport', async () => {
    let calls = 0
    const source = createFmiRadarFrameSource({ transport: { fetch: async () => { calls++; return new Response(collection()) } } })
    expect(await source.steeringWinds?.({ points: [{ latitude: 62, longitude: 25 }], start: 'a', end: 'b' })).toEqual([])
    expect(calls).toBe(1)
  })
})
