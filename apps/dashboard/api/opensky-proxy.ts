import { edgeAircraftRelay } from '../server/aircraftRelay.ts'

export const config = {
  runtime: 'edge',
}

// The aircraft relay's legacy path, kept for dashboards still running an older build.
export default edgeAircraftRelay
