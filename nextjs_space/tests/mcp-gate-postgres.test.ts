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
const { claimApproval, enforceToolGate } = await import('@/lib/mcp/tool-gate')

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
