#!/usr/bin/env node
/**
 * E2E: flujo de login por subdominio de tenant (contra el entorno real).
 *
 * Qué verifica (de punta a punta):
 *   1. /dashboard sin sesión → 307 al login del MISMO subdominio con callbackUrl
 *   2. CSRF del tenant emitido
 *   3. Login real (credentials) → 200, cookie `next-auth.session-token`
 *      con Domain=.volkern.app y destino dentro del subdominio
 *   4. Sesión resuelta con tenantSubdomain correcto
 *   5. /dashboard autenticado → 200 en el mismo subdominio
 *
 * Crea un usuario TEMPORAL en el tenant, lo usa y lo ELIMINA al final
 * (siempre, incluso si el flujo falla). El hash bcrypt viaja por stdin
 * directo a psql (nunca por un shell) para que los `$` del hash no se
 * corrompan — lección del incidente del 2026-08-28.
 *
 * Uso:
 *   node scripts/e2e-login-subdominio.mjs
 *   E2E_BASE_URL=https://dexpert.volkern.app E2E_TENANT=dexpert \
 *   E2E_VPS=root@62.171.134.195 E2E_SSH_KEY=~/.ssh/id_buffy_volkern \
 *   npm run test:e2e:login
 */
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const BASE_URL = (process.env.E2E_BASE_URL || 'https://dexpert.volkern.app').replace(/\/$/, '')
const TENANT = process.env.E2E_TENANT || 'dexpert'
const VPS = process.env.E2E_VPS || 'root@62.171.134.195'
const SSH_KEY = (process.env.E2E_SSH_KEY || '~/.ssh/id_buffy_volkern').replace('^~', homedir())

const results = []
function step(ok, name, detail = '') {
  results.push({ ok, name })
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function ssh(remoteCmd, stdin = '') {
  return execFileSync(
    'ssh',
    ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', VPS, remoteCmd],
    { input: stdin, encoding: 'utf8', timeout: 30000 }
  ).trim()
}

function psql(sql) {
  // SQL por stdin directo a psql dentro del contenedor: el SQL nunca pasa
  // por ningún shell (los `$` del hash bcrypt llegan intactos).
  return ssh(
    `docker exec -i $(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1) psql -U volkern_erp -d volkern_erp -v ON_ERROR_STOP=1`,
    sql
  )
}

class CookieJar {
  #cookies = new Map()
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const pair = c.split(';')[0]
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (!value) this.#cookies.delete(name)
      else this.#cookies.set(name, value)
    }
  }
  header() {
    return [...this.#cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  get(name) {
    return this.#cookies.get(name)
  }
}

async function main() {
  console.log(`\n🔒 E2E login por subdominio — ${BASE_URL} (tenant: ${TENANT})\n`)

  // ── Preparación: tenant + usuario temporal ──────────────────────────
  const tenantId = ssh(
    `docker exec $(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1) psql -U volkern_erp -d volkern_erp -t -A -c "SELECT id FROM \\"Tenant\\" WHERE subdomain='${TENANT}'"`
  )
  if (!tenantId) {
    console.error(`✗ Tenant '${TENANT}' no encontrado en la BD. Abortando.`)
    process.exit(1)
  }

  const suffix = Date.now().toString(36)
  const userId = `e2elogin${suffix}`.slice(0, 24)
  const email = `e2e-login-${suffix}@temp.volkern.com`
  const password = `E2e!${crypto.randomBytes(12).toString('base64url')}`
  const hash = bcrypt.hashSync(password, 10)

  psql(
    `INSERT INTO "User" (id, name, email, password, "tenantId", "updatedAt") ` +
    `VALUES ('${userId}', 'E2E Login Subdominio', '${email}', '${hash}', '${tenantId}', now());\n`
  )
  console.log(`  · usuario temporal: ${email} (${userId})\n`)

  const jar = new CookieJar()
  try {
    // ── Paso 1: /dashboard sin sesión → login del mismo subdominio ────
    const r1 = await fetch(`${BASE_URL}/dashboard`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const loc1 = r1.headers.get('location') || ''
    step(
      r1.status === 307 && loc1.startsWith(`${BASE_URL}/auth/login?callbackUrl=%2Fdashboard`),
      '1. /dashboard sin sesión redirige al login del MISMO subdominio',
      `${r1.status} → ${loc1 || '(sin location)'}`
    )

    // ── Paso 2: CSRF del tenant ─────────────────────────────────────────
    const r2 = await fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(15000) })
    jar.absorb(r2)
    const csrf = ((await r2.json()) || {}).csrfToken
    step(r2.status === 200 && Boolean(csrf), '2. CSRF del tenant emitido', `token ${csrf ? 'OK' : 'ausente'}`)

    // ── Paso 3: login real (credentials) ────────────────────────────────
    const body = new URLSearchParams({
      csrfToken: csrf,
      email,
      password,
      callbackUrl: `${BASE_URL}/dashboard`,
      json: 'true',
    })
    const r3 = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Obligatorio: NextAuth valida el csrfToken contra la cookie __Host-next-auth.csrf-token
        Cookie: jar.header(),
      },
      body,
      signal: AbortSignal.timeout(20000),
    })
    jar.absorb(r3)
    const setSession = (r3.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('next-auth.session-token='))
    const sessionCookie = setSession || ''
    const cookieOk = sessionCookie.includes('Domain=.volkern.app')
    let destinoOk = false
    try {
      destinoOk = (await r3.json()).url === `${BASE_URL}/dashboard`
    } catch { destinoOk = false }
    step(
      r3.status === 200 && Boolean(jar.get('next-auth.session-token')),
      '3. Login real acepta credenciales y emite cookie de sesión',
      `HTTP ${r3.status}`
    )
    step(cookieOk, '3b. Cookie de sesión con Domain=.volkern.app', cookieOk ? sessionCookie.split(';')[1]?.trim() : 'Domain ausente')
    step(destinoOk, '3c. Destino del login dentro del subdominio', destinoOk ? `${BASE_URL}/dashboard` : '(revisar body)')

    // ── Paso 4: sesión resuelta con el tenant correcto ──────────────────
    const r4 = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Cookie: jar.header() },
      signal: AbortSignal.timeout(15000),
    })
    const session = await r4.json()
    step(
      r4.status === 200 && session?.user?.tenantSubdomain === TENANT,
      '4. Sesión resuelta con tenantSubdomain correcto',
      session?.user ? `tenant=${session.user.tenantSubdomain} role=${session.user.roleName ?? '-'}` : 'sin sesión'
    )

    // ── Paso 5: /dashboard autenticado en el mismo subdominio ───────────
    const r5 = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: jar.header() },
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    step(r5.status === 200, '5. /dashboard autenticado en el mismo subdominio', `HTTP ${r5.status}`)
  } finally {
    // ── Limpieza SIEMPRE ────────────────────────────────────────────────
    try {
      psql(`DELETE FROM "User" WHERE id='${userId}' AND email='${email}';\n`)
      console.log('\n  🧹 usuario temporal eliminado')
    } catch (e) {
      console.error(`\n  ⚠️  NO se pudo eliminar el usuario temporal ${userId} (${email}): ${e.message}`)
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? '🟢 E2E PASS' : '🔴 E2E FAIL'} — ${results.length - failed.length}/${results.length} pasos OK\n`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((e) => {
  console.error(`✗ Error fatal: ${e.message}`)
  process.exit(1)
})
