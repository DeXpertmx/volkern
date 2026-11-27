/**
 * Integración del gate contra PostgreSQL REAL.
 *
 * Los demás tests del gate simulan Prisma, y eso no demuestra lo único que de
 * verdad hay que demostrar aquí: que el `SELECT … FOR UPDATE` de
 * `claimApproval` serializa dos aprobaciones simultáneas. Un mock siempre dice
 * que sí. Postgres no.
 *
 * Se salta salvo que `MCP_GATE_POSTGRES=1` y `DATABASE_URL` apunten a una base
 * desechable con la migración `20261028120000_mcp_tool_capabilities` aplicada:
 *
 *   docker run -d --rm --name volkern-gate-pg -p 55432:5432 \
 *     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gate_test postgres:16-alpine
 *   PGPASSWORD=postgres psql -h localhost -p 55432 -U postgres -d gate_test \
 *     -f prisma/migrations/20261028120000_mcp_tool_capabilities/migration.sql
 *   MCP_GATE_POSTGRES=1 \
 *   DATABASE_URL='postgresql://postgres:postgres@localhost:55432/gate_test?schema=public' \
 *   npx vitest run tests/mcp-gate-postgres.test.ts
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const HABILITADO = process.env.MCP_GATE_POSTGRES === '1'
const TENANT = 'tenant-pg-gate'
const USER = 'user-pg-gate'

const { prisma } = await import('@/lib/db')
const { claimApproval, completeApproval, enforceToolGate, hashToolArguments } = await import(
  '@/lib/mcp/tool-gate'
)

describe.skipIf(!HABILITADO)('Gate MCP contra PostgreSQL real', () => {
  beforeEach(async () => {
    // `AuditLog` tiene FK a Tenant y a User: sin estas filas el gate no podría
    // auditar nada y el test estaría midiendo la ausencia de la tabla, no la
    // lógica.
    await prisma.tenant.upsert({
      where: { id: TENANT },
      update: {},
      create: { id: TENANT, nombre: 'PG Gate', slug: 'pg-gate' },
    })
    await prisma.user.upsert({
      where: { id: USER },
      update: {},
      create: { id: USER, email: 'gate@pg.test' },
    })
    await prisma.auditLog.deleteMany({ where: { tenantId: TENANT } })
    await prisma.mcpApprovalRequest.deleteMany({ where: { tenantId: TENANT } })
    await prisma.mcpToolCapability.deleteMany({ where: { tenantId: TENANT } })
  })

  afterAll(async () => {
    if (!HABILITADO) return
    await prisma.auditLog.deleteMany({ where: { tenantId: TENANT } })
    await prisma.mcpApprovalRequest.deleteMany({ where: { tenantId: TENANT } })
    await prisma.mcpToolCapability.deleteMany({ where: { tenantId: TENANT } })
  })

  it('dos aprobaciones SIMULTÁNEAS ejecutan una sola vez (bloqueo de fila)', async () => {
    const creada = await prisma.mcpApprovalRequest.create({
      data: {
        tenantId: TENANT,
        toolName: 'volkern_delete_contact',
        arguments: { id: 'contacto-1' },
        argumentsHash: 'hash-concurrencia',
        requestedById: 'user-solicita',
        roleName: 'Sales Agent',
        via: '/mcp',
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    // Dos responsables pulsando "aprobar" a la vez, en conexiones distintas.
    const [a, b] = await Promise.all([
      claimApproval({
        approvalId: creada.id,
        tenantId: TENANT,
        resolverId: 'user-aprueba-1',
        action: 'approve',
      }),
      claimApproval({
        approvalId: creada.id,
        tenantId: TENANT,
        resolverId: 'user-aprueba-2',
        action: 'approve',
      }),
    ])

    const estados = [a.status, b.status].sort()
    expect(estados).toEqual(['approved', 'conflict'])

    const fila = await prisma.mcpApprovalRequest.findUnique({ where: { id: creada.id } })
    expect(fila?.status).toBe('approved')
    // Un solo ganador: la auditoría no puede acabar atribuyendo la aprobación
    // al que llegó segundo.
    expect([fila?.resolvedById]).toEqual([
      a.status === 'approved' ? 'user-aprueba-1' : 'user-aprueba-2',
    ])
  })

  it('una solicitud ya resuelta no se vuelve a aprobar', async () => {
    const creada = await prisma.mcpApprovalRequest.create({
      data: {
        tenantId: TENANT,
        toolName: 'volkern_delete_contact',
        arguments: { id: 'contacto-2' },
        argumentsHash: 'hash-secuencial',
        requestedById: 'user-solicita',
        via: '/mcp',
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const primera = await claimApproval({
      approvalId: creada.id,
      tenantId: TENANT,
      resolverId: 'user-aprueba-1',
      action: 'approve',
    })
    const segunda = await claimApproval({
      approvalId: creada.id,
      tenantId: TENANT,
      resolverId: 'user-aprueba-2',
      action: 'approve',
    })

    expect(primera.status).toBe('approved')
    expect(segunda.status).toBe('conflict')
  })

  it('el índice parcial impide dos pendientes idénticas: el agente reintenta y no duplica', async () => {
    const args = { telefono: '+34600000000', mensaje: 'Hola', tenantId: TENANT, userId: USER }

    const uno = await enforceToolGate({
      tenantId: TENANT,
      userId: USER,
      roleName: 'Admin',
      toolName: 'volkern_send_whatsapp',
      args,
      via: '/mcp',
    })
    const dos = await enforceToolGate({
      tenantId: TENANT,
      userId: USER,
      roleName: 'Admin',
      toolName: 'volkern_send_whatsapp',
      args,
      via: '/mcp',
    })

    expect(uno.kind).toBe('ask')
    expect(dos.kind).toBe('ask')
    if (uno.kind !== 'ask' || dos.kind !== 'ask') throw new Error('esperaba ask')
    expect(dos.approvalId).toBe(uno.approvalId)

    const pendientes = await prisma.mcpApprovalRequest.count({
      where: { tenantId: TENANT, toolName: 'volkern_send_whatsapp', status: 'pending' },
    })
    expect(pendientes).toBe(1)
  })

  it('una fila de capacidad guardada en Postgres cambia la decisión de verdad', async () => {
    await prisma.mcpToolCapability.create({
      data: { tenantId: TENANT, toolName: 'volkern_list_contacts', roleName: null, decision: 'deny' },
    })

    const out = await enforceToolGate({
      tenantId: TENANT,
      userId: USER,
      roleName: 'Admin',
      toolName: 'volkern_list_contacts',
      args: {},
      via: '/mcp',
    })

    expect(out.kind).toBe('deny')
  })

  it('la auditoría del gate queda escrita en AuditLog', async () => {
    await enforceToolGate({
      tenantId: TENANT,
      userId: USER,
      roleName: 'Sales Agent',
      toolName: 'volkern_delete_contact',
      args: { id: 'contacto-3' },
      via: '/mcp',
    })

    const registros = await prisma.auditLog.findMany({
      where: { tenantId: TENANT, accion: 'MCP_tool_denied' },
    })
    expect(registros.length).toBe(1)
    expect(registros[0].entidadId).toBe('volkern_delete_contact')
  })

  it('dos solicitudes idénticas de usuarios distintos no ejecutan dos veces', async () => {
    const crear = (requestedById: string) =>
      prisma.mcpApprovalRequest.create({
        data: {
          tenantId: TENANT,
          toolName: 'volkern_send_whatsapp',
          arguments: { leadId: 'lead-1', mensaje: 'Mismo mensaje' },
          argumentsHash: 'hash-doble-envio',
          requestedById,
          via: '/mcp',
          expiresAt: new Date(Date.now() + 60_000),
        },
      })

    // Dos personas piden lo mismo: la reserva por contenido es por usuario, así
    // que hay dos filas. El aislamiento no puede acabar en dos envíos.
    const [deAna, deLuis] = await Promise.all([crear('user-ana'), crear('user-luis')])

    const [ana, luis] = await Promise.all([
      claimApproval({
        approvalId: deAna.id,
        tenantId: TENANT,
        resolverId: 'user-resuelve-1',
        action: 'approve',
      }),
      claimApproval({
        approvalId: deLuis.id,
        tenantId: TENANT,
        resolverId: 'user-resuelve-2',
        action: 'approve',
      }),
    ])

    const aprobadas = [ana.status, luis.status].filter((s) => s === 'approved')
    expect(aprobadas).toHaveLength(1)
    expect([ana.status, luis.status]).toContain('duplicate')
  })

  it('una aprobación posterior a la ejecución idéntica no vuelve a ejecutar', async () => {
    const crear = (requestedById: string) =>
      prisma.mcpApprovalRequest.create({
        data: {
          tenantId: TENANT,
          toolName: 'volkern_send_whatsapp',
          arguments: { leadId: 'lead-1', mensaje: 'Mismo texto' },
          argumentsHash: 'hash-ya-ejecutada',
          requestedById,
          via: '/mcp',
          expiresAt: new Date(Date.now() + 60_000),
        },
      })

    const [primera, segunda] = await Promise.all([crear('user-ana'), crear('user-luis')])

    const resPrimera = await claimApproval({
      approvalId: primera.id,
      tenantId: TENANT,
      resolverId: 'user-resuelve-1',
      action: 'approve',
    })
    expect(resPrimera.status).toBe('approved')

    // La primera ya se ejecutó; la segunda no puede repetir el envío dentro de
    // la ventana aunque la primera ya no esté en curso.
    await completeApproval({ approvalId: primera.id, ok: true, result: { ok: true } })

    const resSegunda = await claimApproval({
      approvalId: segunda.id,
      tenantId: TENANT,
      resolverId: 'user-resuelve-2',
      action: 'approve',
    })

    expect(resSegunda.status).toBe('duplicate')
  })

  it('permite reenviar el mismo contenido cuando la ejecución anterior salió de la ventana', async () => {
    await prisma.mcpApprovalRequest.create({
      data: {
        tenantId: TENANT,
        toolName: 'volkern_send_whatsapp',
        arguments: { leadId: 'lead-1', mensaje: 'Mismo texto' },
        argumentsHash: 'hash-ventana-vieja',
        requestedById: 'user-ana',
        via: '/mcp',
        status: 'executed',
        resolvedAt: new Date(Date.now() - 10 * 60_000),
        executedAt: new Date(Date.now() - 6 * 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    const nueva = await prisma.mcpApprovalRequest.create({
      data: {
        tenantId: TENANT,
        toolName: 'volkern_send_whatsapp',
        arguments: { leadId: 'lead-1', mensaje: 'Mismo texto' },
        argumentsHash: 'hash-ventana-vieja',
        requestedById: 'user-luis',
        via: '/mcp',
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const res = await claimApproval({
      approvalId: nueva.id,
      tenantId: TENANT,
      resolverId: 'user-resuelve-1',
      action: 'approve',
    })

    expect(res.status).toBe('approved')
  })

  it('otro operationId ejecuta la misma acción después de completar la anterior', async () => {
    const args = { id: 'c-1' }

    // La primera operación ya se ejecutó: su operationId está cerrado.
    await prisma.mcpApprovalRequest.create({
      data: {
        tenantId: TENANT,
        toolName: 'volkern_delete_contact',
        arguments: { ...args, operationId: 'op-1' },
        argumentsHash: hashToolArguments({ ...args, operationId: 'op-1' }),
        operationId: 'op-1',
        requestedById: USER,
        via: '/mcp',
        status: 'executed',
        executedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const nueva = await enforceToolGate({
      tenantId: TENANT,
      userId: USER,
      roleName: 'Admin',
      toolName: 'volkern_delete_contact',
      args: { ...args, operationId: 'op-2' },
      via: '/mcp',
    })

    if (nueva.kind !== 'ask') throw new Error(`esperaba ask, recibí ${nueva.kind}`)

    const res = await claimApproval({
      approvalId: nueva.approvalId,
      tenantId: TENANT,
      resolverId: 'user-aprueba',
      action: 'approve',
    })

    // La huella incluye el operationId: no es la misma operación y no debe
    // bloquearse como duplicada.
    expect(res.status).toBe('approved')
  })

  it('el cerrojo de ejecución no cruza empresas', async () => {
    const OTRA = 'tenant-pg-gate-b'
    await prisma.tenant.upsert({
      where: { id: OTRA },
      update: {},
      create: { id: OTRA, nombre: 'PG Gate B', slug: 'pg-gate-b' },
    })

    const crear = (tenantId: string) =>
      prisma.mcpApprovalRequest.create({
        data: {
          tenantId,
          toolName: 'volkern_send_whatsapp',
          arguments: { leadId: 'lead-1', mensaje: 'Mismo texto' },
          argumentsHash: 'hash-entre-empresas',
          requestedById: 'user-solicita',
          via: '/mcp',
          expiresAt: new Date(Date.now() + 60_000),
        },
      })

    try {
      const [enA, enB] = await Promise.all([crear(TENANT), crear(OTRA)])

      const resA = await claimApproval({
        approvalId: enA.id,
        tenantId: TENANT,
        resolverId: 'user-resuelve-1',
        action: 'approve',
      })
      const resB = await claimApproval({
        approvalId: enB.id,
        tenantId: OTRA,
        resolverId: 'user-resuelve-2',
        action: 'approve',
      })

      expect(resA.status).toBe('approved')
      expect(resB.status).toBe('approved')
    } finally {
      await prisma.mcpApprovalRequest.deleteMany({ where: { tenantId: OTRA } })
      await prisma.tenant.delete({ where: { id: OTRA } }).catch(() => undefined)
    }
  })

  it('sin empresa en la credencial la auditoría se guarda con tenantId null (la FK no la traga)', async () => {
    const out = await enforceToolGate({
      tenantId: undefined,
      userId: undefined,
      roleName: 'Admin',
      toolName: 'volkern_list_contacts',
      args: {},
      via: '/mcp',
    })

    expect(out.kind).toBe('deny')

    const registro = await prisma.auditLog.findFirst({
      where: { tenantId: null, accion: 'MCP_tool_denied' },
      orderBy: { fechaCreacion: 'desc' },
    })
    expect(registro).not.toBeNull()
    expect(registro?.entidadId).toBe('volkern_list_contacts')
  })
})
