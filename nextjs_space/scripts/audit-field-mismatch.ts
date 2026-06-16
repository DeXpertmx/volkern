#!/usr/bin/env npx tsx

/**
 * 🛡️ scripts/audit-field-mismatch.ts
 *
 * Auditor automático de mismatches español ↔ inglés entre:
 *   - Campos que las APIs devuelven (directamente de Prisma, en español)
 *   - Campos que los frontends consumen (en inglés)
 *
 * Uso: npx tsx scripts/audit-field-mismatch.ts
 *
 * Detecta bugs como el de `/api/audit-logs` donde la API devolvía
 * `accion`, `entidad`, `fechaCreacion` pero el frontend leía
 * `action`, `entity`, `createdAt` → TypeError en runtime.
 *
 * Exit codes: 0 = sin hallazgos críticos, 1 = hay mismatches que revisar
 */

import * as fs from 'fs'
import * as path from 'path'

/* ─── Config ───────────────────────────────────────────────────────────────── */

const PROJECT_ROOT = process.cwd()

// Mapa de campos español → inglés (extraído del schema Prisma + uso en frontend)
const SPANISH_TO_ENGLISH: Record<string, string> = {
  // ── AuditLog ──
  accion: 'action',
  entidad: 'entity',
  entidadId: 'entityId',
  descripcion: 'description',
  fechaCreacion: 'createdAt',
  fechaActualizacion: 'updatedAt',
  cambiosAntes: 'changesBefore',
  cambiosDespues: 'changesAfter',

  // ── Contratos / Cotizaciones ──
  fechaEmision: 'issuedAt',
  fechaEnvio: 'sentAt',
  fechaAceptacion: 'acceptedAt',
  fechaFirma: 'signedAt',
  fechaCierre: 'closedAt',
  fechaInicio: 'startDate',
  fechaFin: 'endDate',
  fechaVencimiento: 'dueDate',
  fechaUltimaActividad: 'lastActivityAt',
  fechaEstimadaCierre: 'estimatedCloseDate',
  fechaProgramada: 'scheduledDate',
  fechaSubida: 'uploadedAt',
  fechaHora: 'dateTime',
  creadoPor: 'createdBy',
  creadoPorId: 'createdById',
  firmadoPor: 'signedBy',
  firmadoPorCliente: 'signedByClient',
  firmadoPorEmpresa: 'signedByCompany',
  snapshotNombre: 'snapshotName',
  snapshotNif: 'snapshotNif',
  snapshotDireccion: 'snapshotAddress',
  notasInternas: 'internalNotes',
  notasCliente: 'clientNotes',
  condicionesPago: 'paymentTerms',
  metodoPago: 'paymentMethod',
  frecuenciaPago: 'paymentFrequency',
  diaPago: 'paymentDay',

  // ── Leads / Contactos ──
  nombre: 'name',
  telefono: 'phone',
  ubicacion: 'location',
  estado: 'status',
  moneda: 'currency',
  empresa: 'company',
  perfilFiscal: 'fiscalProfile',
  tipo: 'type',
  cargo: 'position',
  notas: 'notes',
  direccion: 'address',

  // ── Cotizaciones / Items ──
  cantidad: 'quantity',
  precioUnitario: 'unitPrice',
  porcentajeImpuesto: 'taxPercentage',
  concepto: 'concept',

  // ── Usuarios / Roles ──
  permisos: 'permissions',
  esPersonalizado: 'isCustom',
  orden: 'order',

  // ── Webhooks ──
  metodoHttp: 'httpMethod',
  ultimoEnvio: 'lastSentAt',
  totalEnviados: 'totalSent',
  totalExitosos: 'totalSucceeded',
  totalFallidos: 'totalFailed',
  maxReintentos: 'maxRetries',
  timeoutSegundos: 'timeoutSeconds',

  // ── Tareas ──
  titulo: 'title',
  completada: 'completed',
  asignadoA: 'assignedTo',
  resultado: 'result',

  // ── Pipeline / Deals ──
  usuarioAsignadoId: 'assignedUserId',
  usuarioAsignado: 'assignedUser',
  valor: 'value',
  probabilidad: 'probability',
  prioridad: 'priority',
  etapa: 'stage',
  razonPerdida: 'lostReason',
  competidor: 'competitor',
  valorReal: 'realValue',

  // ── Límites de plan ──
  limiteUsuarios: 'userLimit',
  limiteLeads: 'leadLimit',

  // ── General ──
  activo: 'active',
  creadoEn: 'createdAt',
  actualizadoEn: 'updatedAt',
}

// Directorios a escanear
const API_DIR = path.join(PROJECT_ROOT, 'app/api')
const FRONTEND_DIRS = [
  path.join(PROJECT_ROOT, 'app'),
  path.join(PROJECT_ROOT, 'components'),
]

const EXCLUDE = ['node_modules', '.next', '.git', 'backup', 'dist', '__tests__']

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface Finding {
  apiFile: string
  apiEndpoint: string
  spanishField: string
  englishField: string
  frontendFile: string
  confidence: 'high' | 'medium' | 'low'
}

interface ApiScanResult {
  file: string
  endpoint: string
  spanishFields: string[]
}

interface FrontendScanResult {
  file: string
  fetchUrl: string
  englishFields: string[]
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (EXCLUDE.some(e => entry.name.startsWith(e))) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...getFiles(full))
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        results.push(full)
      }
    }
  } catch { /* dir doesn't exist */ }
  return results
}

/** Caché de archivos leídos para evitar re-lectura */
const fileCache = new Map<string, string>()

function readFileSafe(filePath: string): string {
  if (fileCache.has(filePath)) return fileCache.get(filePath)!
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    fileCache.set(filePath, content)
    return content
  } catch {
    return ''
  }
}

function inferEndpoint(apiFile: string): string {
  const rel = path.relative(API_DIR, apiFile)
  const withoutExt = rel.replace(/\.tsx?$/, '')
  const normalized = withoutExt
    .replace(/\\/g, '/')
    .replace(/\/route$/, '')
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1')
    .replace(/\[([^\]]+)\]/g, ':$1')
  return '/api/' + normalized
}

/**
 * Extrae SOLO la sección de respuesta de una API (después de NextResponse.json).
 * Evita falsos positivos de campos en where/data/create de Prisma.
 */
function extractResponseSection(content: string): string {
  const idx = content.lastIndexOf('NextResponse.json(')
  if (idx === -1) return content
  // Extraer desde NextResponse.json( hasta el siguiente ) balanceado
  let depth = 0
  let started = false
  let result = ''
  for (let i = idx + 'NextResponse.json('.length; i < content.length; i++) {
    const char = content[i]
    if (char === '(') depth++
    if (char === ')') {
      if (depth === 0) break
      depth--
    }
    if (started || char !== ' ') {
      started = true
      result += char
    }
  }
  return result
}

function findSpanishFieldsInApiResponse(content: string): string[] {
  const found: Set<string> = new Set()
  const spanishKeys = Object.keys(SPANISH_TO_ENGLISH)

  // Solo analizar la sección de respuesta, no los where/data de Prisma
  const responseOnly = extractResponseSection(content)

  for (const key of spanishKeys) {
    const regex = new RegExp(`\\b${key}\\s*:`, 'g')
    if (regex.test(responseOnly)) {
      found.add(key)
    }
  }

  return Array.from(found)
}

function findEnglishFieldsInFrontend(content: string): string[] {
  const found: Set<string> = new Set()
  const englishValues = Object.values(SPANISH_TO_ENGLISH)

  for (const field of englishValues) {
    let matched = false

    // 1. Patrón: data.action, entry.action, log.action, etc.
    const dotPattern = new RegExp(
      `\\b(?:data|entry|log|item|record|result|audit|deal|response|contact|cotizacion|contrato|webhook|alert|stats|pipeline|config|plan|user|tenant|role|report|metadata|summary|metric|profile|subscription|invoice|task|lead|client|supplier|employee|project|asset|warehouse|notification)\\\.${field}\\b`,
      'g'
    )
    if (dotPattern.test(content)) matched = true

    // 2. Patrón: destructuring  const { action, entity } = data
    if (!matched) {
      const destPattern = new RegExp(
        `\\bconst\\s*\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:data|response|result|entry|item|log|audit|deal|contact)`,
        'g'
      )
      if (destPattern.test(content)) matched = true
    }

    // 3. Patrón: array iteration  .map(i => i.action)
    if (!matched) {
      const mapPattern = new RegExp(
        `\\.map\\s*\\([^)]*\\b${field}\\b`,
        'g'
      )
      if (mapPattern.test(content)) matched = true
    }

    // 4. Patrón: field en JSX  {item.action}
    if (!matched) {
      const jsxPattern = new RegExp(
        `\\{\\w+\\.${field}\\b`,
        'g'
      )
      if (jsxPattern.test(content)) matched = true
    }

    if (matched) {
      found.add(field)
    }
  }

  return Array.from(found)
}

function extractFetchUrls(content: string): string[] {
  const urls: string[] = []

  // Patrón 1: fetch('url') o fetch("url")
  const pattern1 = /fetch\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  let match
  while ((match = pattern1.exec(content)) !== null) {
    urls.push(match[1])
  }

  // Patrón 2: fetch con template literals simples
  const pattern2 = /fetch\s*\(\s*`([^`$]+)`\s*\)/g
  while ((match = pattern2.exec(content)) !== null) {
    urls.push(match[1])
  }

  return [...new Set(urls)]
}

/* ─── Escaneo de APIs ──────────────────────────────────────────────────────── */

function scanApis(): ApiScanResult[] {
  const apiFiles = getFiles(API_DIR).filter(f => f.endsWith('route.ts'))
  const results: ApiScanResult[] = []

  for (const file of apiFiles) {
    const content = readFileSafe(file)
    if (!content) continue

    // Verificar que tenga query de Prisma Y devuelva JSON
    const hasPrismaQuery = /prisma\.\w+\.(findMany|findUnique|findFirst|findAll|create|update|delete)\b/.test(content)
    const hasJsonResponse = /NextResponse\.json/.test(content)

    if (!hasPrismaQuery || !hasJsonResponse) continue

    // Verificar que NO tenga mapeo español→inglés en la respuesta
    const responseSection = extractResponseSection(content)
    const hasMapping = /\.map\s*\(/.test(responseSection)

    if (hasMapping) continue

    const spanishFields = findSpanishFieldsInApiResponse(content)
    if (spanishFields.length > 0) {
      results.push({
        file,
        endpoint: inferEndpoint(file),
        spanishFields,
      })
    }
  }

  return results
}

function scanFrontends(): FrontendScanResult[] {
  const results: FrontendScanResult[] = []
  const allFiles: string[] = []

  for (const dir of FRONTEND_DIRS) {
    allFiles.push(...getFiles(dir).filter(f =>
      !f.includes('/api/') &&
      !f.endsWith('route.ts')
    ))
  }

  for (const file of allFiles) {
    const content = readFileSafe(file)
    if (!content) continue

    const englishFields = findEnglishFieldsInFrontend(content)
    const fetchUrls = extractFetchUrls(content)

    if (englishFields.length > 0 && fetchUrls.length > 0) {
      for (const url of fetchUrls) {
        results.push({
          file,
          fetchUrl: url,
          englishFields,
        })
      }
    }
  }

  return results
}

/* ─── Cross-Matching ────────────────────────────────────────────────────────── */

function crossMatch(apis: ApiScanResult[], frontends: FrontendScanResult[]): Finding[] {
  const findings: Finding[] = []

  for (const api of apis) {
    const consumers = frontends.filter(f => {
      const normFetch = f.fetchUrl.replace(/^\//, '').replace(/\?.*$/, '')
      const normEndpoint = api.endpoint.replace(/^\//, '')
      return normFetch === normEndpoint ||
        normFetch.startsWith(normEndpoint) ||
        normEndpoint.startsWith(normFetch)
    })

    for (const consumer of consumers) {
      for (const spanishField of api.spanishFields) {
        const englishField = SPANISH_TO_ENGLISH[spanishField]
        if (!englishField) continue

        if (!consumer.englishFields.includes(englishField)) continue

        // Confidence level
        let confidence: Finding['confidence'] = 'low'
        if (consumer.fetchUrl.replace(/^\//, '').replace(/\?.*$/, '') === api.endpoint.replace(/^\//, '')) {
          confidence = 'high'
        } else if (consumer.fetchUrl.includes(path.basename(api.endpoint))) {
          confidence = 'medium'
        }

        // Evitar falsos positivos: si el frontend también usa el campo español
        const frontendContent = readFileSafe(consumer.file)
        const alsoUsesSpanish = new RegExp(`\\b${spanishField}\\b`).test(frontendContent)
        if (alsoUsesSpanish) continue

        findings.push({
          apiFile: api.file,
          apiEndpoint: api.endpoint,
          spanishField,
          englishField,
          frontendFile: consumer.file,
          confidence,
        })
      }
    }
  }

  return findings
}

/* ─── Reporte ───────────────────────────────────────────────────────────────── */

function generateReport(findings: Finding[]): string {
  if (findings.length === 0) {
    return '✅ No se encontraron mismatches español ↔ inglés entre APIs y frontends.\n'
  }

  const high = findings.filter(f => f.confidence === 'high')
  const medium = findings.filter(f => f.confidence === 'medium')
  const low = findings.filter(f => f.confidence === 'low')

  let report = ''
  report += '╔═══════════════════════════════════════════════════════════════╗\n'
  report += '║  🔍 AUDITORÍA DE MISMATCH ESPAÑOL → INGLÉS                  ║\n'
  report += '╚═══════════════════════════════════════════════════════════════╝\n\n'
  report += `Total de mismatches detectados: ${findings.length}\n`
  report += `  🔴 Alta confianza:  ${high.length}\n`
  report += `  🟡 Media confianza: ${medium.length}\n`
  report += `  ⚪ Baja confianza:  ${low.length}\n\n`

  if (high.length > 0 || medium.length > 0) {
    report += '───────────────────────────────────────────────────────────────\n'
    report += '🔴🟡 Requieren revisión (alta/media confianza)\n'
    report += '───────────────────────────────────────────────────────────────\n\n'

    for (const f of [...high, ...medium]) {
      report += `🚨 ${f.confidence.toUpperCase()} CONFIDENCE\n`
      report += `   API:       ${path.relative(PROJECT_ROOT, f.apiFile)}\n`
      report += `   Endpoint:  ${f.apiEndpoint}\n`
      report += `   Campo:     ${f.spanishField} → ${f.englishField}\n`
      report += `   Frontend:  ${path.relative(PROJECT_ROOT, f.frontendFile)}\n`
      report += `   ⚠️  La API devuelve "${f.spanishField}" (español)\n`
      report += `       pero el frontend lee "${f.englishField}" (inglés)\n`
      report += `       → Posible TypeError si no hay mapeo en la API.\n\n`
    }
  }

  if (low.length > 0) {
    report += '───────────────────────────────────────────────────────────────\n'
    report += '⚪ Baja confianza (posibles falsos positivos)\n'
    report += '───────────────────────────────────────────────────────────────\n\n'
    for (const f of low.slice(0, 10)) {
      report += `   API: ${path.basename(f.apiFile)} → Frontend: ${path.basename(f.frontendFile)}\n`
      report += `   ${f.spanishField} → ${f.englishField}\n\n`
    }
    if (low.length > 10) {
      report += `   ... y ${low.length - 10} más (ver reporte completo en archivo)\n\n`
    }
  }

  report += '───────────────────────────────────────────────────────────────\n'
  report += '🛠️  Cómo corregir cada mismatch\n'
  report += '───────────────────────────────────────────────────────────────\n\n'
  report += 'Opción A (recomendada): Mapear en la API\n'
  report += '  En la API, antes de return NextResponse.json(...), añadir:\n'
  report += '    const mapped = data.map(item => ({\n'
  report += '      ...item,\n'
  report += '      englishField: item.spanishField,\n'
  report += '    }))\n\n'
  report += 'Opción B: Usar nombres españoles en el frontend\n'
  report += '  Cambiar entry.englishField → entry.spanishField\n'
  report += '  (solo si todo el sistema usa español para ese modelo)\n\n'

  return report
}

/* ─── Main ──────────────────────────────────────────────────────────────────── */

function main() {
  console.log('🔍 Escaneando APIs...')
  const apis = scanApis()
  console.log(`   ${apis.length} APIs con campos españoles sin mapear`)

  console.log('🔍 Escaneando frontends...')
  const frontends = scanFrontends()
  console.log(`   ${frontends.length} archivos frontend con consumo de APIs`)

  console.log('🔍 Cross-matching...')
  const findings = crossMatch(apis, frontends)
  console.log(`   ${findings.length} mismatches potenciales\n`)

  const report = generateReport(findings)
  console.log(report)

  // Guardar reporte
  const reportPath = path.join(PROJECT_ROOT, 'audit-mismatch-report.txt')
  fs.writeFileSync(reportPath, report)
  console.log(`📄 Reporte: ${path.relative(PROJECT_ROOT, reportPath)}`)

  if (findings.some(f => f.confidence === 'high' || f.confidence === 'medium')) {
    console.log('\n❌ Hay mismatches que requieren revisión.')
    process.exit(1)
  } else {
    console.log('\n✅ Sin mismatches críticos.')
    process.exit(0)
  }
}

main()
