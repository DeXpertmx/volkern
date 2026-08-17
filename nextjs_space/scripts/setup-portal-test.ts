import jwt from 'jsonwebtoken'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'

const USER_ID = 'cms96c2im0006ju04dymt9fkb'
const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'
const CONTACT_ID = 'cmsnie4a2000lkw040dmcq4vp'
const BASE = 'https://volkern.app'
const EMAIL = 'bruno.hess@dimensionexpert.com'

const customerSecret = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026'
const nextAuthSecret = process.env.NEXTAUTH_SECRET!

function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function sessionCookie(): Promise<string> {
  const derived = await hkdf('sha256', nextAuthSecret, '', 'NextAuth.js Generated Encryption Key', 32)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: USER_ID, name: 'Test Portal', email: EMAIL, picture: null,
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
  return { status: res.status, json, text: text.slice(0, 200) }
}

async function main() {
  const cookie = await sessionCookie()

  // 1. Crear contrato real para prueba manual
  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato prueba portal manual',
      tipo: 'servicio', moneda: 'EUR',
      items: [{ concepto: 'Asesoría contable y fiscal', cantidad: 1, precioUnitario: 890, porcentajeImpuesto: 21 }],
    },
  })
  if (creado.status !== 201) { console.log('✗ crear contrato:', creado.text); process.exit(1) }
  const token = creado.json.tokenPublico
  console.log(`✓ Contrato creado: ${creado.json.numero}`)
  console.log(`🔗 Portal: ${BASE}/firma/${token}`)

  // 2. Enviar por email (llegará el enlace del portal a tu correo)
  const enviado = await call('POST', `/api/contratos/${creado.json.id}/send`, {
    jwt: true,
    body: { email: EMAIL, mensaje: 'Prueba del portal de firma: abre el enlace, solicita el código y firma.' },
  })
  console.log(`${enviado.status === 200 ? '✓' : '✗'} Email con enlace del portal enviado a ${EMAIL} (HTTP ${enviado.status})`)
  if (enviado.status !== 200) console.log(enviado.text)

  const ok = creado.status === 201 && enviado.status === 200
  console.log(`\n${ok ? '=== CONTRATO LISTO PARA PROBAR EL PORTAL A MANO ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })
