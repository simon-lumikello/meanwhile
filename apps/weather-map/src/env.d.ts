/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Same-origin aircraft relay path; empty disables the aircraft overlay. */
  readonly VITE_AIRCRAFT_RELAY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
