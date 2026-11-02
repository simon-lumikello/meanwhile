import { lookup } from 'node:dns/promises'
import { isBlockedIpAddress, validateExternalHttpUrl, type UrlValidation } from './proxySecurity.ts'

/**
 * `validateExternalHttpUrl` plus a DNS check that the host resolves only to public addresses,
 * for servers that can resolve names (the self-hosted server and the Vite dev server).
 */
export async function validateResolvableExternalHttpUrl(value: string): Promise<UrlValidation> {
  const validation = validateExternalHttpUrl(value)
  if (validation.error !== undefined) return validation
  try {
    const addresses = await lookup(validation.url.hostname, { all: true, verbatim: true })
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIpAddress(address))) {
      return { error: 'Private network addresses are not allowed' }
    }
  } catch {
    return { error: 'Unable to resolve the target host' }
  }
  return validation
}
