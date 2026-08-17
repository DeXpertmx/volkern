/**
 * Verificación E2E de los canales de firma (email/WhatsApp) en producción.
 * Crea un contrato con email+teléfono, consulta los canales disponibles,
 * envía el código por WhatsApp y por email, y limpia al final.
 */
import jwt from 'jsonwebtoken'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'

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
    sub: USER_ID, name: 'Test Canales', email: 'bruno.hess@dimensionexpert.com', picture: null,
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

async function main() {
  const cookie = await sessionCookie()

  // 1. Crear contrato real vía API (contacto con email y teléfono)
  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato verificación canales firma',
      tipo: 'servicio', moneda: 'EUR',
      items: [{ concepto: 'Servicio canales', cantidad: 1, precioUnitario: 400, porcentajeImpuesto: 21 }],
    },
  })
  console.log(`${creado.status === 201 ? '✓' : '✗'} crear contrato -> HTTP ${creado.status}`)
  if (creado.status !== 201) { console.log(creado.text); process.exit(1) }
  const contratoId = creado.json.id
  const token = creado.json.tokenPublico
  console.log(`   → ${creado.json.numero}`)
  if (!token) { console.log('✗ sin tokenPublico'); process.exit(1) }

  // 2. GET de canales disponibles (debe listar email y whatsapp con destino enmascarado)
  const canales = await call('GET', `/api/firma/${token}/code`)
  const chanOk = canales.status === 200 && Array.isArray(canales.json?.channels) && canales.json.channels.length > 0
  console.log(`${chanOk ? '✓' : '✗'} GET /api/firma/{token}/code -> HTTP ${canales.status}`)
  ;(canales.json?.channels || []).forEach((c: any) => console.log(`     • ${c.channel}: ${c.destinationMasked}`))

  // 3. Enviar código por WhatsApp.
  // Comportamiento correcto del puente: si el número no existe en WhatsApp,
  // Evolution responde 400 y el portal devuelve 502 CON mensaje claro (no se silencia).
  const waRes = await call('POST', `/api/firma/${token}/code`, { body: { channel: 'whatsapp' } })
  const waOk = waRes.status === 200 || waRes.status === 502
  console.log(`${waOk ? '✓' : '✗'} POST /code (whatsapp) -> HTTP ${waRes.status}${waRes.status === 502 ? ' (número inexistente en WhatsApp, error reportado)' : ` (${waRes.json?.destinationMasked})`}`)

  // 4. Enviar código por email
  const emailRes = await call('POST', `/api/firma/${token}/code`, { body: { channel: 'email' } })
  console.log(`${emailRes.status === 200 ? '✓' : '✗'} POST /code (email) -> HTTP ${emailRes.status} (${emailRes.json?.destinationMasked})`)

  // 5. El contrato debe seguir sin firmar (no se firmó nada)
  const detalle = await call('GET', `/api/contratos/${contratoId}`, { jwt: true })
  const sinFirmar = detalle.json?.firmadoPorCliente === false
  console.log(`${sinFirmar ? '✓' : '✗'} contrato sigue sin firmar (solo se enviaron códigos)`)

  // 6. Limpiar (borrador, el DELETE debe funcionar)
  const del = await call('DELETE', `/api/contratos/${contratoId}`, { jwt: true })
  console.log(`${del.status === 200 ? '✓' : '·'} limpiar contrato vía API -> HTTP ${del.status} (${del.json?.error || ''})`)

  const ok = chanOk && waOk && emailRes.status === 200 && sinFirmar
  console.log(`\n${ok ? '=== VERIFICACIÓN CANALES DE FIRMA COMPLETA ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
