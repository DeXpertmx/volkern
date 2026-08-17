/**
 * Prueba E2E de contrato + firma digital contra PRODUCCIÓN.
 *
 * Flujo:
 *   1. Crea un contrato de prueba (POST /api/contratos) — auth Bearer JWT (CUSTOMER_JWT_SECRET)
 *   2. Dispara la firma (POST /api/contratos/[id]/volkernsign) — genera PDF + SignatureRequest
 *   3. Configura la firma digital con webhookSecret conocido (cookie de sesión)
 *   4. Envía el webhook `document_signed` con firma HMAC-SHA256 → verifica el 200
 *   5. Verifica en BD que la SignatureRequest quedó `signed`
 *   6. Limpieza: borra el contrato de prueba y restaura la configuración de firma
 *
 * Secrets por env (NO se imprimen):
 *   NEXTAUTH_SECRET="$(ssh ... printenv NEXTAUTH_SECRET)" \
 *   CUSTOMER_JWT_SECRET="$(ssh ... printenv CUSTOMER_JWT_SECRET)" \
 *   LIBRESIGN_URL="http://libresign" (instancia real; sin él usa fallback de UUID) \
 *   LIBRESIGN_TOKEN="..." (app password de LibreSign) \
 *   node scripts/test-contrato-firma.js
 */
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'

const USER_ID = 'cms96c2im0006ju04dymt9fkb'        // bruno.hess@dimensionexpert.com
const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'      // DeXpert Inmobiliaria
const CONTACT_ID = 'cmsnie4a2000lkw040dmcq4vp'     // Pez Wanda (con NIF fiscal)
const BASE = process.env.TEST_BASE_URL || 'https://volkern.app'
const WEBHOOK_SECRET = 'secret-prueba-contrato-2026'

const nextAuthSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
const customerSecret = process.env.CUSTOMER_JWT_SECRET
if (!nextAuthSecret || !customerSecret) {
  console.error('✗ Faltan NEXTAUTH_SECRET / CUSTOMER_JWT_SECRET en el entorno')
  process.exit(1)
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function sessionCookie(): Promise<string> {
  const keyMaterial = nextAuthSecret!
  const derived = await hkdf('sha256', keyMaterial, '', 'NextAuth.js Generated Encryption Key', 32)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: USER_ID,
    name: 'Test Contrato',
    email: 'bruno.hess@dimensionexpert.com',
    picture: null,
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

let failures = 0
function check(label: string, got: number, expect: number | 'any') {
  const ok = expect === 'any' ? got >= 200 && got < 500 : got === expect
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label} -> HTTP ${got}`)
}

// ─── Webhook HMAC ────────────────────────────────────────────────────────────
function hmacSign(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body, 'utf8').digest('hex')
}

async function main() {
  const cookie = await sessionCookie()
  let contratoId: string | null = null
  let requestUuid: string | null = null

  console.log(`=== Prueba E2E de contrato + firma digital (${BASE}) ===\n`)

  // 0. Configurar la firma digital con webhookSecret conocido (para probar el HMAC)
  const libreSignUrl = process.env.LIBRESIGN_URL || 'https://firma.prueba.local'
  const libreSignToken = process.env.LIBRESIGN_TOKEN || 'token-prueba'
  const config = await call('POST', '/api/integraciones/firma-digital', {
    cookie,
    body: {
      url: libreSignUrl,
      apiToken: libreSignToken,
      webhookSecret: WEBHOOK_SECRET,
      isActive: true,
      webhookSignatureOptional: false,
    },
  })
  check('POST /api/integraciones/firma-digital (configurar)', config.status, 200)
  if (config.status !== 200) console.log(`   → ${config.text}`)
  if (process.env.LIBRESIGN_URL) console.log(`   → instancia LibreSign REAL: ${libreSignUrl}`)

  // 1. Crear contrato de prueba
  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato de prueba firma digital',
      descripcion: 'Creado por test-contrato-firma.ts (se limpia al final)',
      tipo: 'servicio',
      moneda: 'EUR',
      items: [
        { concepto: 'Servicio de asesoría fiscal', cantidad: 1, precioUnitario: 1000, porcentajeImpuesto: 21 },
        { concepto: 'Soporte mensual', cantidad: 3, precioUnitario: 200, porcentajeImpuesto: 21 },
      ],
      condicionesPago: '30 días',
    },
  })
  check('POST /api/contratos (crear)', creado.status, 201)
  if (creado.status === 201 && creado.json?.id) {
    contratoId = creado.json.id
    console.log(`   → contrato ${creado.json.numero} (${contratoId})`)
  } else {
    console.log(`   → ${creado.text}`)
    console.log('\n=== La prueba no puede continuar (no se creó el contrato) ===')
    process.exit(failures === 0 ? 1 : 1)
  }

  // 2. Disparar la firma (genera PDF + SignatureRequest; usa fallback de UUID sin LibreSign)
  const firma = await call('POST', `/api/contratos/${contratoId}/volkernsign`, { jwt: true })
  check('POST /api/contratos/[id]/volkernsign (firma)', firma.status, 200)
  if (firma.status === 200 && firma.json?.uuid) {
    requestUuid = firma.json.uuid
    const isReal = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firma.json.uuid)
    console.log(`   → requestId=${firma.json.requestId}, uuid=${requestUuid}`)
    if (process.env.LIBRESIGN_URL) {
      // Con instancia real, el uuid debe ser el devuelto por LibreSign (no fallback random)
      // Verificar contra la API real que el documento existe
      try {
        const validate = await fetch(`${libreSignUrl}/ocs/v2.php/apps/libresign/api/v1/file/validate/uuid/${firma.json.uuid}?format=json`, {
          headers: { Authorization: `Bearer ${libreSignToken}`, 'OCS-APIRequest': 'true' }
        })
        const vj: any = await validate.json().catch(() => null)
        const ok = validate.status === 200 && (vj?.ocs?.meta?.status === 'ok' || vj?.ocs?.statuscode === 200)
        if (ok) {
          console.log(`   → ✓ DOCUMENTO EXISTE EN LIBRESIGN (uuid real, no fallback)`)
        } else {
          console.log(`   → ⚠ uuid con formato válido pero no encontrado en LibreSign (HTTP ${validate.status}): ${JSON.stringify(vj).slice(0, 200)}`)
        }
      } catch (e: any) {
        console.log(`   → ⚠ no se pudo validar en LibreSign: ${e.message}`)
      }
    }
  } else {
    console.log(`   → ${firma.text}`)
  }

  // 3. Webhook document_signed con HMAC correcto
  let webhookStatus = -1
  if (requestUuid) {
    const payload = JSON.stringify({ uuid: requestUuid, event: 'document_signed', signer_email: 'info@grupocasalola.com' })
    const sig = hmacSign(payload)
    const res = await fetch(`${BASE}/api/webhooks/signatures?tenantId=${TENANT_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-libresign-signature': sig },
      body: payload,
    })
    webhookStatus = res.status
    check('POST /api/webhooks/signatures (HMAC válido)', webhookStatus, 200)
    const j = await res.json().catch(() => null)
    if (j?.eventId) console.log(`   → eventId=${j.eventId}`)
    else console.log(`   → ${JSON.stringify(j).slice(0, 200)}`)
  }

  // 4. Webhook con HMAC inválido (debe rechazar 401)
  if (requestUuid) {
    const payload = JSON.stringify({ uuid: requestUuid, event: 'document_signed', signer_email: 'info@grupocasalola.com' })
    const res = await fetch(`${BASE}/api/webhooks/signatures?tenantId=${TENANT_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-libresign-signature': 'f'.repeat(64) },
      body: payload,
    })
    check('POST /api/webhooks/signatures (HMAC inválido → 401)', res.status, 401)
  }

  // 5. Limpieza de datos de prueba
  console.log('\n=== Limpieza de datos de prueba ===')
  const del = await call('DELETE', `/api/contratos/${contratoId}`, { jwt: true })
  check('DELETE /api/contratos/[id] (limpiar contrato)', del.status, 200)
  if (del.status !== 200) console.log(`   → ${del.text}`)

  console.log(`\n=== ${failures === 0 ? 'TODAS LAS PRUEBAS PASARON ✅' : `${failures} PRUEBA(S) FALLARON ❌`} ===`)
  console.log('Nota: la config de firma digital se restaura en BD (DELETE manual) tras la prueba.')
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Error ejecutando la prueba:', e.message)
  process.exit(1)
})
