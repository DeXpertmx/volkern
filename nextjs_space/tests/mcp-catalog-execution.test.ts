// @vitest-environment node
/**
 * Suite de EJECUCIÓN de las 43 tools del catálogo MCP contra un Prisma
 * mockeado (sin tocar producción ni la BD local).
 *
 * Qué detecta (regresiones de contrato catálogo ↔ executor):
 *   1. Que CADA tool del catálogo (mcp-server/src/tools-catalog.ts) ejecute
 *      de verdad su skill por el mismo camino que producción:
 *      resolveSkillName(volkern_X) → handleCallTool → executeSkill.
 *   2. Que los required del inputSchema del catálogo basten para que el
 *      executor no falle por argumentos ("X es requerido").
 *   3. Que la respuesta sea serializable a JSON (lo que /mcp devuelve).
 *   4. Los contratos IDEMPOTENTES ya establecidos: create_cita, y
 *      create_catalogo_item (por SKU) y create_orden_from_cotizacion
 *      devuelven yaExistia=true en la repetición sin duplicar (un solo
 *      create en el mock).
 *
 * El mock de Prisma es un Proxy universal: cualquier modelo.método responde
 * con fixtures plausibles (configurables por test vía `overrides`), de modo
 * que añadir una tool al catálogo la incorpora a la suite automáticamente.
 *
 *Mocks de módulos con efectos externos: WhatsApp (proveedor) y
 * ComplianceGate (puerta RGPD) se sustituyen por dobles; el resto de la
 * lógica de negocio (from-catalog, from-cotizacion, appointments, finanzas,
 * inventario, producción) corre REAL sobre el Prisma mockeado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Universo mockeado (hoisted para el factory de vi.mock) ──────────────
const h = vi.hoisted(() => {
  const TENANT = 'tenant-e2e'
  const USER_ID = 'user-e2e'

  // Fecha futura lejana para citas (lejos de los fixtures fijos → sin
  // conflictos de horario accidentales en la validación ±24h).
  const FECHA_CITA = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // ── Fixtures por modelo (solo los campos que leen los executors) ──
  const FIXTURES: Record<string, any> = {
    user: {
      id: USER_ID, tenantId: TENANT, email: 'admin@e2e.test', name: 'E2E Admin',
      role: { id: 'role-1', nombre: 'OWNER', permisos: {} },
    },
    lead: {
      id: 'lead-1', tenantId: TENANT, nombre: 'Mock lead', email: 'lead@e2e.test',
      telefono: '+34600000001', estado: 'nuevo', canal: 'web', score: 10,
      citas: [], deals: [], cotizaciones: [], interacciones: [], notas: [], tareas: [], conversaciones: [],
    },
    contact: {
      id: 'contact-1', tenantId: TENANT, nombre: 'Mock contacto', email: 'contact@e2e.test',
      telefono: '+34600000002', tipo: 'person', _count: { deals: 0 },
      deals: [], interactions: [], company: null,
    },
    deal: {
      id: 'deal-1', tenantId: TENANT, leadId: 'lead-1', titulo: 'Mock deal',
      valor: 246.9, moneda: 'EUR', etapa: 'calificacion', prioridad: 'media', probabilidad: 25,
      lead: { id: 'lead-1', nombre: 'Mock lead', email: 'lead@e2e.test' },
      items: [], activities: [],
    },
    catalogoItem: {
      id: 'item-1', tenantId: TENANT, nombre: 'Mock item', sku: 'SKU-MOCK', tipo: 'servicio',
      precioBase: 123.45, moneda: 'EUR', unidad: 'unidad', descripcion: 'Item de prueba',
      categoriaFiscal: 'general', tasaImpuestoId: null, activo: true, destacado: false,
      categorias: [], etiquetas: [], pricing: null, costOfAcquisition: 0,
      tasaImpuesto: null,
      inventoryConfig: { id: 'inv-1', reorderPoint: 5, minStock: 5 },
    },
    cita: {
      id: 'cita-1', tenantId: TENANT, leadId: 'lead-1', titulo: 'Mock cita',
      estado: 'pendiente', tipo: 'reunion', duracion: 45,
      fechaHora: new Date('2020-01-01T10:00:00.000Z'), descripcion: null,
      lead: { id: 'lead-1', nombre: 'Mock lead', email: 'lead@e2e.test' },
    },
    cotizacionItem: {
      id: 'cotitem-1', cotizacionId: 'cot-1', catalogoItemId: 'item-1', orden: 0,
      concepto: 'Mock item', descripcion: 'Item de prueba', cantidad: 2,
      precioUnitario: 123.45, descuento: 0, subtotal: 246.9,
      porcentajeImpuesto: 0, montoImpuesto: 0, total: 246.9,
      tasaImpuestoId: null, aplicaRetencion: false, porcentajeRetencion: 0, montoRetencion: 0,
      catalogoItem: { id: 'item-1', nombre: 'Mock item', sku: 'SKU-MOCK', unidad: 'unidad', precioBase: 123.45, tasaImpuestoId: null, tasaImpuesto: null },
      tasaImpuesto: null,
    },
    cotizacion: {
      id: 'cot-1', tenantId: TENANT, numero: 'COT-2026-0001', titulo: 'Mock cotización',
      estado: 'aceptada', total: 246.9, subtotal: 246.9, moneda: 'EUR', descuentoPorcentaje: 0,
      dealId: 'deal-1', leadId: 'lead-1', contactId: null, emisorId: null,
      notasCliente: null, notasInternas: null, fechaAceptacion: null,
      items: [null], // se rellena abajo (autorreferencia)
      lead: { id: 'lead-1', nombre: 'Mock lead', email: 'lead@e2e.test' },
      deal: { id: 'deal-1', titulo: 'Mock deal' },
      emisor: { id: 'emisor-1', pais: 'ES', razonSocial: 'Mock Emisor SL' },
    },
    ordenVenta: {
      id: 'ord-1', tenantId: TENANT, numero: 'OV-2026-0001', cotizacionId: 'cot-1',
      estado: 'borrador', total: 246.9, moneda: 'EUR',
      lead: { id: 'lead-1', nombre: 'Mock lead', email: 'lead@e2e.test' },
      cotizacion: { id: 'cot-1', numero: 'COT-2026-0001', titulo: 'Mock cotización' },
      items: [],
    },
    contrato: {
      id: 'contrato-1', tenantId: TENANT, numero: 'CTR-2026-0001', estado: 'activo', items: [],
    },
    perfilFiscalCliente: {
      id: 'pfc-1', country: 'ES', exentoImpuestos: false, aplicaRetencion: false, idIntracomunitario: null,
    },
    tenant: { id: TENANT, nombre: 'Mock tenant', slug: 'mock-tenant', moneda: 'EUR', subdomain: 'mock' },
    servicio: { id: 'serv-1', tenantId: TENANT, nombre: 'Mock servicio', precioBase: 100, moneda: 'EUR', activo: true },
    tasaImpuesto: { id: 'tax-1', nombre: 'IVA 21%', porcentaje: 21 },
    task: { id: 'task-1', leadId: 'lead-1', titulo: 'Mock task', tipo: 'llamada', estado: 'pendiente', fechaVencimiento: new Date(Date.now() + 86400000) },
    conversation: { id: 'conv-1', tenantId: TENANT, leadId: 'lead-1', canal: 'whatsapp', fechaUltimoMensaje: new Date() },
    interaction: { id: 'int-1', leadId: 'lead-1', tipo: 'llamada', contenido: 'mock' },
    note: { id: 'note-1', leadId: 'lead-1', contenido: 'mock' },
    warehouse: { id: 'wh-1', tenantId: TENANT, name: 'Almacén principal' },
    stockLevel: {
      id: 'stock-1', tenantId: TENANT, warehouseId: 'wh-1', catalogoItemId: 'item-1',
      quantity: 100, minStock: 5,
      catalogoItem: { id: 'item-1', nombre: 'Mock item', sku: 'SKU-MOCK' },
      warehouse: { id: 'wh-1', name: 'Almacén principal' },
    },
    workOrder: { id: 'wo-1', tenantId: TENANT, estado: 'en_proceso', bom: { components: [] } },
    financialAudit: { id: 'fin-1', hash: 'mock-hash', prevHash: null, accion: 'mock' },
    // configuración genérica: JSON vacío → los lectores caen a sus defaults
    configuracion: { id: 'cfg-1', tenantId: TENANT, clave: 'mock', valor: '{}' },
  }
  FIXTURES.cotizacion.items = [FIXTURES.cotizacionItem]

  // Fixture genérico para modelos no tabulados
  function fixtureFor(model: string): any {
    if (FIXTURES[model]) return FIXTURES[model]
    // fixture genérico: los agregados devuelven SUMAS (los consumidores
    // hacen `new Decimal(summary.revenue)`; undefined explotaría)
    return {
      id: `${model}-mock-1`, tenantId: TENANT, nombre: `Mock ${model}`,
      estado: 'activo', activo: true, _count: { deals: 0 },
      lead: FIXTURES.lead, catalogoItem: FIXTURES.catalogoItem, servicio: FIXTURES.servicio,
      tenant: { id: TENANT, nombre: 'Mock tenant' }, role: { nombre: 'OWNER' },
    }
  }

  // Superficies agregadas que la lógica financiera espera en los fixtures
  FIXTURES.invoice = { _sum: { monto: 1500 } }
  FIXTURES.expense = { _sum: { amount: 600 } }
  // productionLog: los select piden quantity (new Decimal(log.quantity))
  FIXTURES.productionLog = { id: 'plog-1', tenantId: TENANT, quantity: 0, action: 'CONSUMPTION', itemId: 'item-1' }

  // Overrides por test: clave 'modelo.metodo' → impl async
  const overrides: Record<string, any> = {}

  function makeModelMock(model: string) {
    return new Proxy({}, {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        const ov = overrides[`${model}.${method}`]
        if (ov) return ov
        switch (method) {
          case 'findUnique':
          case 'findFirst':
          case 'findUniqueOrThrow':
          case 'findFirstOrThrow':
            // contact.findFirst sin id en el where = sondeo de unicidad de
            // email (dedup de create_contact) → null permite crear; las
            // búsquedas por id (contrato del catálogo) sí resuelven fixture
            return async (a: any) =>
              model === 'contact' && a?.where && !('id' in a.where) ? null : fixtureFor(model)
          case 'findMany':
            return async () => [fixtureFor(model)]
          case 'groupBy':
            return async () => []
          case 'count':
            return async () => 1
          case 'create':
            return async ({ data }: any) => ({ id: `${model}-mock-new`, tenantId: TENANT, ...(data ?? {}) })
          case 'createMany':
            return async () => ({ count: 1 })
          case 'update':
          case 'upsert':
            return async (a: any) => ({
              ...fixtureFor(model),
              ...(a?.data ?? a?.update ?? {}),
              ...(a?.where?.id ? { id: a.where.id } : {}),
            })
          case 'updateMany':
          case 'deleteMany':
            return async () => ({ count: 1 })
          case 'delete':
            return async () => fixtureFor(model)
          case 'aggregate':
            return async () => ({ _sum: {}, _avg: {}, _count: {}, _min: {}, _max: {} })
          default:
            return async () => null
        }
      },
    })
  }

  const prismaMock: any = new Proxy({}, {
    get(_target, prop) {
      const p = String(prop)
      if (p === 'then') return undefined
      if (p === '$transaction') {
        return async (arg: any) => (typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg))
      }
      if (p === '$queryRaw' || p === '$queryRawUnsafe') return async () => []
      if (p === '$executeRaw' || p === '$executeRawUnsafe') return async () => 0
      if (p === '$disconnect' || p === '$connect') return async () => undefined
      if (p.startsWith('$')) return async () => null
      return makeModelMock(p)
    },
  })

  return { TENANT, USER_ID, FECHA_CITA, FIXTURES, overrides, prismaMock }
})

vi.mock('@/lib/db', () => ({
  prisma: h.prismaMock,
  globalPrisma: h.prismaMock,
  default: h.prismaMock,
  dbContext: { run: (_s: unknown, fn: () => unknown) => fn(), getStore: () => undefined },
  getTenantDb: async () => h.prismaMock,
  runWithTenant: async (_t: string, fn: () => unknown) => fn(),
  setCurrentTenantId: () => {},
  getCurrentTenantId: () => null,
  clearCurrentTenantId: () => {},
}))

// Proveedor WhatsApp externo → doble
vi.mock('@/lib/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true, sid: 'mock-wamid' })),
}))

// Puerta RGPD de delete_contact → permite (la política de compliance se
// testa en su propia suite; aquí solo interesa el contrato del executor)
vi.mock('@/lib/compliance-gate', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ComplianceGate: { check: vi.fn(async () => ({ allowed: true })) },
}))

import { VOLKERN_TOOLS } from '../mcp-server/src/tools-catalog'
import { handleCallTool, resolveSkillName } from '@/lib/mcp/mcp-handler'
import { executeSkill } from '@/lib/skills'

// ── Construcción de argumentos desde el CONTRATO DEL CATÁLOGO ───────────
const ID_VALUES: Record<string, string> = {
  leadId: 'lead-1', contactId: 'contact-1', dealId: 'deal-1', citaId: 'cita-1',
  itemId: 'item-1', cotizacionId: 'cot-1', ordenId: 'ord-1', servicioId: 'serv-1',
  taskId: 'task-1', workOrderId: 'wo-1', productId: 'item-1', warehouseId: 'wh-1',
  companyId: 'contact-1', contratoId: 'contrato-1',
}
const NUM_VALUES: Record<string, number> = { valor: 100, precioBase: 9.99, quantity: 2 }

function fillProp(key: string, prop: any): unknown {
  if (prop?.enum?.length) return prop.enum[0]
  switch (prop?.type) {
    case 'number': return NUM_VALUES[key] ?? 1
    case 'boolean': return true
    case 'object': return {}
    case 'array': return []
  }
  if (ID_VALUES[key]) return ID_VALUES[key]
  if (key === 'fecha') return h.FECHA_CITA.slice(0, 10)
  if (/fecha/i.test(key)) return h.FECHA_CITA
  if (key === 'query' || key === 'search') return 'Mock'
  if (key === 'email') return 'e2e@test.dev'
  return `E2E ${key}`
}

// Suplementos donde el required del schema no basta por sí solo
const EXTRA_ARGS: Record<string, Record<string, unknown>> = {
  volkern_create_cotizacion: { titulo: 'Cotización E2E', catalogItems: [{ catalogoItemId: 'item-1', cantidad: 2 }] },
  volkern_create_cita: { titulo: 'Cita E2E' },
  volkern_create_task: { titulo: 'Tarea E2E' },
  volkern_create_deal: { leadId: 'lead-1' },
  volkern_create_catalogo_item: { sku: 'SKU-E2E-TEST' },
  // create_lead: el mock de create devuelve {id, ...data}; data.email existe
  // desde el fix del wrapper, pero este test pinza el contrato independiente
  // del executor
  volkern_create_lead: { email: 'e2e-create@test.dev' },
  volkern_report_production_scrap: {
    evidenceUrl: 'https://e2e.test/evidencia.jpg', lat: 40.4168, lng: -3.7038,
  },
}

function argsFor(toolName: string): Record<string, unknown> {
  const tool = VOLKERN_TOOLS.find((t) => t.name === toolName)!
  const args: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(tool.inputSchema.properties ?? {})) {
    if ((tool.inputSchema.required ?? []).includes(key)) {
      args[key] = fillProp(key, prop)
    }
  }
  return { ...args, ...(EXTRA_ARGS[toolName] ?? {}) }
}

/** Mismo camino que app/mcp/route.ts: resuelve el alias y delega en el handler. */
async function callTool(toolName: string, extraArgs: Record<string, unknown> = {}) {
  return handleCallTool({
    name: resolveSkillName(toolName),
    arguments: { ...argsFor(toolName), ...extraArgs, tenantId: h.TENANT, userId: h.USER_ID, source: 'mcp' },
  })
}

beforeEach(() => {
  for (const k of Object.keys(h.overrides)) delete h.overrides[k]
  // Sin integraciones de calendario en el tenant mockeado (como el tenant E2E real)
  h.overrides['googleCalendarIntegration.findUnique'] = async () => null
  h.overrides['googleCalendarIntegration.findFirst'] = async () => null
  h.overrides['connectedCalendar.findUnique'] = async () => null
})

// ═══════════════════════════════════════════════════════════════════════
// 1. EJECUCIÓN REAL DE LAS 43 TOOLS (una prueba por tool)
// ═══════════════════════════════════════════════════════════════════════
describe('Ejecución de las tools del catálogo contra Prisma mockeado', () => {
  it.each(VOLKERN_TOOLS.map((t) => [t.name]))('%s ejecuta de verdad y devuelve JSON', async (toolName) => {
    const res = await callTool(toolName as string)
    const texto = res.content?.[0]?.text ?? ''
    expect(res.isError, `${toolName} devolvió isError: ${texto.slice(0, 300)}`).toBe(false)
    const parsed = JSON.parse(texto || 'null')
    expect(parsed, `${toolName} devolvió una respuesta vacía`).not.toBeNull()
  }, 30000)
})

// ═══════════════════════════════════════════════════════════════════════
// 2. CONTRATOS IDEMPOTENTES (el patrón yaExistia del catálogo)
// ═══════════════════════════════════════════════════════════════════════
describe('Contratos idempotentes del catálogo', () => {
  it('volkern_create_cita: repetición → yaExistia=true, misma cita y UN solo create', async () => {
    let creada = false
    const citaCreate = vi.fn(async ({ data }: any) => {
      creada = true
      return { id: 'cita-nueva', ...data }
    })
    h.overrides['cita.findFirst'] = vi.fn(async () => (creada ? h.FIXTURES.cita : null))
    h.overrides['cita.create'] = citaCreate

    const args = {
      tenantId: h.TENANT, userId: h.USER_ID, leadId: 'lead-1',
      fechaHora: h.FECHA_CITA, tipo: 'reunion', titulo: 'Cita E2E',
    }
    const r1 = await executeSkill('create_cita' as any, args as any)
    expect(r1.yaExistia).toBe(false)
    expect(r1.cita.id).toBe('cita-nueva')

    const r2 = await executeSkill('create_cita' as any, { ...args, titulo: 'Cita E2E (2ª)', duracion: 60 } as any)
    expect(r2.yaExistia).toBe(true)
    expect(r2.cita.id).toBe('cita-1')
    expect(r2.cita.duracion).toBe(45) // conserva los datos originales
    expect(citaCreate).toHaveBeenCalledTimes(1)
  })

  it('volkern_create_catalogo_item: repetición con mismo SKU → yaExistia=true, mismo item y UN solo create', async () => {
    let creado = false
    const itemCreate = vi.fn(async ({ data }: any) => {
      creado = true
      return { id: 'item-nuevo', ...data }
    })
    h.overrides['catalogoItem.findUnique'] = vi.fn(async () => (creado ? h.FIXTURES.catalogoItem : null))
    h.overrides['catalogoItem.create'] = itemCreate

    const args = { tenantId: h.TENANT, userId: h.USER_ID, nombre: 'E2E Item', precioBase: 9.99, sku: 'SKU-E2E' }
    const r1 = await executeSkill('create_catalogo_item' as any, args as any)
    expect(r1.yaExistia).toBe(false)
    expect(r1.item.id).toBe('item-nuevo')

    const r2 = await executeSkill('create_catalogo_item' as any, { ...args, nombre: 'E2E Item (2ª)', precioBase: 999 } as any)
    expect(r2.yaExistia).toBe(true)
    expect(r2.item.id).toBe('item-1')
    expect(r2.item.precioBase).toBe(123.45) // conserva los datos originales
    expect(itemCreate).toHaveBeenCalledTimes(1)
  })

  it('volkern_create_orden_from_cotizacion: repetición → yaExistia=true, misma orden y UN solo create', async () => {
    let creada = false
    const ordenCreate = vi.fn(async ({ data }: any) => {
      creada = true
      return {
        id: 'ord-nueva', numero: 'OV-2026-0042', ...data,
        lead: { id: 'lead-1', nombre: 'Mock lead', email: 'lead@e2e.test' },
        cotizacion: { id: 'cot-1', numero: 'COT-2026-0001', titulo: 'Mock cotización' },
        items: [],
      }
    })
    // La lib comparte findFirst para idempotencia (where cotizacionId) y
    // numeración (where numero startsWith): se distinguen por el where.
    h.overrides['ordenVenta.findFirst'] = vi.fn(async (a: any) => {
      if (a?.where?.cotizacionId !== undefined) return creada ? h.FIXTURES.ordenVenta : null
      return { ...h.FIXTURES.ordenVenta, numero: 'OV-2026-0009' }
    })
    h.overrides['ordenVenta.create'] = ordenCreate

    const args = { tenantId: h.TENANT, userId: h.USER_ID, cotizacionId: 'cot-1' }
    const r1 = await executeSkill('create_orden_from_cotizacion' as any, args as any)
    expect(r1.yaExistia).toBe(false)
    expect(r1.orden.id).toBe('ord-nueva')
    expect(String(r1.orden.numero)).toMatch(/^OV-\d{4}-\d{4}$/) // numeración secuencial intacta

    const r2 = await executeSkill('create_orden_from_cotizacion' as any, args as any)
    expect(r2.yaExistia).toBe(true)
    expect(r2.orden.id).toBe('ord-1')
    expect(ordenCreate).toHaveBeenCalledTimes(1)
  })
})
