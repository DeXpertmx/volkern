#!/usr/bin/env node
/**
 * scripts/generate-openapi.mjs
 *
 * Generador de `/public/openapi.json` para el Partner API v1.
 *
 * Carga `lib/open-api-v1.ts` (única fuente de verdad) que usa
 * `zod-to-json-schema` para derivar el body schema desde
 * `ExternalInvoiceCreateSchema` en `lib/validation/schemas/finance.ts`.
 *
 * Uso:
 *   npx tsx scripts/generate-openapi.mjs          # standalone
 *   npm run openapi:generate                      # via script
 *   npm run build                                 # via prebuild hook
 *
 * El script corre en `prebuild`, antes de `prisma generate && next build`,
 * por lo que `public/openapi.json` siempre está sincronizado con el código
 * al momento del deploy.
 */

import { writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..')

async function main() {
  // Dynamic import (tsx loader) del módulo TS.
  const mod = await import(resolve(ROOT, 'lib/open-api-v1.ts'))
  const openApiV1Document = mod.openApiV1Document

  if (!openApiV1Document) {
    console.error('[generate-openapi] lib/open-api-v1.ts no exporta openApiV1Document')
    process.exit(1)
  }

  // round-trip por JSON.stringify/parse para validación inmediata:
  // si el documento tiene referencias circulares o tipos no-JSON, falla aquí
  // antes de tocar disco.
  const json = JSON.stringify(openApiV1Document)
  JSON.parse(json) // throws si no es JSON válido → caught abajo

  const outPath = resolve(ROOT, 'public/openapi.json')
  await mkdir(dirname(outPath), { recursive: true })

  // Atomic write: tmp file + rename, evita documentos parciales en disco.
  const tmpPath = outPath + '.tmp'
  await writeFile(tmpPath, json + '\n', 'utf8')
  await rename(tmpPath, outPath)

  // Stats para sanity-check rápido en CI.
  const doc = JSON.parse(json)
  const pathCount = Object.keys(doc.paths ?? {}).length
  const schemaCount = Object.keys(doc.components?.schemas ?? {}).length
  const securitySchemes = Object.keys(doc.components?.securitySchemes ?? {}).length
  console.log(
    `[generate-openapi] ✓ escrito ${outPath} — ${pathCount} paths, ${schemaCount} schemas, ${securitySchemes} security schemes (${json.length} bytes)`,
  )
}

main().catch((err) => {
  // Stack completo para debugging en CI sin ruido.
  console.error('[generate-openapi] error:', err?.message ?? err)
  if (err?.stack) console.error('[generate-openapi] stack:', err.stack)
  process.exit(1)
})
