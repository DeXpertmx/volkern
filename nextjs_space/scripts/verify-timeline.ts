import jwt from 'jsonwebtoken'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'

const USER_ID = 'cms96c2im0006ju04dymt9fkb'
const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'
const CONTACT_ID = 'cmsnie4a2000lkw040dmcq4vp'
const BASE = 'https://volkern.app'

const customerSecret = process.env.CUSTOMER_JWT_SECRET!
const nextAuthSecret = process.env.NEXTAUTH_SECRET!

function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function sessionCookie(): Promise<string> {
  const derived = await hkdf('sha256', nextAuthSecret, '', 'NextAuth.js Generated Encryption Key', 32)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: USER_ID, name: 'Test Timeline', email: 'bruno.hess@dimensionexpert.com', picture: null,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(now + 3600)
    .setJti(uuidv4())
    .encrypt(derived)
  return `next-auth.session-token=${token}`
}

async function call(method: string, path: string, opts: { body?: unknown; cookie?: string; jwt?: boolean; form?: boolean } = {}) {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.jwt) headers.authorization = `Bearer ${bearerJwt()}`
  if (opts.body !== undefined && !opts.form) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? (opts.form ? (opts.body as BodyInit) : JSON.stringify(opts.body)) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* no json */ }
  return { status: res.status, json, text: text.slice(0, 300) }
}

async function main() {
  const cookie = await sessionCookie()

  // 1. Configurar firma real
  const cfg = await call('POST', '/api/integraciones/firma-digital', {
    cookie,
    body: { url: 'http://libresign', apiToken: '••••••••', webhookSecret: 'secret-timeline-test-2026', isActive: true, webhookSignatureOptional: false },
  })
  console.log(`${cfg.status === 200 ? '✓' : '✗'} configurar firma -> HTTP ${cfg.status}`)

  // 2. Crear contrato
  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato verificación timeline',
      tipo: 'servicio', moneda: 'EUR',
      items: [{ concepto: 'Servicio timeline', cantidad: 1, precioUnitario: 500, porcentajeImpuesto: 21 }],
    },
  })
  console.log(`${creado.status === 201 ? '✓' : '✗'} crear contrato -> HTTP ${creado.status}`)
  if (creado.status !== 201) { console.log(creado.text); process.exit(1) }
  const contratoId = creado.json.id
  console.log(`   → ${creado.json.numero} (${contratoId})`)

  // 3. Disparar firma
  const firma = await call('POST', `/api/contratos/${contratoId}/volkernsign`, { jwt: true })
  console.log(`${firma.status === 200 ? '✓' : '✗'} disparar firma -> HTTP ${firma.status} uuid=${firma.json?.uuid}`)

  // 4. Webhook multipart nativo con status=3 (SIGNED)
  const form = new FormData()
  form.append('uuid', firma.json.uuid)
  form.append('status', '3')
  form.append('signer_email', 'info@grupocasalola.com')
  const wh = await call('POST', `/api/webhooks/signatures?tenantId=${TENANT_ID}`, { form: true, body: form })
  console.log(`${wh.status === 200 ? '✓' : '✗'} webhook multipart status=3 -> HTTP ${wh.status}`)
  if (wh.status === 200) console.log(`   → eventId=${wh.json?.eventId}`)

  // 5. Consultar timeline del contrato
  await new Promise(r => setTimeout(r, 1500))
  const detalle = await call('GET', `/api/contratos/${contratoId}`, { jwt: true })
  console.log(`${detalle.status === 200 ? '✓' : '✗'} GET contrato -> HTTP ${detalle.status}`)
  const timeline = detalle.json?.timeline || []
  console.log(`   → eventos en timeline: ${timeline.length}`)
  timeline.forEach((ev: any) => {
    console.log(`     • [${new Date(ev.createdAt).toISOString()}] ${ev.action} — ${ev.note}`)
  })
  const hasSigned = timeline.some((ev: any) => ev.action === 'document_signed')
  console.log(`${hasSigned ? '✓' : '✗'} document_signed registrado en timeline`)

  // 6. Limpiar
  const del = await call('DELETE', `/api/contratos/${contratoId}`, { jwt: true })
  console.log(`${del.status === 200 ? '✓' : '✗'} limpiar contrato -> HTTP ${del.status}`)

  const ok = cfg.status === 200 && creado.status === 201 && firma.status === 200 && wh.status === 200 && hasSigned
  console.log(`\n${ok ? '=== VERIFICACIÓN TIMELINE COMPLETA ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1) })
