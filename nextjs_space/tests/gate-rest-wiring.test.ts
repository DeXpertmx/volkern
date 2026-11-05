/**
 * Cableado del gate REST.
 *
 * `tests/gate-rest-cobertura.test.ts` prueba la tabla y la decisión puras. Esto
 * prueba que la decisión **está conectada donde importa**: en la validación de
 * la credencial, que es el único punto por el que pasan las 291 rutas
 * alcanzables con API key. Sin esto, la tabla podría ser correcta y no estar
 * aplicándose — el fallo más caro de todos, porque no se nota.
 *
 * Tres cosas se afirman aquí:
 *   1. Una operación `destructive` sale con 403 y con la capacidad en el cuerpo.
 *   2. El 403 llega al cliente a través de `withTenantAuth` tal cual.
 *   3. El orden es el prometido: primero scopes (401), después gate (403), para
 *      que un permiso insuficiente no se disfrace de operación irreversible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prisma = vi.hoisted(() => ({
  apiKey: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
  tenant: { findUnique: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  prisma,
  dbContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
  getTenantDb: async () => ({ client: {}, vaultSeed: undefined }),
}))

import { validateApiKey, withTenantAuth } from '@/lib/api-key-auth'

const CLAVE = `vk_live_${'a'.repeat(64)}`

const TENANT = {
  id: 't1',
  nombre: 'Hotel Prueba',
  slug: 'hotel-prueba',
  subdomain: 'hotel-prueba',
  plan: 'pro',
  accountType: 'DIRECT',
  parentId: null,
  moneda: 'MXN',
}

const USUARIO = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@ejemplo.mx',
  tenantId: 't1',
  roleId: 'r1',
  contactId: null,
  role: { id: 'r1', nombre: 'Admin', permisos: null },
}

function request(method: string, path: string) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'x-api-key': CLAVE },
  })
}

function claveCon(scopes: string[]) {
  prisma.apiKey.findUnique.mockResolvedValue({
    id: 'k1',
    nombre: 'Integración web',
    scopes,
    activo: true,
    expiraEn: null,
    tenant: TENANT,
    user: USUARIO,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.apiKey.update.mockResolvedValue({})
  prisma.auditLog.create.mockResolvedValue({})
})

describe('Gate REST en la validación de la credencial', () => {
  it('deniega un borrado irreversible con 403 y capacidad', async () => {
    claveCon(['contacts:write', 'contacts:delete'])

    const auth = await validateApiKey(request('DELETE', '/api/contacts/abc123'), ['contacts:delete'])

    expect(auth.valid).toBe(false)
    expect(auth.status).toBe(403)
    expect(auth.capability).toBe('contacts.delete')
    expect(auth.risk).toBe('destructive')
    expect(auth.error).toContain('irreversible')
  })

  it('deja pasar la misma ruta con GET: el gate no toca lecturas', async () => {
    claveCon(['contacts:read'])

    const auth = await validateApiKey(request('GET', '/api/contacts/abc123'), ['contacts:read'])

    expect(auth.valid).toBe(true)
    expect(auth.status).toBeUndefined()
    expect(auth.tenant?.id).toBe('t1')
  })

  it('deja pasar una escritura reversible en la misma colección', async () => {
    claveCon(['contacts:write'])

    const auth = await validateApiKey(request('PUT', '/api/contacts/abc123'), ['contacts:write'])

    expect(auth.valid).toBe(true)
  })

  it('audita el intento en AuditLog, con clave y capacidad', async () => {
    claveCon(['leads:delete'])

    await validateApiKey(request('DELETE', '/api/leads/l1'), ['leads:delete'])

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const data = prisma.auditLog.create.mock.calls[0][0].data
    expect(data.accion).toBe('REST_action_denied')
    expect(data.tenantId).toBe('t1')
    expect(data.userId).toBe('u1')
    expect(data.entidadId).toBe('leads.delete')
    expect(data.metadata).toMatchObject({
      method: 'DELETE',
      path: '/api/leads/l1',
      capability: 'leads.delete',
      risk: 'destructive',
      apiKeyId: 'k1',
      authMethod: 'apikey',
    })
  })

  it('si el scope falta, gana el 401 y no se audita como gate', async () => {
    claveCon(['contacts:read'])

    const auth = await validateApiKey(request('DELETE', '/api/contacts/abc123'), ['contacts:delete'])

    expect(auth.valid).toBe(false)
    // Sin `status`, el llamador responde 401: es una credencial que no sirve
    // para esto, no una operación prohibida por diseño.
    expect(auth.status).toBeUndefined()
    expect(auth.error).toContain('Permisos insuficientes')
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('una ruta no clasificada no cambia de comportamiento', async () => {
    claveCon(['leads:write'])

    const auth = await validateApiKey(request('POST', '/api/leads'), ['leads:write'])

    expect(auth.valid).toBe(true)
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('withTenantAuth propaga el 403 y el cuerpo que espera el integrador', async () => {
    claveCon(['campaigns:write'])
    const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true })))

    const POST = withTenantAuth(handler as never, ['campaigns:write'])
    const res = await POST(request('POST', '/api/campanas/c1/ejecutar'))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.capability).toBe('campaigns.execute')
    expect(body.risk).toBe('external')
    expect(body.error).toContain('irreversible')
    // Lo importante: el handler no llegó a ejecutarse.
    expect(handler).not.toHaveBeenCalled()
  })

  it('withTenantAuth sigue respondiendo 401 cuando la credencial no sirve', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null)
    const handler = vi.fn(async () => new Response('{}'))

    const GET = withTenantAuth(handler as never)
    const res = await GET(request('GET', '/api/leads'))

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })
})
