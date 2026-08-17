import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    contratoTemplate: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
// Mock de withTenantAuth: wrapper transparente que ejecuta el handler con auth del tenant
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (req: Request, ctx?: any) =>
    handler(req, { tenant: { id: 'tenant-1' }, valid: true }, ctx),
}))

const { GET, POST } = await import('@/app/api/contratos/plantillas/route')
const { PATCH, DELETE } = await import('@/app/api/contratos/plantillas/[id]/route')

function req(method: string, body?: unknown, params?: { params: { id: string } }) {
  return new Request('http://localhost/api/contratos/plantillas', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('Plantillas de contrato', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.contratoTemplate.count.mockResolvedValue(1)
    prismaMock.contratoTemplate.createMany.mockResolvedValue({ count: 2 })
  })

  it('lista las plantillas del tenant', async () => {
    prismaMock.contratoTemplate.findMany.mockResolvedValue([
      { id: 't-1', nombre: 'Contrato de servicios', tipo: 'servicio', esPorDefecto: true },
      { id: 't-2', nombre: 'NDA', tipo: 'confidencialidad', esPorDefecto: false },
    ])

    const res = await GET(req('GET'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.plantillas).toHaveLength(2)
    expect(prismaMock.contratoTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1' }) }),
    )
  })

  it('siembra las plantillas por defecto en la primera visita', async () => {
    prismaMock.contratoTemplate.count.mockResolvedValue(0)
    prismaMock.contratoTemplate.findMany.mockResolvedValue([])

    const res = await GET(req('GET'))

    expect(res.status).toBe(200)
    expect(prismaMock.contratoTemplate.createMany).toHaveBeenCalledTimes(1)
    const arg = prismaMock.contratoTemplate.createMany.mock.calls[0][0]
    expect(arg.data).toHaveLength(2)
    expect(arg.data[0].tipo).toBe('servicio')
    expect(arg.data[1].tipo).toBe('confidencialidad')
    expect(arg.data[0].clausulas).toContain('PRIMERA')
    expect(arg.data[1].clausulas).toContain('INFORMACIÓN CONFIDENCIAL')
    // Las plantillas por defecto incluyen placeholders dinámicos
    expect(arg.data[0].clausulas).toContain('{{cliente.nombre}}')
    expect(arg.data[0].clausulas).toContain('{{fecha.inicio}}')
    expect(arg.data[0].clausulas).toContain('{{empresa.nombre}}')
    expect(arg.data[1].clausulas).toContain('{{empresa.nombre}}')
  })

  it('no siembra por defecto si el tenant ya tiene plantillas', async () => {
    await GET(req('GET'))
    expect(prismaMock.contratoTemplate.createMany).not.toHaveBeenCalled()
  })

  it('crea una plantilla nueva', async () => {
    prismaMock.contratoTemplate.create.mockResolvedValue({
      id: 't-3',
      tenantId: 'tenant-1',
      nombre: 'Contrato de mantenimiento',
      tipo: 'servicio',
    })

    const res = await POST(req('POST', { nombre: 'Contrato de mantenimiento', tipo: 'servicio' }))

    expect(res.status).toBe(201)
    expect(prismaMock.contratoTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', nombre: 'Contrato de mantenimiento' }) }),
    )
  })

  it('rechaza crear sin nombre', async () => {
    const res = await POST(req('POST', { nombre: '  ' }))
    expect(res.status).toBe(400)
    expect(prismaMock.contratoTemplate.create).not.toHaveBeenCalled()
  })

  it('actualiza una plantilla existente', async () => {
    prismaMock.contratoTemplate.findFirst.mockResolvedValue({ id: 't-1', tenantId: 'tenant-1' })
    prismaMock.contratoTemplate.update.mockResolvedValue({ id: 't-1', nombre: 'NDA actualizado' })

    const res = await PATCH(req('PATCH', { nombre: 'NDA actualizado' }), { params: { id: 't-1' } })

    expect(res.status).toBe(200)
    expect(prismaMock.contratoTemplate.update).toHaveBeenCalledWith({ where: { id: 't-1' }, data: expect.objectContaining({ nombre: 'NDA actualizado' }) })
  })

  it('no permite actualizar una plantilla de otro tenant', async () => {
    prismaMock.contratoTemplate.findFirst.mockResolvedValue(null)

    const res = await PATCH(req('PATCH', { nombre: 'X' }), { params: { id: 't-99' } })

    expect(res.status).toBe(404)
    expect(prismaMock.contratoTemplate.update).not.toHaveBeenCalled()
  })

  it('elimina una plantilla del tenant', async () => {
    prismaMock.contratoTemplate.findFirst.mockResolvedValue({ id: 't-1', tenantId: 'tenant-1' })
    prismaMock.contratoTemplate.delete.mockResolvedValue({ id: 't-1' })

    const res = await DELETE(req('DELETE'), { params: { id: 't-1' } })

    expect(res.status).toBe(200)
    expect(prismaMock.contratoTemplate.delete).toHaveBeenCalledWith({ where: { id: 't-1' } })
  })
})
