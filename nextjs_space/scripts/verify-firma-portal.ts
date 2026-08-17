import jwt from 'jsonwebtoken'
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

const USER_ID = 'cms96c2im0006ju04dymt9fkb'
const TENANT_ID = 'cms92n0ii0001mf83yr9grk30'
const CONTACT_ID = 'cmsnie4a2000lkw040dmcq4vp'
const BASE = 'https://volkern.app'
const SSH = process.env.VOLKERN_SSH_KEY ? `ssh -i ${process.env.VOLKERN_SSH_KEY} -o StrictHostKeyChecking=no root@62.171.134.195` : 'ssh -i ~/.ssh/id_buffy_volkern -o StrictHostKeyChecking=no root@62.171.134.195'

const customerSecret = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026'
const nextAuthSecret = process.env.NEXTAUTH_SECRET!

function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function sessionCookie(): Promise<string> {
  const derived = await hkdf('sha256', nextAuthSecret, '', 'NextAuth.js Generated Encryption Key', 32)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: USER_ID, name: 'Test Portal', email: 'bruno.hess@dimensionexpert.com', picture: null,
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

/** Fuerza bruta del código de 6 dígitos contra el hash sha256 (solo para E2E). */
function bruteCode(codeHash: string): string | null {
  for (let n = 0; n < 1000000; n++) {
    const candidate = String(n).padStart(6, '0')
    if (createHash('sha256').update(candidate).digest('hex') === codeHash) return candidate
  }
  return null
}

async function main() {
  const cookie = await sessionCookie()

  // 1. Crear contrato real vía API
  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato verificación portal de firma',
      tipo: 'servicio', moneda: 'EUR',
      items: [{ concepto: 'Servicio portal', cantidad: 1, precioUnitario: 600, porcentajeImpuesto: 21 }],
    },
  })
  console.log(`${creado.status === 201 ? '✓' : '✗'} crear contrato -> HTTP ${creado.status}`)
  if (creado.status !== 201) { console.log(creado.text); process.exit(1) }
  const contratoId = creado.json.id
  const token = creado.json.tokenPublico
  console.log(`   → ${creado.json.numero} (token ${token?.slice(0, 8)}…)`)
  if (!token) { console.log('✗ sin tokenPublico'); process.exit(1) }

  // 2. Enviar el contrato (estado=enviado + email con enlace del portal)
  const enviado = await call('POST', `/api/contratos/${contratoId}/send`, {
    jwt: true,
    body: { email: 'bruno.hess@dimensionexpert.com', mensaje: 'E2E portal de firma' },
  })
  console.log(`${enviado.status === 200 ? '✓' : '✗'} enviar contrato (email portal) -> HTTP ${enviado.status}`)

  // 3. GET del portal público (sin recortar el HTML para verificar el contenido)
  const portalRes = await fetch(`${BASE}/firma/${token}`)
  const portalHtml = await portalRes.text()
  const portalOk = portalRes.status === 200 && /Portal de firma segura/.test(portalHtml) && portalHtml.includes(creado.json.numero)
  console.log(`${portalOk ? '✓' : '✗'} GET /firma/{token} -> HTTP ${portalRes.status} (HTML portal: ${portalOk})`)
  if (!portalOk) { console.log(portalHtml.slice(0, 400)); process.exit(1) }

  // 4. POST /code: envía el código real al email del firmante
  const codeRes = await call('POST', `/api/firma/${token}/code`, { body: { email: 'bruno.hess@dimensionexpert.com' } })
  console.log(`${codeRes.status === 200 ? '✓' : '✗'} POST /api/firma/{token}/code -> HTTP ${codeRes.status}`)
  if (codeRes.status !== 200) { console.log(codeRes.text); process.exit(1) }
  const challengeId = codeRes.json.challengeId
  const challengeToken = codeRes.json.challengeToken

  // 5. Leer el reto en BD (vía SSH+psql en el VPS) y recuperar el código real (fuerza bruta)
  const psqlCmd = `${SSH} "CID=\\$(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1); docker exec -i \\$CID psql -U volkern_erp -d volkern_erp -tA"`
  const psqlSql = `SELECT email, "expiresAt", "codeHash" FROM "contrato_firma_challenges" WHERE id='${challengeId}';`
  let row = ''
  try { row = execSync(psqlCmd, { encoding: 'utf8', input: psqlSql }).trim() } catch (e: any) { console.log('✗ no se pudo consultar la BD:', e.message); process.exit(1) }
  const [email, expiresAt, codeHash] = row.split('|').map((s) => s.trim())
  if (!codeHash) { console.log('✗ reto no encontrado en BD'); process.exit(1) }
  console.log(`   → reto creado para ${email}, expira ${expiresAt}`)
  const code = bruteCode(codeHash)
  if (!code) { console.log('✗ no se pudo recuperar el código'); process.exit(1) }
  console.log(`   → código recuperado: ${code}`)

  // 6. Firmar con el código real
  const signRes = await call('POST', `/api/firma/${token}/sign`, {
    body: { challengeId, challengeToken, code, nombreFirma: 'Cliente E2E Portal' },
  })
  console.log(`${signRes.status === 200 ? '✓' : '✗'} POST /api/firma/{token}/sign -> HTTP ${signRes.status} (${signRes.json?.estado})`)

  // 7. Verificar el estado del contrato + timeline
  await new Promise((r) => setTimeout(r, 1500))
  const detalle = await call('GET', `/api/contratos/${contratoId}`, { jwt: true })
  const c = detalle.json || {}
  // 'firmado' (solo cliente) o 'vigente' (ambas partes) son resultados válidos
  const firmadoOk = c.firmadoPorCliente === true && ['firmado', 'vigente'].includes(c.estado) && c.nombreFirmaCliente === 'Cliente E2E Portal'
  console.log(`${firmadoOk ? '✓' : '✗'} contrato firmado por cliente (estado ${c.estado}, firma ${c.nombreFirmaCliente})`)
  const timeline = c.timeline || []
  const hasSigned = timeline.some((ev: any) => ev.action === 'document_signed')
  console.log(`${hasSigned ? '✓' : '✗'} document_signed en el timeline (${timeline.length} eventos)`)
  timeline.forEach((ev: any) => console.log(`     • [${ev.action}] ${ev.note}`))

  // 8. Reto verificado
  let verifiedAt = ''
  try {
    verifiedAt = execSync(psqlCmd, {
      encoding: 'utf8',
      input: `SELECT "verifiedAt" IS NOT NULL FROM "contrato_firma_challenges" WHERE id='${challengeId}';`,
    }).trim()
  } catch { /* ignore */ }
  console.log(`${verifiedAt === 't' ? '✓' : '✗'} reto marcado como verificado`)

  // 9. Limpiar (el DELETE puede rechazar contratos firmados por integridad; la limpieza final se hace en BD)
  const del = await call('DELETE', `/api/contratos/${contratoId}`, { jwt: true })
  console.log(`${del.status === 200 ? '✓' : '·'} limpiar contrato vía API -> HTTP ${del.status} (${del.json?.error || ''})`)

  const ok = portalOk && codeRes.status === 200 && signRes.status === 200 && firmadoOk && hasSigned && verifiedAt === 't'
  console.log(`\n${ok ? '=== VERIFICACIÓN PORTAL DE FIRMA COMPLETA ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
