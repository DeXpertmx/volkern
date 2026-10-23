#!/usr/bin/env node
/**
 * Verificación E2E de subregistros de lead por /mcp (tareas, notas, etiquetas).
 *
 * Corre DENTRO del contenedor desplegado (como scripts/mcp-e2e-agent.js):
 * es el único sitio con el cliente Prisma de la imagen en producción.
 *
 * AISLAMIENTO: tenant dedicado creado y borrado aquí; nada toca datos reales.
 *
 * Uso:
 *   scp scripts/verify-mcp-subrecords.js root@vps:/tmp/
 *   ssh root@vps "docker cp /tmp/verify-mcp-subrecords.js <app>:/tmp/"
 *   ssh root@vps "docker exec -w /app -e IN_CONTAINER=1 -e NODE_PATH=/app/node_modules \
 *     -e VOLKERN_APP_URL=https://volkern.app <app> node /tmp/verify-mcp-subrecords.js"
 */

const crypto = require('crypto')

if (!process.env.IN_CONTAINER) {
  console.error('✗ Este script debe correr DENTRO del contenedor desplegado.')
  process.exit(1)
}

const APP_URL = (process.env.VOLKERN_APP_URL || 'https://volkern.app').replace(/\/$/, '')
const MARCA = `VERIF-MCP-${Date.now().toString(36)}`
const SLUG = MARCA.toLowerCase()
const KEY = `vk_prod_${crypto.randomBytes(32).toString('hex')}`
const hash = (k) => crypto.createHash('sha256').update(k).digest('hex')

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

let fallos = 0
const ok = (m) => console.log(`   ✓ ${m}`)
const mal = (m) => { fallos++; console.error(`   ✗ ${m}`) }
const comprobar = (cond, bien, error) => (cond ? ok(bien) : mal(error))

async function mcpCall(key, name, args, id) {
  const res = await fetch(`${APP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  })
  let body = null
  try { body = await res.json() } catch { /* sin cuerpo */ }
  const result = body?.result
  let data = null
  if (result && !result.isError) {
    try { data = JSON.parse(result.content?.[0]?.text || 'null') } catch { data = null }
  }
  return { status: res.status, body, isError: !!result?.isError, texto: result?.content?.[0]?.text, data }
}

async function prepararTenant() {
  const tenant = await prisma.tenant.create({ data: { nombre: `Verif MCP ${MARCA}`, slug: SLUG } })
  const rol = await prisma.role.create({
    data: { tenantId: tenant.id, nombre: 'OWNER', permisos: {}, descripcion: 'Rol temporal de verificación' },
  })
  const admin = await prisma.user.create({
    data: { email: `${SLUG}@e2e.volkern.app`, name: 'Verif MCP Admin', tenantId: tenant.id, roleId: rol.id },
  })
  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      userId: admin.id,
      nombre: 'Verif subregistros (temporal)',
      descripcion: 'Key temporal — se elimina al terminar',
      keyHash: hash(KEY),
      prefix: KEY.slice(0, 16),
      scopes: ['mcp:execute', 'leads:read', 'leads:write', 'tasks:read', 'tasks:write', 'notes:read', 'notes:write'],
      activo: true,
    },
  })
  return { tenant, admin }
}

async function limpiar(tenantId) {
  await prisma.task.deleteMany({ where: { tenantId } }).catch(() => {})
  // Note no tiene tenantId: se borra por lead (FK del lead).
  const leads = await prisma.lead.findMany({ where: { tenantId }, select: { id: true } }).catch(() => [])
  if (leads.length) {
    await prisma.note.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } }).catch(() => {})
  }
  await prisma.lead.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.apiKey.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.role.deleteMany({ where: { tenantId } }).catch(() => {})
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
}

async function main() {
  console.log(`→ Verificación /mcp (tareas, notas, etiquetas) contra ${APP_URL}`)
  const { tenant, admin } = await prepararTenant()
  console.log(`   · tenant dedicado: ${tenant.slug} · usuario: ${admin.email}`)
  const TS = Date.now().toString(36)
  const TITULO_TAREA = `Llamar para seguimiento ${TS}`
  const TITULO_NOTA = `Contexto ${TS}`

  try {
    // 1. Lead con etiqueta inicial (create_lead + etiquetas → Lead.tags)
    const lead = await mcpCall(KEY, 'volkern_create_lead', {
      nombre: `Lead Verif ${TS}`,
      email: `lead-${TS}@e2e.volkern.app`,
      telefono: '+34600000000',
      empresa: 'Verif SL',
      canal: 'web',
      etiquetas: ['inicial'],
    }, 1)
    comprobar(
      lead.status === 200 && !lead.isError,
      'create_lead ejecutado (HTTP 200, sin isError)',
      `create_lead falló: HTTP ${lead.status} ${String(lead.texto).slice(0, 200)}`
    )
    const leadId = lead.data?.lead?.id || lead.data?.id
    if (!leadId) { mal('create_lead no devolvió id de lead'); return }
    const leadBd = await prisma.lead.findUnique({ where: { id: leadId }, select: { tags: true, tenantId: true } })
    comprobar(leadBd?.tags === 'inicial', `lead guardado con etiquetas CSV: "${leadBd?.tags}"`, `lead.tags inesperado: ${JSON.stringify(leadBd?.tags)}`)
    comprobar(leadBd?.tenantId === tenant.id, 'lead aislado en el tenant dedicado', 'el lead no pertenece al tenant dedicado')

    // 2. Tarea por el NOMBRE DEL CATÁLOGO, con asignadoA (mapeo nuevo)
    const task = await mcpCall(KEY, 'volkern_create_task', {
      leadId,
      tipo: 'llamada',
      titulo: TITULO_TAREA,
      descripcion: 'Verificación E2E de subregistros',
      fechaVencimiento: new Date(Date.now() + 86400000).toISOString(),
      asignadoA: admin.id,
    }, 2)
    comprobar(
      task.status === 200 && !task.isError,
      'volkern_create_task ejecutado (HTTP 200, sin isError)',
      `volkern_create_task falló: HTTP ${task.status} ${String(task.texto).slice(0, 300)}`
    )
    const tareaBd = await prisma.task.findFirst({
      where: { tenantId: tenant.id, titulo: TITULO_TAREA },
      select: { id: true, leadId: true, tipo: true, asignadoA: true, completada: true },
    })
    comprobar(!!tareaBd, 'tarea persistida en BD', 'la tarea NO existe en BD (se respondió éxito sin guardar)')
    if (tareaBd) {
      comprobar(tareaBd.leadId === leadId, 'tarea vinculada al lead', `leadId de la tarea: ${tareaBd.leadId}`)
      comprobar(tareaBd.tipo === 'llamada', 'tipo de tarea guardado', `tipo inesperado: ${tareaBd.tipo}`)
      comprobar(tareaBd.asignadoA === admin.id, 'asignadoA aplicado (catálogo → Task.asignadoA)', `asignadoA inesperado: ${tareaBd.asignadoA}`)
    }

    // 3. Nota con título (campo del catálogo que antes se descartaba)
    const nota = await mcpCall(KEY, 'volkern_create_note', {
      leadId,
      titulo: TITULO_NOTA,
      contenido: 'Cliente interesado en el paquete premium.',
    }, 3)
    comprobar(
      nota.status === 200 && !nota.isError,
      'volkern_create_note ejecutado (HTTP 200, sin isError)',
      `volkern_create_note falló: HTTP ${nota.status} ${String(nota.texto).slice(0, 300)}`
    )
    const notaBd = await prisma.note.findFirst({
      where: { leadId },
      orderBy: { fechaCreacion: 'desc' },
      select: { contenido: true },
    })
    comprobar(!!notaBd, 'nota persistida en BD', 'la nota NO existe en BD')
    if (notaBd) {
      comprobar(
        notaBd.contenido.startsWith(`**${TITULO_NOTA}**`) && notaBd.contenido.includes('paquete premium'),
        'título antepuesto al contenido de la nota',
        `contenido inesperado: ${notaBd.contenido.slice(0, 120)}`
      )
    }

    // 4. Etiquetas por update_lead: se añaden, sin duplicar por mayúsculas
    const up1 = await mcpCall(KEY, 'volkern_update_lead', { leadId, etiquetas: ['VIP'] }, 4)
    comprobar(up1.status === 200 && !up1.isError, 'update_lead etiquetas [VIP] ejecutado', `update_lead falló: HTTP ${up1.status} ${String(up1.texto).slice(0, 200)}`)
    const up2 = await mcpCall(KEY, 'volkern_update_lead', { leadId, etiquetas: ['vip', 'seguimiento'] }, 5)
    comprobar(up2.status === 200 && !up2.isError, 'update_lead etiquetas [vip, seguimiento] ejecutado', `update_lead falló: HTTP ${up2.status} ${String(up2.texto).slice(0, 200)}`)
    const tagsBd = await prisma.lead.findUnique({ where: { id: leadId }, select: { tags: true } })
    comprobar(
      tagsBd?.tags === 'inicial,VIP,seguimiento',
      `etiquetas fusionadas sin duplicar: "${tagsBd?.tags}"`,
      `etiquetas inesperadas: "${tagsBd?.tags}" (esperaba "inicial,VIP,seguimiento")`
    )

    // 5. Lectura por /mcp: las listas ven lo creado
    const listT = await mcpCall(KEY, 'volkern_list_tasks', { leadId }, 6)
    const tareasLista = listT.data?.tareas || listT.data?.tasks || listT.data?.items || (Array.isArray(listT.data) ? listT.data : [])
    comprobar(
      tareasLista.some((t) => t.titulo === TITULO_TAREA),
      'volkern_list_tasks devuelve la tarea creada',
      `list_tasks no la devuelve: ${JSON.stringify(listT.data).slice(0, 200)}`
    )
    const listN = await mcpCall(KEY, 'volkern_list_notes', { leadId }, 7)
    const notasLista = listN.data?.notas || listN.data?.notes || listN.data?.items || (Array.isArray(listN.data) ? listN.data : [])
    comprobar(
      notasLista.some((n) => String(n.contenido || '').includes(TITULO_NOTA)),
      'volkern_list_notes devuelve la nota creada',
      `list_notes no la devuelve: ${JSON.stringify(listN.data).slice(0, 200)}`
    )

    // 6. Nombre legacy sin prefijo en /mcp (antes: «Tool desconocida»)
    const legacy = await mcpCall(KEY, 'create_task', {
      leadId,
      tipo: 'email',
      titulo: `Legacy ${TS}`,
      fechaVencimiento: new Date(Date.now() + 172800000).toISOString(),
    }, 8)
    comprobar(
      legacy.status === 200 && !legacy.isError,
      'nombre legacy "create_task" aceptado en /mcp',
      `nombre legacy rechazado: HTTP ${legacy.status} ${JSON.stringify(legacy.body?.error || legacy.texto).slice(0, 200)}`
    )
    const legacyBd = await prisma.task.count({ where: { tenantId: tenant.id, titulo: `Legacy ${TS}` } })
    comprobar(legacyBd === 1, 'tarea legacy persistida en BD', `filas de la tarea legacy: ${legacyBd}`)

    // 7. Evidencia en audit log
    const audit = await prisma.auditLog.count({ where: { tenantId: tenant.id, accion: 'MCP_tool_execution' } })
    comprobar(audit >= 6, `audit log de /mcp registrado (${audit} entradas)`, `pocas entradas de audit log: ${audit}`)
  } finally {
    console.log('   · limpieza del tenant dedicado ...')
    await limpiar(tenant.id)
    const resta = await prisma.tenant.count({ where: { id: tenant.id } })
    if (resta) { mal('el tenant de verificación sigue existiendo'); } else { ok('tenant de verificación eliminado') }
    await prisma.$disconnect()
  }

  if (fallos > 0) {
    console.error(`✗ Verificación FALLIDA: ${fallos} comprobación(es) en rojo.`)
    process.exit(1)
  }
  console.log('✓ Verificación OK: tareas, notas y etiquetas se crean de verdad por /mcp.')
}

main().catch(async (e) => {
  console.error(`✗ Error inesperado: ${e?.stack || e}`)
  process.exit(1)
})
