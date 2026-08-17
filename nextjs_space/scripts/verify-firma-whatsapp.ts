/**
 * Verificación E2E de la firma por WhatsApp en producción.
 * Crea un contrato cuyo contacto tiene el número real del WhatsApp del Negocio,
 * envía el código por WhatsApp, lo recupera en BD, firma el contrato y verifica.
 */
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

// Número real de WhatsApp del usuario (para recibir el código de prueba)
const WHATSAPP_REAL = '+34600971950'

const customerSecret = process.env.CUSTOMER_JWT_SECRET || 'volkern-customer-portal-secret-2026'
const nextAuthSecret = process.env.NEXTAUTH_SECRET!

function bearerJwt(): string {
  return jwt.sign({ uid: USER_ID, tid: TENANT_ID }, customerSecret, { expiresIn: '1h' })
}

async function sessionCookie(): Promise<string> {
  const derived = await hkdf('sha256', nextAuthSecret, '', 'NextAuth.js Generated Encryption Key', 32)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: USER_ID, name: 'Test WhatsApp', email: 'bruno.hess@dimensionexpert.com', picture: null,
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

function bruteCode(codeHash: string): string | null {
  for (let n = 0; n < 1000000; n++) {
    const candidate = String(n).padStart(6, '0')
    if (createHash('sha256').update(candidate).digest('hex') === codeHash) return candidate
  }
  return null
}

async function main() {
  const cookie = await sessionCookie()

  // 1. Poner el teléfono real en el contacto ANTES de crear el contrato
  //    (el contrato copia clienteTelefono del contacto al crearse)
  const setPhone = await call('PATCH', `/api/contacts/${CONTACT_ID}`, {
    jwt: true,
    body: { telefono: WHATSAPP_REAL },
  })
  console.log(`${setPhone.status === 200 ? '✓' : '✗'} set teléfono real en contacto -> HTTP ${setPhone.status}`)
  if (setPhone.status !== 200) { console.log(setPhone.text); process.exit(1) }

  // 2. Crear contrato real vía API (ya con el teléfono real copiado)
  const creado = await call('POST', '/api/contratos', {
    jwt: true,
    body: {
      contactId: CONTACT_ID,
      titulo: 'Contrato verificación firma WhatsApp',
      tipo: 'servicio', moneda: 'EUR',
      items: [{ concepto: 'Servicio firma WhatsApp', cantidad: 1, precioUnitario: 500, porcentajeImpuesto: 21 }],
    },
  })
  console.log(`${creado.status === 201 ? '✓' : '✗'} crear contrato -> HTTP ${creado.status}`)
  if (creado.status !== 201) { console.log(creado.text); process.exit(1) }
  const contratoId = creado.json.id
  const token = creado.json.tokenPublico
  console.log(`   → ${creado.json.numero} (token ${token?.slice(0, 8)}…)`)
  if (!token) { console.log('✗ sin tokenPublico'); process.exit(1) }

  // 2b. Enviar el contrato (estado borrador → enviado, requisito para poder firmar)
  const enviado = await call('POST', `/api/contratos/${contratoId}/send`, {
    jwt: true,
    body: { email: 'bruno.hess@dimensionexpert.com', mensaje: 'E2E firma por WhatsApp' },
  })
  console.log(`${enviado.status === 200 ? '✓' : '✗'} enviar contrato (estado=enviado) -> HTTP ${enviado.status}`)
  if (enviado.status !== 200) { console.log(enviado.text); process.exit(1) }

  // 3. GET de canales: debe listar WhatsApp con el número real enmascarado
  const canales = await call('GET', `/api/firma/${token}/code`)
  const chanOk = canales.status === 200 && (canales.json?.channels || []).some((c: any) => c.channel === 'whatsapp')
  console.log(`${chanOk ? '✓' : '✗'} GET /api/firma/{token}/code -> HTTP ${canales.status}`)
  ;(canales.json?.channels || []).forEach((c: any) => console.log(`     • ${c.channel}: ${c.destinationMasked}`))

  // 4. Enviar el código POR WHATSAPP
  const waRes = await call('POST', `/api/firma/${token}/code`, { body: { channel: 'whatsapp' } })
  console.log(`${waRes.status === 200 ? '✓' : '✗'} POST /code (whatsapp) -> HTTP ${waRes.status} (${waRes.json?.destinationMasked})`)
  if (waRes.status !== 200) { console.log(waRes.text); process.exit(1) }
  const challengeId = waRes.json.challengeId
  const challengeToken = waRes.json.challengeToken

  // 5. Recuperar el código real en BD (vía SSH+psql, CID obtenido aparte para evitar escapes)
  let pgId = ''
  try {
    pgId = execSync(`${SSH} "docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1"`, { encoding: 'utf8' }).trim()
  } catch { /* ignorar */ }
  const psqlCmd = `${SSH} "docker exec -i ${pgId} psql -U volkern_erp -d volkern_erp -tA"`
  let row = ''
  try {
    row = execSync(psqlCmd, {
      encoding: 'utf8',
      input: `SELECT channel, telefono, "codeHash" FROM "contrato_firma_challenges" WHERE id='${challengeId}';`,
    }).trim()
  } catch (e: any) { console.log('✗ no se pudo consultar la BD:', e.message); process.exit(1) }
  const [channel, telefono, codeHash] = row.split('|').map((s) => s.trim())
  if (!codeHash) { console.log('✗ reto no encontrado en BD'); process.exit(1) }
  console.log(`   → reto canal=${channel} telefono=${telefono}`)
  const code = bruteCode(codeHash)
  if (!code) { console.log('✗ no se pudo recuperar el código'); process.exit(1) }
  console.log(`   → código recuperado: ${code}`)

  // 6. Firmar con el código real
  const signRes = await call('POST', `/api/firma/${token}/sign`, {
    body: { challengeId, challengeToken, code, nombreFirma: 'Cliente E2E WhatsApp' },
  })
  console.log(`${signRes.status === 200 ? '✓' : '✗'} POST /api/firma/{token}/sign -> HTTP ${signRes.status} (${signRes.json?.estado})`)
  if (signRes.status !== 200) { console.log(signRes.text); process.exit(1) }

  // 7. Verificar estado del contrato + timeline
  await new Promise((r) => setTimeout(r, 1500))
  const detalle = await call('GET', `/api/contratos/${contratoId}`, { jwt: true })
  const c = detalle.json || {}
  const firmadoOk = c.firmadoPorCliente === true && ['firmado', 'vigente'].includes(c.estado) && c.nombreFirmaCliente === 'Cliente E2E WhatsApp'
  console.log(`${firmadoOk ? '✓' : '✗'} contrato firmado por cliente (estado ${c.estado}, firma ${c.nombreFirmaCliente})`)
  const timeline = c.timeline || []
  const signedEv = timeline.find((ev: any) => ev.action === 'document_signed')
  console.log(`${signedEv ? '✓' : '✗'} document_signed en el timeline`)
  if (signedEv) console.log(`     • ${signedEv.note}`)

  // 8. Restaurar el teléfono del contacto (quitar el número de prueba)
  await call('PATCH', `/api/contacts/${CONTACT_ID}`, { jwt: true, body: { telefono: null } })

  // 9. Limpiar (el DELETE rechaza contratos firmados; la limpieza final se hace en BD)
  const del = await call('DELETE', `/api/contratos/${contratoId}`, { jwt: true })
  console.log(`${del.status === 200 ? '✓' : '·'} limpiar contrato vía API -> HTTP ${del.status} (${del.json?.error || ''})`)

  const ok = chanOk && waRes.status === 200 && signRes.status === 200 && firmadoOk && Boolean(signedEv)
  console.log(`\n${ok ? '=== VERIFICACIÓN FIRMA POR WHATSAPP COMPLETA ✅ ===' : '=== HUBO FALLOS ❌ ==='}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
