import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────────

const prismaMock = {
  cotizacion: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  perfilFiscalCliente: { findFirst: vi.fn() },
  contrato: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  contratoPago: { createMany: vi.fn() },
  dealActivity: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  // La ruta pasa por la puerta de contratos del CRM (getCrmEntitlements), que
  // lee plan y configuracion del tenant. Sin este mock la ruta reventaba con
  // «Cannot read properties of undefined (reading 'findUnique')» y devolvía 500.
  tenant: { findUnique: vi.fn() },
}

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'tenant-1' },
    user: { id: 'user-1' },
  }),
}))

vi.mock('@/lib/contratos/timeline', () => ({
  addContratoTimelineEvent: vi.fn().mockResolvedValue(undefined),
}))

const { POST } = await import('@/app/api/contratos/from-cotizacion/route')

const COTIZACION_BASE = {
  id: 'cot-1',
  tenantId: 'tenant-1',
  numero: 'COT-2026-0001',
  titulo: 'Servicios de consultoría',
  descripcion: null,
  estado: 'aceptada',
  subtotal: 1000,
  descuentoPorcentaje: 0,
  descuentoMonto: 0,
  impuestos: 210,
  total: 1210,
  moneda: 'EUR',
  terminosPago: 'Pago a 30 días',
  clausulas: 'PRIMERA. OBJETO. El prestador prestará los servicios a {{cliente.nombre}}.',
  notasInternas: null,
  notasCliente: null,
  clienteNombre: 'Ana López',
  clienteEmail: 'ana@example.com',
  clienteTelefono: null,
  clienteEmpresa: 'López Consulting',
  dealId: null,
  leadId: null,
  emisorId: null,
  items: [],
}

function req(body: unknown): Request {
  return new Request('http://localhost/api/contratos/from-cotizacion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/contratos/from-cotizacion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.cotizacion.findFirst.mockResolvedValue(COTIZACION_BASE)
    prismaMock.perfilFiscalCliente.findFirst.mockResolvedValue(null)
    prismaMock.contrato.findFirst.mockResolvedValue(null)
    prismaMock.contrato.create.mockResolvedValue({ id: 'cont-1' })
    // Nivel Profesional: es el primero que abre contratos, que es lo que estas
    // pruebas ejercitan (la puerta se cubre aparte en tests/crm-pricing).
    prismaMock.tenant.findUnique.mockResolvedValue({
      plan: 'crm_profesional',
      configuracion: { crmTier: 'profesional' },
    })
  })

  it('hereda las cláusulas de la cotización cuando el body no trae otras', async () => {
    const res = await POST(req({ cotizacionId: 'cot-1', tipo: 'servicio' }))

    expect(res.status).toBe(201)
    const arg = prismaMock.contrato.create.mock.calls[0][0]
    expect(arg.data.clausulas).toBe(COTIZACION_BASE.clausulas)
    // Las condiciones de pago también se heredan
    expect(arg.data.condicionesPago).toBe('Pago a 30 días')
  })

  it('usa las cláusulas del body si se envían (prioridad al body)', async () => {
    const res = await POST(
      req({ cotizacionId: 'cot-1', tipo: 'servicio', clausulas: 'CLÁUSULA PERSONALIZADA' })
    )

    expect(res.status).toBe(201)
    const arg = prismaMock.contrato.create.mock.calls[0][0]
    expect(arg.data.clausulas).toBe('CLÁUSULA PERSONALIZADA')
  })
})
