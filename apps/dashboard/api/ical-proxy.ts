import { createCalendarProxyHandler } from '../server/calendarProxy.ts'
import { validateExternalHttpUrl } from '../server/proxySecurity.ts'

export const config = {
  runtime: 'edge',
}

// Edge runtimes cannot resolve DNS, so targets are validated by URL; every redirect is re-validated.
export default createCalendarProxyHandler({ validate: validateExternalHttpUrl })
