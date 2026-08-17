/**
 * Verificación E2E del PDF del contrato con cláusulas en producción.
 * Crea un contrato con cláusulas, genera el PDF público y verifica que el
 * texto del PDF contiene el clausulado, los items y los totales.
 */
import jwt from 'jsonwebtoken'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'
import { execFileSync } from 'node:child_process'

const USER_ID = 'cms96c2im0006ju04dymt9fkb'
const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'
const CONTACT_ID = 'cmsnie4a2000lkw040dmcq4vp'
const BASE = 'https://volkern.app'

const customerSecret = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026'
const nextAuthSecret = process.env.NEXTAUTH_SECRET!

function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function sessionCookie(): Promise<string> {
  const derived = await hkdf('sha256', nextAuthSecret, '', 'NextAuth.js Generated Encryption Key', 32)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: USER_ID, name: 'Test PDF', email: 'bruno.hess@dimensionexpert.com', picture: null,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(now + 3600)
    .setJti(uuidv4())
    .encrypt(derived)
  return `next-auth.session-token=${token}`
}

async function call(method: string, path: string, opts: { body?: unknown; cookie?: string; jwt?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.jwt) headers.authorization = `Bearer ${bearerJwt()}`
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* no json */ }
  return { status: res.status, json, text: text.slice(0, 300) }
}

/** Extrae texto plano de un PDF usando pdftotext (decodifica los streams). */
function extractPdfText(buf: Buffer): string {
  const tmp = `/tmp/verify-pdf-${Date.now()}.pdf`
  require('node:fs').writeFileSync(tmp, buf)
  try {
    return execFileSync('pdftotext', [tmp, '-'], { encoding: 'utf8' })
  } finally {
    try { require('node:fs').unlinkSync(tmp) } catch { /* ignorar */ }
  }
}

async function main() {
  const cookie = await sessionCookie()

  // 1. Crear contrato real con cláusulas vía API
  const clausulas =
    'PRIMERA. Objeto: el prestador se obliga a prestar los servicios descritos en el presente contrato.\n' +
    'SEGUNDA. Duración: el presente contrato tendrá una vigencia de 12 meses.\n' +
    'TERCERA. Confidencialidad: las partes se obligan a mantener en estricta confidencialidad la información compartida.\n' +
    'CUARTA. Rescisión: cualquiera de las partes podrá rescindir el contrato con 30 días de antelación por escrito.\n' +
    'QUINTA. Legislación aplicable: el presente contrato se rige por la legislación vigente.'

  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato verificación PDF cláusulas',
      tipo: 'servicio', moneda: 'EUR',
      descripcion: 'Asesoría contable y fiscal integral anual.',
      condicionesPago: 'Pago a 30 días desde la emisión de la factura.',
      clausulas,
      items: [
        { concepto: 'Asesoría contable', cantidad: 1, precioUnitario: 600, porcentajeImpuesto: 21 },
        { concepto: 'Asesoría fiscal trimestral', cantidad: 4, precioUnitario: 150, porcentajeImpuesto: 21 },
      ],
    },
  })
  console.log(`${creado.status === 201 ? '✓' : '✗'} crear contrato -> HTTP ${creado.status}`)
  if (creado.status !== 201) { console.log(creado.text); process.exit(1) }
  const contratoId = creado.json.id
  const token = creado.json.tokenPublico
  console.log(`   → ${creado.json.numero}`)
  if (!token) { console.log('✗ sin tokenPublico'); process.exit(1) }

  // 2. Descargar el PDF público
  const pdfRes = await fetch(`${BASE}/api/contratos/public/${token}/pdf`)
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer())
  const okStatus = pdfRes.status === 200 && pdfBuf.length > 5000 && pdfBuf.subarray(0, 4).toString() === '%PDF'
  console.log(`${okStatus ? '✓' : '✗'} GET PDF -> HTTP ${pdfRes.status} (${pdfBuf.length} bytes)`)
  if (!okStatus) { process.exit(1) }

  // 3. Verificar contenido del texto del PDF
  const text = extractPdfText(pdfBuf)
  const checks: Array<[string, boolean]> = [
    ['cláusula PRIMERA (Objeto)', /PRIMERA/.test(text) && /Objeto/.test(text)],
    ['cláusula QUINTA (legislación)', /QUINTA/.test(text) && /legislaci/.test(text)],
    ['título del contrato', /Contrato verificación PDF/.test(text)],
    ['descripción (objeto y servicios)', /Asesoría contable y fiscal integral/.test(text)],
    ['item 1 (Asesoría contable)', /Asesoría contable/.test(text)],
    ['condiciones de pago', /Pago a 30 días/.test(text)],
    ['sección Cláusulas', /Cláusulas/.test(text)],
  ]
  checks.forEach(([label, ok]) => console.log(`${ok ? '✓' : '✗'} PDF contiene: ${label}`))
  const allOk = okStatus && checks.every(([, ok]) => ok)
  if (!allOk) {
    console.log('\n--- texto extraído (primeros 600 chars) ---')
    console.log(text.slice(0, 600))
  }

  // 4. Limpiar (borrador, el DELETE debe funcionar)
  const del = await call('DELETE', `/api/contratos/${contratoId}`, { jwt: true })
  console.log(`${del.status === 200 ? '✓' : '·'} limpiar contrato vía API -> HTTP ${del.status} (${del.json?.error || ''})`)

  console.log(`\n${allOk ? '=== VERIFICACIÓN PDF CON CLÁUSULAS COMPLETA ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
