import { edgeAircraftRelay } from '../server/aircraftRelay.ts'

export const config = {
  runtime: 'edge',
}

export default function handler(req: Request) {
  return edgeAircraftRelay(req)
}
