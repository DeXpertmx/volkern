/**
 * Prueba autenticada del dashboard de scoring contra PRODUCCIÓN.
 *
 * NextAuth 4.24 NO firma HS256: cifra el token como JWE (alg: dir, enc: A256GCM)
 * con una clave derivada por HKDF del NEXTAUTH_SECRET. Este script replica
 * exactamente `encode()` de next-auth/jwt usando `jose` y `@panva/hkdf`,
 * luego recorre los endpoints de scoring con la cookie de sesión.
 *
 * El secret se pasa por env (NO se imprime):
 *   NEXTAUTH_SECRET="$(ssh ... printenv NEXTAUTH_SECRET)" \
 *     node scripts/test-scoring-auth.js <userId> <leadId>
 */
import { EncryptJWT } from 'jose'
import hkdf from '@panva/hkdf'
import { v4 as uuidv4 } from 'uuid'

const [userId, leadId] = process.argv.slice(2)
if (!userId || !leadId) {
  console.error('Uso: node scripts/test-scoring-auth.js <userId> <leadId>')
  process.exit(1)
}

const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
if (!secret) {
  console.error('✗ NEXTAUTH_SECRET no está en el entorno')
  process.exit(1)
}

// Replica getDerivedEncryptionKey de next-auth/jwt
async function getDerivedEncryptionKey(keyMaterial: string, salt = '') {
  return hkdf('sha256', keyMaterial, salt, `NextAuth.js Generated Encryption Key${salt ? ` (${salt})` : ''}`, 32)
}

async function main() {
  const encryptionSecret = await getDerivedEncryptionKey(secret)
  const now = Math.floor(Date.now() / 1000)
  const token = await new EncryptJWT({
    sub: userId,
    name: 'Test Scoring',
    email: 'bruno.hess@dimensionexpert.com',
    picture: null,
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(now + 3600)
    .setJti(uuidv4())
    .encrypt(encryptionSecret)

  // OJO: aunque next-auth en producción usa el prefijo __Secure-, tras Cloudflare
  // la cookie que llega al origen y que lee getServerSession es la normal.
  // Verificado en vivo: `next-auth.session-token` -> 200, `__Secure-...` -> 401.
  const cookie = `next-auth.session-token=${token}`
  const BASE = process.env.TEST_BASE_URL || 'https://volkern.app'
  let failures = 0

  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        cookie,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* no json */ }
    return { status: res.status, json, text: text.slice(0, 200) }
  }

  function check(label: string, { status }: { status: number }, expect: number | 'any') {
    const ok = expect === 'any' ? status >= 200 && status < 500 : status === expect
    if (!ok) failures++
    console.log(`${ok ? '✓' : '✗'} ${label} -> HTTP ${status}`)
  }

  console.log(`=== Prueba autenticada del dashboard de scoring (${BASE}) ===\n`)

  // 1. Listar reglas (GET)
  const rules = await call('GET', '/api/scoring/rules')
  check('GET /api/scoring/rules (listado)', rules, 200)
  if (Array.isArray(rules.json)) {
    console.log(`   → ${rules.json.length} reglas en BD`)
  }

  // 2. Categorías (GET)
  const cats = await call('GET', '/api/scoring/categories')
  check('GET /api/scoring/categories', cats, 200)
  if (Array.isArray(cats.json)) {
    console.log(`   → ${cats.json.length} categorías`)
  }

  // 3. Stats (GET)
  const stats = await call('GET', '/api/scoring/stats')
  check('GET /api/scoring/stats', stats, 200)
  if (stats.json) {
    console.log(`   → ${JSON.stringify(stats.json).slice(0, 140)}`)
  }

  // 4. Score de un lead real (GET)
  const lead = await call('GET', `/api/scoring/lead/${leadId}`)
  check('GET /api/scoring/lead/[id] (score)', lead, 200)
  if (lead.json && lead.json.score) {
    const s = lead.json.score
    console.log(`   → score=${s.score ?? JSON.stringify(s).slice(0, 120)}`)
  } else if (lead.json && lead.json.error) {
    console.log(`   → ${lead.json.error}`)
  }

  // 5. Recalcular score del lead (POST)
  const recalc = await call('POST', `/api/scoring/lead/${leadId}`)
  check('POST /api/scoring/lead/[id] (recalcular)', recalc, 200)

  // 6. Crear regla de prueba (POST)
  const creada = await call('POST', '/api/scoring/rules', {
    nombre: 'REGLAPRUEBA_AUTOTEST',
    descripcion: 'Regla temporal creada por la prueba autenticada',
    categoria: 'Prueba',
    evento: 'TEST_EVENTO',
    puntos: 5,
    condiciones: {},
    activo: false,
  })
  check('POST /api/scoring/rules (crear)', creada, 201)
  const ruleId = creada.json?.id
  if (!ruleId) {
    console.log('   → No se pudo crear la regla, no se puede probar PUT/DELETE')
  } else {
    console.log(`   → id=${ruleId}`)

    // 7. Editar la regla (PUT)
    const editada = await call('PUT', '/api/scoring/rules', {
      id: ruleId,
      nombre: 'REGLAPRUEBA_AUTOTEST_EDITADA',
      puntos: 7,
    })
    check('PUT /api/scoring/rules (editar)', editada, 200)

    // 8. Eliminar la regla de prueba (DELETE) — limpieza
    const borrada = await call('DELETE', `/api/scoring/rules?id=${ruleId}`)
    check('DELETE /api/scoring/rules (limpiar)', borrada, 200)
  }

  console.log(`\n=== ${failures === 0 ? 'TODAS LAS PRUEBAS PASARON ✅' : `${failures} PRUEBA(S) FALLARON ❌`} ===`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('Error ejecutando la prueba:', e.message)
  process.exit(1)
})
