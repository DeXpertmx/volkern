#!/usr/bin/env node
/**
 * Agente E2E para /mcp — corre DENTRO del contenedor de la app desplegada
 * (como scripts/smoke-clasificador-agent.js): es el único sitio con el
 * cliente Prisma que usa la imagen en producción y con node.
 *
 * AISLAMIENTO: todo corre en un TENANT DEDICADO que el propio agente crea
 * (tenant + rol OWNER + usuario admin) y borra al terminar, pase lo que pase
 * (`finally`). Nada toca datos de tenants reales; si una ejecución muere a
 * medias, la siguiente barre los restos con slug `e2e-mcp-*` de más de 24h.
 *
 * DOS modos (selección por flag):
 *
 *  · (por defecto) Circuito auth → skill → audit log:
 *      1. Tenant dedicado + DOS API keys temporales:
 *         · A: mcp:execute → tools/call ejecuta el skill REAL.
 *         · B: solo leads:read → tools/call RECHAZADA por scopes (401).
 *      2. tools/call con contrato del catálogo (query, no el search legacy).
 *      3. Verifica en BD: audit log MCP_tool_execution y contadores
 *         ultimoUso/totalUsos.
 *
 *  · --flujo: flujo comercial COMPLETO en el tenant dedicado. TODO por /mcp
 *      tools/call con los contratos del catálogo (tools-catalog.ts), igual
 *      que un agente externo:
 *      1. Fixture: CatalogoItem temporal.
 *      2. lead → create_deal (titulo/valor/leadId) → create_cotizacion
 *         (catalogItems[]) → create_orden_from_cotizacion (cotizacionId),
 *         todos ejecutados de verdad por sus skills.
 *      3. Verificación de la orden por GET /api/ordenes-venta/:id (REST).
 *      4. IDEMPOTENCIA: repetir create_orden_from_cotizacion devuelve
 *         yaExistia=true con la MISMA orden y no duplica filas en BD.
 *      5. Evidencia en audit log.
 *      6. Limpieza total: el tenant dedicado completo (órdenes → cotizaciones
 *         → deals → leads → catálogo → keys → audit → usuario → rol → tenant).
 *
 *  Nota: el tenant dedicado no tiene Telegram ni push configurados, así que
 *  el flujo no genera avisos externos (a diferencia de cuando corría sobre
 *  un tenant real).
 */

const crypto = require('crypto')

const args = process.argv.slice(2)
const getArg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const APP_URL = (getArg('--url') || process.env.VOLKERN_APP_URL || 'https://volkern.app').replace(/\/$/, '')
const MODO_FLUJO = args.includes('--flujo')
const MARCA = `E2E-MCP-${Date.now().toString(36)}`
const SLUG = MARCA.toLowerCase()

if (!process.env.IN_CONTAINER) {
  console.error('✗ Este agente debe correr DENTRO del contenedor desplegado (scripts/mcp-e2e.sh).')
  process.exit(1)
}
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

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

async function rest(key, method, path, payload) {
  const res = await fetch(`${APP_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: payload ? JSON.stringify(payload) : undefined,
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
// Extrae el id de la entidad creada sea cual sea la forma de respuesta
// (entidad plana, {lead:{id}}, {deal:{id}}, {cotizacion:{id}}, {orden:{id}}...)
function extractId(obj) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of ['id', 'leadId', 'dealId', 'cotizacionId', 'ordenId']) {
    if (typeof obj[k] === 'string' && obj[k].length > 10) return obj[k]
  }
  for (const k of ['lead', 'deal', 'cotizacion', 'orden']) {
    if (typeof obj[k]?.id === 'string' && obj[k].id.length > 10) return obj[k].id
  }
  return undefined
}

// ── Tenant dedicado (creado y borrado por el propio agente) ───────
async function prepararTenant() {
  // Restos de ejecuciones interrumpidas (mismo patrón de slug, >24h): se
  // barren para no acumular basura si algún run murió sin llegar al finally.
  const huerfanos = await prisma.tenant.findMany({
    where: { slug: { startsWith: 'e2e-mcp-' }, fechaCreacion: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { id: true, slug: true },
  })
  for (const h of huerfanos) {
    console.log(`   · resto huérfano ${h.slug}: limpiando ...`)
    await limpiarTenant(h.id, { silencioso: true })
  }

  const tenant = await prisma.tenant.create({
    data: { nombre: `E2E MCP ${MARCA}`, slug: SLUG },
  })
  const rol = await prisma.role.create({
    data: { tenantId: tenant.id, nombre: 'OWNER', permisos: {}, descripcion: 'Rol temporal del E2E MCP' },
  })
  const admin = await prisma.user.create({
    data: { email: `${SLUG}@e2e.volkern.app`, name: 'E2E MCP Admin', tenantId: tenant.id, roleId: rol.id },
  })
  return { tenant, admin }
}

/** Borra el tenant dedicado completo, en orden de dependencia de FKs. */
async function limpiarTenant(tenantId, { silencioso = false } = {}) {
  const pasos = [
    ['órdenes de venta', () => prisma.ordenVenta.deleteMany({ where: { tenantId } })],
    ['cotizaciones', () => prisma.cotizacion.deleteMany({ where: { tenantId } })],
    ['dealActivities', () => prisma.dealActivity.deleteMany({ where: { tenantId } })],
    ['deals', () => prisma.deal.deleteMany({ where: { tenantId } })],
    ['leads', () => prisma.lead.deleteMany({ where: { tenantId } })],
    ['catalogoItems', () => prisma.catalogoItem.deleteMany({ where: { tenantId } })],
    ['apiKeys', () => prisma.apiKey.deleteMany({ where: { tenantId } })],
    ['auditLogs', () => prisma.auditLog.deleteMany({ where: { tenantId } })],
    ['usuarios', () => prisma.user.deleteMany({ where: { tenantId } })],
    ['roles', () => prisma.role.deleteMany({ where: { tenantId } })],
  ]
  for (const [nombre, fn] of pasos) {
    try {
      const r = await fn()
      if (!silencioso && r && r.count) console.log(`     ✓ ${nombre}: ${r.count} eliminado(s)`)
    } catch (e) {
      console.error(`     ✗ no se pudo limpiar ${nombre}: ${String(e.message).split('\n')[0]}`)
      process.exitCode = 1
    }
  }
  await prisma.tenant.delete({ where: { id: tenantId } }).catch((e) => {
    console.error(`     ✗ NO se pudo eliminar el tenant E2E — revisar residuo: ${String(e.message).split('\n')[0]}`)
    process.exitCode = 1
  })
  if (!silencioso) {
    const queda = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
    if (queda) { console.error('     ✗ el tenant E2E sigue existiendo'); process.exitCode = 1 }
  }
}

async function runCircuito() {
  console.log(`→ [mcp-e2e] Circuito autenticado contra ${APP_URL}`)
  const { tenant, admin } = await prepararTenant()
  console.log(`   · tenant dedicado: ${tenant.nombre} (slug ${tenant.slug}) · usuario: ${admin.email} (OWNER)`)

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
    const b = await mcpCall(KEY_B, 'tools/call', { name: 'volkern_search_catalogo', arguments: {} }, 10)
    if (b.status !== 401 || b.body?.error?.code !== -32000) {
      fail(`key SIN mcp:execute no fue rechazada como se esperaba (HTTP ${b.status}, error=${JSON.stringify(b.body?.error)})`)
      return
    }
    ok('key sin mcp:execute → 401 / -32000 (gating de scopes funciona)')

    const a = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_search_catalogo',
      // Contrato del catálogo: 'query' (no el 'search' legacy del orquestador)
      arguments: { query: 'e2e', limit: 1 },
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
    ok(`skill search_catalog ejecutado de verdad: ${parsed.total ?? parsed.items.length} items en el catálogo (tenant dedicado, vacío)`)
    if (parsed.items.length !== 0) {
      fail(`el catálogo del tenant dedicado debería estar vacío y devolvió ${parsed.items.length} items`)
      return
    }
    ok('aislamiento confirmado: la búsqueda no ve datos de otros tenants')

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

    const keyAfter = await prisma.apiKey.findUnique({ where: { id: keyA.id }, select: { ultimoUso: true, totalUsos: true } })
    if (!keyAfter || keyAfter.totalUsos < 1 || !keyAfter.ultimoUso) {
      fail(`los contadores de la key no se actualizaron (totalUsos=${keyAfter?.totalUsos})`)
      return
    }
    ok(`contadores de la key actualizados: totalUsos=${keyAfter.totalUsos}`)
  } finally {
    console.log('   · limpieza del tenant dedicado ...')
    await limpiarTenant(tenant.id)
    console.log('   ✓ tenant E2E eliminado')
  }
}

async function runFlujo() {
  console.log(`→ [mcp-e2e] Flujo comercial completo contra ${APP_URL} (tenant dedicado ${SLUG})`)
  const { tenant, admin } = await prepararTenant()
  console.log(`   · tenant dedicado: ${tenant.nombre} (slug ${tenant.slug}) · usuario: ${admin.email} (OWNER)`)
  console.log('   · sin avisos externos: el tenant dedicado no tiene Telegram/push configurados')

  const SCOPES_FLUJO = ['mcp:execute', 'leads:write', 'deals:read', 'deals:write', 'quotes:write', 'orders:read', 'orders:write']
  const keyA = await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      userId: admin.id,
      nombre: `E2E flujo comercial (temporal) ${MARCA}`,
      descripcion: 'Key temporal del E2E MCP flujo completo — se elimina sola al terminar',
      keyHash: hash(KEY_A),
      prefix: KEY_A.slice(0, 16),
      scopes: SCOPES_FLUJO,
      activo: true,
    },
  })
  ok(`API key temporal creada con scopes: ${SCOPES_FLUJO.join(', ')}`)

  try {
    // ── 1. Fixture: item de catálogo temporal ────────────────────
    const item = await prisma.catalogoItem.create({
      data: {
        tenantId: tenant.id,
        nombre: `Servicio E2E MCP ${MARCA}`,
        descripcion: 'Item temporal del E2E de flujo comercial (se elimina al final)',
        tipo: 'servicio',
        precioBase: 123.45,
        moneda: 'EUR',
        activo: true,
      },
    })
    ok(`fixture: CatalogoItem temporal creado (${item.id.slice(-8)})`)

    // ── 2. lead vía /mcp ─────────────────────────────────────────
    const leadCall = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_lead',
      arguments: {
        nombre: `E2E MCP Lead ${MARCA}`,
        email: `${MARCA.toLowerCase()}@e2e.volkern.app`,
        canal: 'web',
        notas: 'Lead temporal del E2E de flujo comercial (se elimina al final)',
      },
    }, 20)
    const leadRes = leadCall.body?.result
    if (leadCall.status !== 200 || !leadRes || leadRes.isError) {
      fail(`create_lead vía /mcp falló: HTTP ${leadCall.status} ${String(leadRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const leadId = extractId(JSON.parse(leadRes.content?.[0]?.text || '{}'))
    if (!leadId) { fail('create_lead no devolvió id'); return }
    ok(`lead creado vía /mcp (${leadId.slice(-8)})`)

    // ── 3. deal vía /mcp (contrato del catálogo: titulo/valor/leadId) ──
    const dealCall = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_deal',
      arguments: {
        titulo: `E2E MCP Deal ${MARCA}`,
        valor: 246.9,
        moneda: 'EUR',
        leadId,
        descripcion: 'Deal temporal del E2E de flujo comercial (se elimina al final)',
      },
    }, 21)
    const dealRes = dealCall.body?.result
    if (dealCall.status !== 200 || !dealRes || dealRes.isError) {
      fail(`create_deal vía /mcp falló: HTTP ${dealCall.status} ${String(dealRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const dealJson = JSON.parse(dealRes.content?.[0]?.text || '{}')
    const dealId = extractId(dealJson)
    if (!dealId) { fail('create_deal no devolvió id'); return }
    if (dealJson.leadId !== leadId) {
      fail(`el deal no quedó vinculado al lead (leadId=${dealJson.leadId ?? 'null'})`)
      return
    }
    ok(`deal creado vía /mcp y vinculado al lead (deal ${dealId.slice(-8)} → lead ${leadId.slice(-8)})`)

    // ── 4. cotización vía /mcp (contrato del catálogo: catalogItems[]) ──
    const cotMcp = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_cotizacion',
      arguments: {
        titulo: `E2E MCP Cotización ${MARCA}`,
        catalogItems: [{ catalogoItemId: item.id, cantidad: 2 }],
        leadId,
        dealId,
      },
    }, 22)
    const cotMcpRes = cotMcp.body?.result
    if (cotMcp.status !== 200 || !cotMcpRes || cotMcpRes.isError) {
      fail(`create_cotizacion vía /mcp falló: HTTP ${cotMcp.status} ${String(cotMcpRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const cotJson = JSON.parse(cotMcpRes.content?.[0]?.text || '{}')
    const cotizacionId = cotJson.cotizacion?.id
    if (!cotizacionId) { fail('create_cotizacion no devolvió {cotizacion:{id}}'); return }
    if (cotJson.cotizacion.dealId !== dealId) {
      fail(`la cotización no quedó vinculada al deal (dealId=${cotJson.cotizacion.dealId ?? 'null'})`)
      return
    }
    ok(`cotización creada vía /mcp (${cotJson.cotizacion.numero}, total ${cotJson.cotizacion.total} ${cotJson.cotizacion.moneda})`)

    // ── 5. orden de venta vía /mcp (contrato del catálogo: cotizacionId) ──
    const ordenMcp = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_orden_from_cotizacion',
      arguments: {
        cotizacionId,
        notasInternas: `Orden temporal del E2E ${MARCA} (se elimina al final)`,
      },
    }, 23)
    const ordenMcpRes = ordenMcp.body?.result
    if (ordenMcp.status !== 200 || !ordenMcpRes || ordenMcpRes.isError) {
      fail(`create_orden_from_cotizacion vía /mcp falló: HTTP ${ordenMcp.status} ${String(ordenMcpRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const ordenJson = JSON.parse(ordenMcpRes.content?.[0]?.text || '{}')
    const ordenId = ordenJson.orden?.id
    if (!ordenId) { fail('create_orden_from_cotizacion no devolvió {orden:{id}}'); return }
    if (ordenJson.yaExistia !== false) {
      fail(`la primera conversión debería crear la orden (yaExistia=${ordenJson.yaExistia})`)
      return
    }
    ok(`orden de venta creada vía /mcp desde la cotización (${ordenJson.orden.numero})`)

    // ── 6. verificación de la orden por GET ──────────────────────
    const ordenGet = await rest(KEY_A, 'GET', `/ordenes-venta/${ordenId}`)
    const orden = ordenGet.body?.orden || ordenGet.body
    if (ordenGet.status !== 200 || !orden?.items?.length) {
      fail(`GET /api/ordenes-venta/${ordenId} no devolvió la orden con items: HTTP ${ordenGet.status}`)
      return
    }
    if (orden.cotizacionId !== cotizacionId) {
      fail(`la orden no referencia la cotización (cotizacionId=${orden.cotizacionId})`)
      return
    }
    if (!(Number(orden.total) > 0)) {
      fail(`la orden no tiene total positivo (total=${orden.total})`)
      return
    }
    ok(`GET verifica la orden: ${orden.items.length} item(s) heredados del catálogo, total ${orden.total} ${orden.moneda}`)

    // ── 7. idempotencia: repetir la conversión no duplica la orden ──
    const ordenMcp2 = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_orden_from_cotizacion',
      arguments: {
        cotizacionId,
        notasInternas: `Segunda llamada (idempotencia) del E2E ${MARCA}`,
      },
    }, 24)
    const ordenMcp2Res = ordenMcp2.body?.result
    if (ordenMcp2.status !== 200 || !ordenMcp2Res || ordenMcp2Res.isError) {
      fail(`segunda create_orden_from_cotización vía /mcp falló: HTTP ${ordenMcp2.status} ${String(ordenMcp2Res?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const ordenJson2 = JSON.parse(ordenMcp2Res.content?.[0]?.text || '{}')
    if (ordenJson2.yaExistia !== true) {
      fail(`la segunda conversión debería ser idempotente (yaExistia=${ordenJson2.yaExistia}): ${JSON.stringify(ordenJson2).slice(0, 200)}`)
      return
    }
    if (ordenJson2.orden?.id !== ordenId) {
      fail(`la segunda conversión devolvió otra orden (${ordenJson2.orden?.id} ≠ ${ordenId})`)
      return
    }
    const cuantasOrdenes = await prisma.ordenVenta.count({ where: { cotizacionId } })
    if (cuantasOrdenes !== 1) {
      fail(`la cotización acabó con ${cuantasOrdenes} órdenes de venta; la conversión duplicó datos`)
      return
    }
    ok('idempotencia: segunda conversión → yaExistia=true, misma orden y 1 sola fila en BD')

    // ── 8. evidencia en audit log ────────────────────────────────
    const auditOrden = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, entidad: 'orden_venta', entidadId: ordenId },
      orderBy: { fechaCreacion: 'desc' },
    })
    if (!auditOrden) { fail('sin audit log de la orden de venta en BD'); return }
    ok(`audit log de la orden verificado: ${auditOrden.accion} · ${auditOrden.descripcion?.slice(0, 80)}`)
  } finally {
    console.log('   · limpieza del tenant dedicado ...')
    await limpiarTenant(tenant.id)
    console.log('   ✓ tenant E2E eliminado (con todos sus datos)')
  }
}

const t0 = Date.now()
;(MODO_FLUJO ? runFlujo() : runCircuito())
  .catch((e) => { console.error('✗ [mcp-e2e] ERROR:', e.message); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
    console.log(`   · duración: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  })
