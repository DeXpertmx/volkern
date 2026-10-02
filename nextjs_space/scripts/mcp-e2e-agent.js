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
 *      final, incluso si falla):
 *      1. Fixture: CatalogoItem temporal (el tenant puede tener catálogo vacío).
 *      2. lead y deal vía /mcp tools/call (skills reales).
 *      3. volkern_create_cotizacion vía /mcp: hoy devuelve el isError
 *         documentado (sin skill equivalente); si algún día ejecuta, se usa
 *         su resultado. La cotización REAL se crea por REST
 *         (/api/cotizaciones/from-catalog), el mismo camino que usa el
 *         standalone con un agente externo.
 *      4. orden de venta por REST (/api/ordenes-venta/from-cotizacion) y
 *         verificación por GET /api/ordenes-venta/:id.
 *      5. Limpieza total: orden → cotización → dealActivities → deal →
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

    // ── 3. deal vía /mcp ─────────────────────────────────────────
    // ⚠️ Gap detectado (documentado a propósito): el contrato REAL del skill
    // create_deal (wrapper en lib/skills/index.ts) difiere del catálogo
    // standalone: exige 'nombre' (schema del handler) y 'monto' (no 'valor'),
    // y NO acepta leadId: resuelve el lead por email. Se envía el contrato
    // real; el deal queda vinculado al lead vía email.
    const dealCall = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_deal',
      arguments: {
        titulo: `E2E MCP Deal ${MARCA}`,
        nombre: `E2E MCP Deal ${MARCA}`,
        monto: 246.9,
        email: `${MARCA.toLowerCase()}@e2e.volkern.app`,
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

    // ── 4. cotización: /mcp (limitación documentada) + REST real ──
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
    let cotizacionId = null
    if (cotMcp.status === 200 && cotMcpRes && !cotMcpRes.isError) {
      cotizacionId = extractId(JSON.parse(cotMcpRes.content?.[0]?.text || '{}'))
      ok('create_cotizacion vía /mcp ejecutó de verdad (la superficie evolucionó)')
    } else {
      const texto = String(cotMcpRes?.content?.[0]?.text || '')
      if (!/no disponible para ejecución remota/.test(texto)) {
        fail(`volkern_create_cotizacion vía /mcp falló con un error NO documentado: HTTP ${cotMcp.status} ${texto.slice(0, 300)}`)
        return
      }
      ok('volkern_create_cotizacion vía /mcp → isError documentado (sin skill equivalente; el standalone usa REST)')
    }

    if (!cotizacionId) {
      const cotRest = await rest(KEY_A, 'POST', '/cotizaciones/from-catalog', {
        titulo: `E2E MCP Cotización ${MARCA}`,
        catalogItems: [{ catalogoItemId: creados.catalogoItemId, cantidad: 2 }],
        leadId,
        dealId,
        descripcion: 'Cotización temporal del E2E de flujo comercial (se elimina al final)',
        clienteEmail: `${MARCA.toLowerCase()}@e2e.volkern.app`,
      })
      if (cotRest.status !== 201 || !cotRest.body?.cotizacion?.id) {
        fail(`POST /api/cotizaciones/from-catalog falló: HTTP ${cotRest.status} ${JSON.stringify(cotRest.body).slice(0, 300)}`)
        return
      }
      cotizacionId = cotRest.body.cotizacion.id
      ok(`cotización creada por REST (${cotRest.body.cotizacion.numero}, total ${cotRest.body.cotizacion.total} ${cotRest.body.cotizacion.moneda})`)
    }
    creados.cotizacionId = cotizacionId

    // ── 5. orden de venta por REST (camino del standalone) ───────
    const ordenRest = await rest(KEY_A, 'POST', '/ordenes-venta/from-cotizacion', {
      cotizacionId,
      notasInternas: `Orden temporal del E2E ${MARCA} (se elimina al final)`,
    })
    if ((ordenRest.status !== 201 && ordenRest.status !== 200) || !ordenRest.body?.orden?.id) {
      fail(`POST /api/ordenes-venta/from-cotizacion falló: HTTP ${ordenRest.status} ${JSON.stringify(ordenRest.body).slice(0, 300)}`)
      return
    }
    const ordenId = ordenRest.body.orden.id
    creados.ordenId = ordenId
    ok(`orden de venta creada desde la cotización (${ordenRest.body.orden.numero}) yaExistia=${ordenRest.body.yaExistia}`)

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
