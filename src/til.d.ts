// Tilde source files are loaded as text through Vite's `?raw` suffix, so the
// prelude bundles into the browser playground rather than being read off disk.
declare module '*.til?raw' {
  const src: string
  export default src
}
