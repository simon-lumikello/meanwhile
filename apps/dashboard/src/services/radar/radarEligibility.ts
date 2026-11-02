import { isWithinFmiRadarCoverage } from '@simon-lumikello/meanwhile-radar/sources'

/** Dashboard policy deliberately combines its selected forecast source with independent FMI coverage. */
export function isDashboardRadarEligible(weatherProviderId: string | undefined, latitude?: number, longitude?: number): boolean {
  return weatherProviderId === 'fmi' && isWithinFmiRadarCoverage(latitude, longitude)
}
