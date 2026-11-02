import type { Plugin } from 'vite'

/**
 * Stamps each production build with an id: a `<meta name="app-build">` tag in the page
 * and a `version.json` beside it. `AppUpdateNotice` compares the two to notice that a
 * newer build has been deployed.
 */
export function appVersion(): Plugin {
  const build = Date.now().toString(36)
  return {
    name: 'app-version',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-build', content: build }, injectTo: 'head' }],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) })
    },
  }
}
