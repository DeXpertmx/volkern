#!/usr/bin/env node
/**
 * Agente E2E autenticado para /mcp — corre DENTRO del contenedor de la app
 * desplegada (como scripts/smoke-clasificador-agent.js): es el único sitio
 * con el cliente Prisma que usa la imagen en producción y con node.
 *
 * Circuito validado (auth → skill → audit log):
 *   1. Selecciona un tenant activo con usuario admin (Superadmin > OWNER > Admin).
 *   2. Crea DOS API keys temporales en BD (se borran al final, incluso si falla):
 *      · A: con scope mcp:execute  → tools/call debe EJECUTAR el skill real
 *        (volkern_search_catalogo → search_catalog → consulta CatalogoItem).
 *      · B: solo un scope ajeno    → tools/call debe ser RECHAZADA por scopes
 *        (401 / -32000), demostrando que el gating de scopes funciona.
 *   3. Verifica en BD: audit log creado por la ruta, ultimoUso/totalUsos de la
 *      key actualizados (side-effect de authenticateRequest).
 *   4. El tenant usado no se toca: solo lecturas.
 *
 * El tenant de este E2E se elimina SIEMPRE (finally) — el smoke-mcp.sh no
 * necesita tenant (solo metadatos + una llamada rechazada antes de tocar BD).
 */

const crypto = require('crypto')

const args = process.argv.slice(2)
const getArg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const APP_URL = (getArg('--url') || process.env.VOLKERN_APP_URL || 'https://volkern.app').replace(/\/$/, '')
const DRY_RUN = args.includes('--dry-run')

if (!DRY_RUN) {
  // Prisma del CONTENEDOR (la app desplegada), no del repo local
  const { PrismaClient } = require('@prisma/client')
  var prisma = new PrismaClient()
}

const KEY_A = `vk_prod_${crypto.randomBytes(32).toString('hex')}`
const KEY_B = `vk_prod_${crypto.randomBytes(32).toString('hex')}`
const hash = (k) => crypto.createHash('sha256').update(k).digest('hex')

const MCP_HEADERS = (key) => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
  'Authorization': `Bearer ${key}`,
})

async function mcpCall(key, method, params, id) {
  const res = await fetch(`${APP_URL}/mcp`, {
    method: 'POST',
    headers: MCP_HEADERS(key),
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  let body = null
  try { body = await res.json() } catch { /* sin cuerpo */ }
  return { status: res.status, body }
}

function fail(msg) {
  console.error(`✗ [mcp-e2e] ${msg}`)
  process.exitCode = 1
}
function ok(msg) {
  console.log(`   ✓ ${msg}`)
}

async function main() {
  console.log(`→ [mcp-e2e] Circuito autenticado contra ${APP_URL}`)

  // ── 1. Tenant + usuario admin ────────────────────────────────
  const candidates = await prisma.tenant.findMany({
    where: { estado: 'activo' },
    select: { id: true, nombre: true, users: { select: { id: true, email: true, role: { select: { nombre: true } } } } },
    take: 50,
    orderBy: { fechaCreacion: 'asc' },
  })
  const prioritized = ['Superadmin', 'OWNER', 'Admin', 'Administrador']
  let tenant = null, admin = null
  for (const rolName of prioritized) {
    for (const t of candidates) {
      const u = t.users.find((u) => u.role?.nombre === rolName)
      if (u) { tenant = t; admin = u; break }
    }
    if (admin) break
  }
  if (!admin) {
    // Último recurso: cualquier usuario con rol
    for (const t of candidates) {
      const u = t.users.find((u) => u.role)
      if (u) { tenant = t; admin = u; break }
    }
  }
  if (!admin) throw new Error('No hay ningún tenant activo con usuario con rol para este E2E')
  console.log(`   · tenant: ${tenant.nombre} · usuario: ${admin.email} (${admin.role?.nombre})`)

  // ── 2. API keys temporales ───────────────────────────────────
  const [keyA, keyB] = await Promise.all([
    prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        nombre: 'E2E mcp:execute (temporal)',
        descripcion: 'Key temporal del E2E MCP — se elimina sola al terminar',
        keyHash: hash(KEY_A),
        prefix: KEY_A.slice(0, 16),
        scopes: ['mcp:execute'],
        activo: true,
      },
    }),
    prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        nombre: 'E2E sin mcp:execute (temporal)',
        descripcion: 'Key temporal del E2E MCP — se elimina sola al terminar',
        keyHash: hash(KEY_B),
        prefix: KEY_B.slice(0, 16),
        scopes: ['leads:read'],
        activo: true,
      },
    }),
  ])
  ok('API keys temporales creadas (A: mcp:execute · B: solo leads:read)')

  try {
    // ── 3a. tools/call con key B (sin mcp:execute) → 401 ───────
    const b = await mcpCall(KEY_B, 'tools/call', { name: 'volkern_search_catalogo', arguments: {} }, 10)
    if (b.status !== 401 || b.body?.error?.code !== -32000) {
      fail(`key SIN mcp:execute no fue rechazada como se esperaba (HTTP ${b.status}, error=${JSON.stringify(b.body?.error)})`)
      return
    }
    ok('key sin mcp:execute → 401 / -32000 (gating de scopes funciona)')

    // ── 3b. tools/call con key A (mcp:execute) → ejecución real ─
    const a = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_search_catalogo',
      arguments: { search: 'e2e', limit: 1 },
    }, 11)
    if (a.status !== 200) {
      fail(`key con mcp:execute obtuvo HTTP ${a.status} (esperaba 200): ${JSON.stringify(a.body).slice(0, 300)}`)
      return
    }
    const result = a.body?.result
    if (!result || result.isError) {
      fail(`tools/call devolvió isError: ${result?.content?.[0]?.text?.slice(0, 300)}`)
      return
    }
    let parsed
    try { parsed = JSON.parse(result.content?.[0]?.text || '{}') } catch { parsed = null }
    if (!parsed || !Array.isArray(parsed.items)) {
      fail(`la respuesta no tiene la forma del skill search_catalog: ${String(result.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    ok(`skill search_catalog ejecutado de verdad: ${parsed.total ?? parsed.items.length} items en el catálogo del tenant`)

    // ── 4a. Audit log en BD ──────────────────────────────────────
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, accion: 'MCP_tool_execution', entidadId: 'volkern_search_catalogo' },
      orderBy: { fechaCreacion: 'desc' },
    })
    if (!audit) {
      fail('no se encontró el audit log MCP_tool_execution en BD')
      return
    }
    const meta = audit.metadata || {}
    if (meta.skill !== 'search_catalog' || meta.status !== 'success') {
      fail(`audit log con metadata inesperada: ${JSON.stringify(meta)}`)
      return
    }
    ok(`audit log verificado: ${audit.accion} · skill=${meta.skill} · status=${meta.status}`)

    // ── 4b. Contadores de la key (side-effect de authenticateRequest) ──
    const keyAfter = await prisma.apiKey.findUnique({ where: { id: keyA.id }, select: { ultimoUso: true, totalUsos: true } })
    if (!keyAfter || keyAfter.totalUsos < 1 || !keyAfter.ultimoUso) {
      fail(`los contadores de la key no se actualizaron (totalUsos=${keyAfter?.totalUsos})`)
      return
    }
    ok(`contadores de la key actualizados: totalUsos=${keyAfter.totalUsos}`)
  } finally {
    // ── Limpieza SIEMPRE: las keys temporales se borran ─────────
    await Promise.all([
      prisma.apiKey.delete({ where: { id: keyA.id } }).catch(() => {}),
      prisma.apiKey.delete({ where: { id: keyB.id } }).catch(() => {}),
    ])
    console.log('   · API keys temporales eliminadas')
  }
}

main()
  .catch((e) => { console.error('✗ [mcp-e2e] ERROR:', e.message); process.exitCode = 1 })
  .finally(() => { if (!DRY_RUN) prisma.$disconnect().catch(() => {}) })
