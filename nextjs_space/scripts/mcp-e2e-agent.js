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
 *      1. Catálogo vía /mcp: create_catalogo_item → search_catalogo lo
 *         encuentra (contrato 'query') → IDEMPOTENCIA: repetir con el mismo
 *         SKU devuelve yaExistia=true, el MISMO item y 1 sola fila en BD.
 *      2. lead → create_deal (titulo/valor/leadId) → create_cotizacion
 *         (catalogItems[]) → create_orden_from_cotizacion (cotizacionId),
 *         todos ejecutados de verdad por sus skills.
 *      3. Verificación de la orden por GET /api/ordenes-venta/:id (REST).
 *      4. IDEMPOTENCIA: repetir create_orden_from_cotizacion devuelve
 *         yaExistia=true con la MISMA orden y no duplica filas en BD.
 *      5. Citas vía /mcp: create_cita → list_citas la ve pendiente →
 *         cita_accion la confirma → IDEMPOTENCIA: repetir create_cita
 *         (mismo lead+fechaHora+tipo) devuelve yaExistia=true con la MISMA
 *         cita y 1 sola fila en BD.
 *      6. Catálogo vía /mcp: update_catalogo_item + get_catalogo_item.
 *      7. Evidencia en audit log (orden y cita).
 *      8. Limpieza total: el tenant dedicado completo (órdenes → cotizaciones
 *         → deals → citas → leads → catálogo → keys → audit → usuario → rol
 *         → tenant).
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
  for (const k of ['lead', 'deal', 'cotizacion', 'orden', 'cita', 'item']) {
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
    ['citas', () => prisma.cita.deleteMany({ where: { tenantId } })],
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

  const SCOPES_FLUJO = ['mcp:execute', 'leads:write', 'deals:read', 'deals:write', 'quotes:write', 'orders:read', 'orders:write', 'citas:read', 'citas:write', 'catalogo:read', 'catalogo:write']
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
    // ── 1. catálogo vía /mcp: create_catalogo_item ────────────────
    const SKU_ITEM = `E2E-${MARCA}`
    const itemMcp = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_catalogo_item',
      arguments: {
        nombre: `Servicio E2E MCP ${MARCA}`,
        descripcion: 'Item temporal del E2E de flujo comercial (se elimina al final)',
        sku: SKU_ITEM,
        tipo: 'servicio',
        precioBase: 123.45,
        moneda: 'EUR',
        unidad: 'servicio',
        activo: true,
      },
    }, 20)
    const itemMcpRes = itemMcp.body?.result
    if (itemMcp.status !== 200 || !itemMcpRes || itemMcpRes.isError) {
      fail(`create_catalogo_item vía /mcp falló: HTTP ${itemMcp.status} ${String(itemMcpRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const itemJson = JSON.parse(itemMcpRes.content?.[0]?.text || '{}')
    const itemId = itemJson.item?.id
    if (!itemId || itemJson.yaExistia !== false) {
      fail(`create_catalogo_item no devolvió {item:{id}, yaExistia:false}: ${JSON.stringify(itemJson).slice(0, 200)}`)
      return
    }
    ok(`item de catálogo creado vía /mcp (${itemJson.item.nombre}, SKU ${itemJson.item.sku}, ${itemJson.item.precioBase} ${itemJson.item.moneda})`)

    // ── 1b. search_catalogo encuentra el item recién creado ──────
    const itemSearch = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_search_catalogo',
      arguments: { query: MARCA, limit: 20 },
    }, 21)
    const itemSearchRes = itemSearch.body?.result
    if (itemSearch.status !== 200 || !itemSearchRes || itemSearchRes.isError) {
      fail(`search_catalogo vía /mcp falló: HTTP ${itemSearch.status} ${String(itemSearchRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const itemSearchJson = JSON.parse(itemSearchRes.content?.[0]?.text || '{}')
    if (!(itemSearchJson.items || []).some((it) => it.id === itemId)) {
      fail(`search_catalogo no devolvió el item recién creado (${(itemSearchJson.items || []).length} resultados)`)
      return
    }
    ok(`search_catalogo (contrato 'query') encuentra el item: ${itemSearchJson.total ?? itemSearchJson.items.length} resultado(s)`)

    // ── 1c. idempotencia de catálogo: repetir con el mismo SKU ───
    const itemMcp2 = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_catalogo_item',
      arguments: { nombre: `Servicio E2E MCP ${MARCA} (2ª llamada)`, sku: SKU_ITEM, precioBase: 999.99 },
    }, 22)
    const itemMcp2Res = itemMcp2.body?.result
    if (itemMcp2.status !== 200 || !itemMcp2Res || itemMcp2Res.isError) {
      fail(`create_catalogo_item repetido vía /mcp falló: HTTP ${itemMcp2.status} ${String(itemMcp2Res?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const itemJson2 = JSON.parse(itemMcp2Res.content?.[0]?.text || '{}')
    if (itemJson2.yaExistia !== true || itemJson2.item?.id !== itemId) {
      fail(`la 2ª creación debería devolver yaExistia=true y el MISMO item: ${JSON.stringify(itemJson2).slice(0, 200)}`)
      return
    }
    if (Number(itemJson2.item.precioBase) !== 123.45) {
      fail(`el item idempotente debería conservar los datos originales (precioBase=${itemJson2.item.precioBase})`)
      return
    }
    const cuantosItems = await prisma.catalogoItem.count({ where: { tenantId: tenant.id, sku: SKU_ITEM } })
    if (cuantosItems !== 1) {
      fail(`el SKU acabó con ${cuantosItems} items; la 2ª creación duplicó datos`)
      return
    }
    ok('idempotencia catálogo: mismo SKU → yaExistia=true, mismo item (datos originales) y 1 sola fila en BD, sin P2002')

    // ── 2. lead vía /mcp ─────────────────────────────────────────
    const leadCall = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_lead',
      arguments: {
        nombre: `E2E MCP Lead ${MARCA}`,
        email: `${MARCA.toLowerCase()}@e2e.volkern.app`,
        canal: 'web',
        notas: 'Lead temporal del E2E de flujo comercial (se elimina al final)',
      },
    }, 23)
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
    }, 24)
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
        catalogItems: [{ catalogoItemId: itemId, cantidad: 2 }],
        leadId,
        dealId,
      },
    }, 25)
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
    }, 26)
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
    }, 27)
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

    // ── 8. citas vía /mcp: create_cita ───────────────────────────
    const fechaCita = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    fechaCita.setUTCHours(10, 0, 0, 0)
    const fechaCitaIso = fechaCita.toISOString()
    const citaMcp = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_cita',
      arguments: {
        leadId,
        fechaHora: fechaCitaIso,
        tipo: 'reunion',
        titulo: `E2E MCP Cita ${MARCA}`,
        descripcion: 'Cita temporal del E2E de flujo comercial (se elimina al final)',
        duracion: 45,
      },
    }, 28)
    const citaMcpRes = citaMcp.body?.result
    if (citaMcp.status !== 200 || !citaMcpRes || citaMcpRes.isError) {
      fail(`create_cita vía /mcp falló: HTTP ${citaMcp.status} ${String(citaMcpRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const citaJson = JSON.parse(citaMcpRes.content?.[0]?.text || '{}')
    const citaId = citaJson.cita?.id
    if (!citaId || citaJson.yaExistia !== false) {
      fail(`create_cita no devolvió {cita:{id}, yaExistia:false}: ${JSON.stringify(citaJson).slice(0, 200)}`)
      return
    }
    if (citaJson.cita.leadId !== leadId) {
      fail(`la cita no quedó vinculada al lead (leadId=${citaJson.cita.leadId ?? 'null'})`)
      return
    }
    ok(`cita creada vía /mcp (${citaJson.cita.titulo} · ${fechaCitaIso} · ${citaJson.cita.duracion} min)`)

    // ── 9. list_citas la ve pendiente ────────────────────────────
    const citasList = await mcpCall(KEY_A, 'tools/call', { name: 'volkern_list_citas', arguments: {} }, 29)
    const citasListRes = citasList.body?.result
    if (citasList.status !== 200 || !citasListRes || citasListRes.isError) {
      fail(`list_citas vía /mcp falló: HTTP ${citasList.status} ${String(citasListRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const citasListJson = JSON.parse(citasListRes.content?.[0]?.text || '{}')
    const laCita = (citasListJson.citas || []).find((c) => c.id === citaId)
    if (citasListJson.total !== 1 || !laCita) {
      fail(`list_citas debería devolver exactamente la cita creada (total=${citasListJson.total})`)
      return
    }
    if (laCita.estado !== 'pendiente') {
      fail(`la cita creada debería estar pendiente y está ${laCita.estado}`)
      return
    }
    ok('list_citas verifica la cita: 1 cita en el tenant dedicado, estado pendiente')

    // ── 10. cita_accion: confirmar ───────────────────────────────
    const citaAccion = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_cita_accion',
      arguments: { citaId, accion: 'confirmar' },
    }, 30)
    const citaAccionRes = citaAccion.body?.result
    if (citaAccion.status !== 200 || !citaAccionRes || citaAccionRes.isError) {
      fail(`cita_accion vía /mcp falló: HTTP ${citaAccion.status} ${String(citaAccionRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const citaAccionJson = JSON.parse(citaAccionRes.content?.[0]?.text || '{}')
    if (citaAccionJson.success !== true || citaAccionJson.estado !== 'confirmada') {
      fail(`confirmar debería devolver success=true y estado confirmada: ${JSON.stringify(citaAccionJson).slice(0, 200)}`)
      return
    }
    ok('cita_accion confirma la cita: estado confirmada')

    // ── 11. idempotencia de citas: repetir create_cita ───────────
    const citaMcp2 = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_create_cita',
      arguments: {
        leadId,
        fechaHora: fechaCitaIso,
        tipo: 'reunion',
        titulo: `E2E MCP Cita ${MARCA} (2ª llamada)`,
        descripcion: 'Segunda llamada (idempotencia): otros titulo/duracion, misma clave',
        duracion: 60,
      },
    }, 31)
    const citaMcp2Res = citaMcp2.body?.result
    if (citaMcp2.status !== 200 || !citaMcp2Res || citaMcp2Res.isError) {
      fail(`create_cita repetido vía /mcp falló: HTTP ${citaMcp2.status} ${String(citaMcp2Res?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const citaJson2 = JSON.parse(citaMcp2Res.content?.[0]?.text || '{}')
    if (citaJson2.yaExistia !== true || citaJson2.cita?.id !== citaId) {
      fail(`la 2ª cita debería devolver yaExistia=true y la MISMA cita: ${JSON.stringify(citaJson2).slice(0, 200)}`)
      return
    }
    if (citaJson2.cita.duracion !== 45) {
      fail(`la cita idempotente debería conservar los datos originales (duracion=${citaJson2.cita.duracion})`)
      return
    }
    const cuantasCitas = await prisma.cita.count({
      where: { tenantId: tenant.id, leadId, fechaHora: new Date(fechaCitaIso), tipo: 'reunion' },
    })
    if (cuantasCitas !== 1) {
      fail(`el lead acabó con ${cuantasCitas} citas a la misma hora; la 2ª creación duplicó datos`)
      return
    }
    ok('idempotencia citas: mismo lead+fechaHora+tipo → yaExistia=true, misma cita (datos originales) y 1 sola fila en BD')

    // ── 12. catálogo vía /mcp: update + get ──────────────────────
    const itemUpd = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_update_catalogo_item',
      arguments: { itemId, destacado: true, descripcion: 'Item temporal del E2E — actualizado vía update_catalogo_item' },
    }, 32)
    const itemUpdRes = itemUpd.body?.result
    if (itemUpd.status !== 200 || !itemUpdRes || itemUpdRes.isError) {
      fail(`update_catalogo_item vía /mcp falló: HTTP ${itemUpd.status} ${String(itemUpdRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const itemGet = await mcpCall(KEY_A, 'tools/call', {
      name: 'volkern_get_catalogo_item',
      arguments: { itemId },
    }, 33)
    const itemGetRes = itemGet.body?.result
    if (itemGet.status !== 200 || !itemGetRes || itemGetRes.isError) {
      fail(`get_catalogo_item vía /mcp falló: HTTP ${itemGet.status} ${String(itemGetRes?.content?.[0]?.text).slice(0, 300)}`)
      return
    }
    const itemGetJson = JSON.parse(itemGetRes.content?.[0]?.text || '{}')
    if (itemGetJson.item?.destacado !== true) {
      fail(`get_catalogo_item no refleja la actualización (destacado=${itemGetJson.item?.destacado})`)
      return
    }
    ok('update_catalogo_item + get_catalogo_item verifican la actualización del item')

    // ── 13. evidencia en audit log (orden y cita) ────────────────
    const auditOrden = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, entidad: 'orden_venta', entidadId: ordenId },
      orderBy: { fechaCreacion: 'desc' },
    })
    if (!auditOrden) { fail('sin audit log de la orden de venta en BD'); return }
    ok(`audit log de la orden verificado: ${auditOrden.accion} · ${auditOrden.descripcion?.slice(0, 80)}`)
    const auditCitaAccion = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, entidad: 'Cita', entidadId: citaId, accion: 'CONFIRMAR_CITA' },
    })
    const auditCitaCreate = await prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, entidad: 'Cita', entidadId: citaId, accion: 'CREATE' },
    })
    if (!auditCitaAccion || !auditCitaCreate) {
      fail(`sin audit log de la cita en BD (CREATE=${!!auditCitaCreate}, CONFIRMAR_CITA=${!!auditCitaAccion})`)
      return
    }
    ok(`audit log de la cita verificado: CREATE + ${auditCitaAccion.accion}`)
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
