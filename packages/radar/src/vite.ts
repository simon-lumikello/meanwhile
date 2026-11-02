import { createRequire } from 'node:module'
import { build, type Plugin, type Rolldown } from 'vite'

const MAPLIBRE_WORKER_ID = 'virtual:maplibre-worker-source'

/**
 * MapLibre loads its web worker from a file beside its own module, which a host's
 * bundle does not have. This plugin bundles the worker into one self-contained
 * script and serves it as a string to the lazily loaded map chunk. Every Vite
 * config that renders radar registers it: `plugins: [maplibreWorkerSource()]`.
 */
export function maplibreWorkerSource(): Plugin {
  // Resolved from this package, which depends on maplibre-gl, not from the host app.
  const require = createRequire(import.meta.url)
  return {
    name: 'maplibre-worker-source',
    resolveId: source => (source === MAPLIBRE_WORKER_ID ? `\0${MAPLIBRE_WORKER_ID}` : undefined),
    async load(id) {
      if (id !== `\0${MAPLIBRE_WORKER_ID}`) return
      const worker = require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs')
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: { write: false, minify: true, lib: { entry: worker, formats: ['es'], fileName: 'maplibre-worker' } },
      }) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[]
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
      const chunk = outputs.find((output): output is Rolldown.OutputChunk => output.type === 'chunk' && output.isEntry)
      if (!chunk || outputs.filter(output => output.type === 'chunk').length !== 1) throw new Error('MapLibre worker must bundle into one chunk')
      return `export default ${JSON.stringify(chunk.code)}`
    },
  }
}
