#!/usr/bin/env node
/**
 * Agente E2E para /mcp — corre DENTRO del contenedor de la app desplegada
 * (como scripts/smoke-clasificador-agent.js): es el único sitio con el
 * cliente Prisma que usa la imagen en producción y con node.
 *
 * DOS modos (selección por flag):
 *
 *  · (por defecto) Circuito auth → skill → audit log:
 *      1. Tenant activo con usuario admin (Superadmin > OWNER > Admin).
 *      2. DOS API keys temporales (se borran al final, incluso si falla):
 *         · A: mcp:execute → tools/call ejecuta el skill REAL.
 *         · B: solo leads:read → tools/call RECHAZADA por scopes (401).
 *      3. Verifica en BD: audit log MCP_tool_execution y contadores
 *         ultimoUso/totalUsos.
 *
 *  · --flujo: flujo comercial COMPLETO con datos temporales (se limpian al
 *      final, incluso si falla). TODO por /mcp tools/call con los contratos
 *      del catálogo (tools-catalog.ts), igual que un agente externo:
 *      1. Fixture: CatalogoItem temporal (el tenant puede tener catálogo vacío).
 *      2. lead → create_deal (titulo/valor/leadId) → create_cotizacion
 *         (catalogItems[]) → create_orden_from_cotizacion (cotizacionId),
 *         todos ejecutados de verdad por sus skills.
 *      3. Verificación de la orden por GET /api/ordenes-venta/:id (REST).
 *      4. Limpieza total: orden → cotización → dealActivities → deal →
 *         lead → catalogoItem → API key temporal. Los audit logs SE
 *         CONSERVAN (son la evidencia de las llamadas reales).
 *
 *  ⚠️ Nota: crear la orden de venta dispara la notificación Telegram del
 *  tenant («Nueva Orden de Venta», no bloqueante). Es un mensaje puntual
 *  del E2E; los datos se eliminan al terminar.
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

// ── Selección de tenant + usuario admin (compartida) ─────────────
async function seleccionarTenant() {
  const candidates = await prisma.tenant.findMany({
    where: { estado: 'activo' },
    select: { id: true, nombre: true, users: { select: { id: true, email: true, role: { select: { nombre: true } } } } },
    take: 50,
    orderBy: { fechaCreacion: 'asc' },
  })
  const prioridad = ['Superadmin', 'OWNER', 'Admin', 'Administrador']
  for (const rol of prioridad) {
    for (const t of candidates) {
      const u = t.users.find((u) => u.role?.nombre === rol)
      if (u) return { tenant: t, admin: u }
    }
  }
  for (const t of candidates) {
    const u = t.users.find((u) => u.role)
    if (u) return { tenant: t, admin: u }
  }
  throw new Error('No hay ningún tenant activo con usuario con rol para este E2E')
}

async function runCircuito() {
  console.log(`→ [mcp-e2e] Circuito autenticado contra ${APP_URL}`)
  const { tenant, admin } = await seleccionarTenant()
  console.log(`   · tenant: ${tenant.nombre} · usuario: ${admin.email} (${admin.role?.nombre})`)

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
    ok(`skill search_catalog ejecutado de verdad: ${parsed.total ?? parsed.items.length} items en el catálogo del tenant`)

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
    await Promise.all([
      prisma.apiKey.delete({ where: { id: keyA.id } }).catch(() => {}),
      prisma.apiKey.delete({ where: { id: keyB.id } }).catch(() => {}),
    ])
    console.log('   · API keys temporales eliminadas')
  }
}

async function runFlujo() {
  console.log(`→ [mcp-e2e] Flujo comercial completo contra ${APP_URL} (datos temporales ${MARCA})`)
  const { tenant, admin } = await seleccionarTenant()
  console.log(`   · tenant: ${tenant.nombre} · usuario: ${admin.email} (${admin.role?.nombre})`)
  console.log('   ⚠️  crear la orden dispara la notificación Telegram del tenant (1 mensaje puntual del E2E)')

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

  // Entidades creadas durante el flujo; la limpieza SIEMPRE en finally.
  const creados = { leadId: null, dealId: null, cotizacionId: null, ordenId: null, catalogoItemId: null }

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
    creados.catalogoItemId = item.id
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
    creados.leadId = leadId
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
    creados.dealId = dealId
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
        catalogItems: [{ catalogoItemId: creados.catalogoItemId, cantidad: 2 }],
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
    creados.cotizacionId = cotizacionId
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
    creados.ordenId = ordenId
    ok(`orden de venta creada vía /mcp desde la cotización (${ordenJson.orden.numero}) yaExistia=${ordenJson.yaExistia}`)

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

    // ── 7. evidencia en audit log ────────────────────────────────
    const auditOrden = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, entidad: 'orden_venta', entidadId: ordenId },
      orderBy: { fechaCreacion: 'desc' },
    })
    if (!auditOrden) { fail('sin audit log de la orden de venta en BD'); return }
    ok(`audit log de la orden verificado: ${auditOrden.accion} · ${auditOrden.descripcion?.slice(0, 80)}`)
  } finally {
    // ── Limpieza SIEMPRE, en orden de dependencia ────────────────
    console.log('   · limpieza de datos temporales ...')
    const pasos = []
    if (creados.ordenId) pasos.push(['orden de venta', () => prisma.ordenVenta.delete({ where: { id: creados.ordenId } })])
    if (creados.cotizacionId) pasos.push(['cotización', () => prisma.cotizacion.delete({ where: { id: creados.cotizacionId } })])
    if (creados.dealId) pasos.push(['dealActivities', () => prisma.dealActivity.deleteMany({ where: { dealId: creados.dealId } })])
    if (creados.dealId) pasos.push(['deal', () => prisma.deal.delete({ where: { id: creados.dealId } })])
    if (creados.leadId) pasos.push(['lead', () => prisma.lead.delete({ where: { id: creados.leadId } })])
    if (creados.catalogoItemId) pasos.push(['catalogoItem', () => prisma.catalogoItem.delete({ where: { id: creados.catalogoItemId } })])
    pasos.push(['api key temporal', () => prisma.apiKey.delete({ where: { id: keyA.id } })])
    for (const [nombre, fn] of pasos) {
      try { await fn(); console.log(`     ✓ ${nombre} eliminado`) } catch (e) {
        console.error(`     ✗ NO se pudo eliminar ${nombre} — revisar residuo: ${e.message}`)
        process.exitCode = 1
      }
    }
  }
}

const t0 = Date.now()
;(MODO_FLUJO ? runFlujo() : runCircuito())
  .catch((e) => { console.error('✗ [mcp-e2e] ERROR:', e.message); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
    console.log(`   · duración: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  })
