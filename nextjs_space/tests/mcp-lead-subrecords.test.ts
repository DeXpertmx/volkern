// @vitest-environment node
/**
 * Tareas, notas y etiquetas creadas desde el MCP.
 *
 * Cubre los tres fallos que se veían desde un cliente MCP:
 *   1. `/mcp` rechazaba los nombres legacy sin prefijo (`create_task`,
 *      `create_note`, `update_lead`) con -32602 «Tool desconocida», aunque
 *      `/api/mcp` y su documentación los publican. Misma operación, distinto
 *      resultado según la superficie.
 *   2. `volkern_update_lead` / `volkern_create_lead` aceptaban `etiquetas`
 *      (array) y el executor las tiraba: el lead se guardaba sin etiquetas y
 *      la tool respondía éxito.
 *   3. `volkern_create_task.asignadoA` y `volkern_create_note.titulo` se
 *      perdían por no coincidir con los nombres internos del wrapper.
 *
 * El camino es el real: `POST /mcp` (tools/call) → `handleCallTool` →
 * `executeSkill` → skill, con Prisma y la autenticación mockeados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const TENANT = 'tenant-mcp'
  const USER_ID = 'user-mcp'

  const capturado = {
    leadCreate: [] as any[],
    leadUpdate: [] as any[],
    taskCreate: [] as any[],
    noteCreate: [] as any[],
  }

  const lead = {
    id: 'lead-1',
    tenantId: TENANT,
    nombre: 'Ana Torres',
    email: 'ana@mcp.test',
    tags: 'cliente',
  }

  const prisma = {
    user: {
      // resolveRealUserId y la validación de asignadoA
      findFirst: async (a: any) => (a?.where?.id ? { id: a.where.id } : null),
      findUnique: async () => ({ id: USER_ID, email: 'admin@mcp.test', role: { nombre: 'OWNER' } }),
    },
    lead: {
      findFirst: async (a: any) => {
        const where = a?.where ?? {}
        if (where.id && where.id !== lead.id) return null
        if (where.email && where.email !== lead.email) return null
        if (where.nombre) return null
        return lead
      },
      create: async (a: any) => {
        capturado.leadCreate.push(a.data)
        return { id: 'lead-nuevo', ...a.data }
      },
      update: async (a: any) => {
        capturado.leadUpdate.push(a.data)
        return { ...lead, ...a.data }
      },
      count: async () => 1,
    },
    task: {
      create: async (a: any) => {
        capturado.taskCreate.push(a.data)
        return { id: 'task-nuevo', ...a.data }
      },
      findMany: async () => [],
    },
    note: {
      create: async (a: any) => {
        capturado.noteCreate.push(a.data)
        return { id: 'note-nueva', ...a.data }
      },
      findMany: async () => [],
    },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
  }

  return { TENANT, USER_ID, lead, capturado, prisma }
})

vi.mock('@/lib/db', () => ({
  prisma: h.prisma,
  globalPrisma: h.prisma,
  default: h.prisma,
  dbContext: { run: (_s: unknown, fn: () => unknown) => fn(), getStore: () => undefined },
  getTenantDb: async () => h.prisma,
  runWithTenant: async (_t: string, fn: () => unknown) => fn(),
  setCurrentTenantId: () => {},
  getCurrentTenantId: () => null,
  clearCurrentTenantId: () => {},
}))

vi.mock('@/lib/api-key-auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  authenticateRequest: vi.fn(async () => ({
    valid: true,
    tenant: { id: h.TENANT },
    user: { id: h.USER_ID },
    apiKey: null,
  })),
}))

vi.mock('@/lib/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true, messageId: 'mock' })),
}))

vi.mock('@/lib/compliance-gate', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ComplianceGate: { check: vi.fn(async () => ({ allowed: true })) },
}))

async function llamarTool(name: string, args: Record<string, unknown>) {
  const { POST } = await import('@/app/mcp/route')
  const res = await POST(
    new Request('https://volkern.app/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
  )
  const body = await res.json()
  let payload: any = null
  const texto = body?.result?.content?.[0]?.text
  if (texto) {
    try {
      payload = JSON.parse(texto)
    } catch {
      payload = texto
    }
  }
  return { status: res.status, body, payload }
}

const FECHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  h.capturado.leadCreate.length = 0
  h.capturado.leadUpdate.length = 0
  h.capturado.taskCreate.length = 0
  h.capturado.noteCreate.length = 0
})

describe('/mcp acepta los nombres legacy del catálogo', () => {
  it('create_task (sin prefijo) crea la tarea en el lead', async () => {
    const { status, body, payload } = await llamarTool('create_task', {
      leadId: 'lead-1',
      tipo: 'llamada',
      titulo: 'Llamar a Ana',
      fechaVencimiento: FECHA,
      asignadoA: 'user-comercial',
    })

    expect(status).toBe(200)
    expect(body.result.isError, JSON.stringify(payload)).toBeFalsy()
    expect(h.capturado.taskCreate).toHaveLength(1)
    expect(h.capturado.taskCreate[0]).toMatchObject({
      tenantId: h.TENANT,
      leadId: 'lead-1',
      titulo: 'Llamar a Ana',
      tipo: 'llamada',
      asignadoA: 'user-comercial',
      completada: false,
    })
  })

  it('volkern_create_task (con prefijo) sigue funcionando', async () => {
    const { body, payload } = await llamarTool('volkern_create_task', {
      leadId: 'lead-1',
      tipo: 'email',
      titulo: 'Enviar propuesta',
      fechaVencimiento: FECHA,
    })

    expect(body.result.isError, JSON.stringify(payload)).toBeFalsy()
    expect(h.capturado.taskCreate[0]).toMatchObject({ leadId: 'lead-1', titulo: 'Enviar propuesta' })
  })

  it('create_note (sin prefijo) guarda la nota con su título', async () => {
    const { body, payload } = await llamarTool('create_note', {
      leadId: 'lead-1',
      titulo: 'Presupuesto',
      contenido: 'Pidió el desglose por unidades.',
    })

    expect(body.result.isError, JSON.stringify(payload)).toBeFalsy()
    expect(h.capturado.noteCreate).toHaveLength(1)
    expect(h.capturado.noteCreate[0]).toMatchObject({
      leadId: 'lead-1',
      contenido: '**Presupuesto**\n\nPidió el desglose por unidades.',
    })
  })

  it('update_lead (sin prefijo) añade etiquetas', async () => {
    const { body, payload } = await llamarTool('update_lead', {
      leadId: 'lead-1',
      etiquetas: ['VIP'],
    })

    expect(body.result.isError, JSON.stringify(payload)).toBeFalsy()
    expect(h.capturado.leadUpdate[0]).toMatchObject({ tags: 'cliente,VIP' })
  })

  it('una tool que no existe sigue siendo -32602', async () => {
    const { status, body } = await llamarTool('volkern_no_existe', {})
    expect(status).toBe(400)
    expect(body.error.code).toBe(-32602)
  })
})

describe('etiquetas del catálogo → tags del CRM', () => {
  it('update_lead fusiona sin borrar las existentes ni duplicar', async () => {
    const { body, payload } = await llamarTool('volkern_update_lead', {
      leadId: 'lead-1',
      etiquetas: ['VIP', 'vip', 'mayorista', 'cliente'],
    })

    expect(body.result.isError, JSON.stringify(payload)).toBeFalsy()
    expect(h.capturado.leadUpdate[0].tags).toBe('cliente,VIP,mayorista')
  })

  it('update_lead sin etiquetas no toca las que ya había', async () => {
    await llamarTool('volkern_update_lead', { leadId: 'lead-1', telefono: '+34600000000' })
    expect(h.capturado.leadUpdate[0].tags).toBeUndefined()
  })

  it('create_lead guarda las etiquetas del alta', async () => {
    const { body, payload } = await llamarTool('volkern_create_lead', {
      nombre: 'Luis Prado',
      email: 'luis@mcp.test',
      etiquetas: ['mayorista', 'feria'],
    })

    expect(body.result.isError, JSON.stringify(payload)).toBeFalsy()
    expect(h.capturado.leadCreate[0]).toMatchObject({ tags: 'mayorista,feria' })
  })

  it('create_lead sin etiquetas no inventa tags', async () => {
    await llamarTool('volkern_create_lead', { nombre: 'Sin Tags', email: 'sintags@mcp.test' })
    expect(h.capturado.leadCreate[0].tags).toBeUndefined()
  })
})
