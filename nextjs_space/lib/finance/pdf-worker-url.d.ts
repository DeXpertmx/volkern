// Declaración para los imports de Next.js con sufijo `?url` (asset URLs),
// p. ej. `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`.
declare module '*?url' {
  const url: string
  export default url
}
