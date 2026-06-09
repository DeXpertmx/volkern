import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockDbShipment = {
  id: 'shp-test-001',
  batchNumber: 'SHP-TEST-001',
  status: 'SHIPPED',
  carrier: 'SEUR',
  trackingNumber: 'SEUR-12345',
  originLat: 36.7213,
  originLng: -4.4214,
  destinationLat: 40.4168,
  destinationLng: -3.7038,
  currentLat: null,
  currentLng: null,
  lastGpsUpdate: null,
  dispatchedAt: new Date('2026-06-03T08:00:00Z'),
  deliveredAt: null,
  receiverName: null,
  routeWaypoints: null,
  tenantId: 'test-tenant-id',
}

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    erp_shipments: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mock withTenantAuth para evitar autenticación real
vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test', slug: 'test', plan: 'pro' },
        user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
      }
      return handler(request, mockAuth)
    }
  }
  return { withTenantAuth: mockWithTenantAuth }
})

// ─── Imports ───────────────────────────────────────────────────────────────

import { POST } from '@/app/api/erp/logistics/gps/poll/route'
import { prisma } from '@/lib/db'

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(body: unknown): Request {
  return new Request('https://volkern.app/api/erp/logistics/gps/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockMalformedRequest(): Request {
  return new Request('https://volkern.app/api/erp/logistics/gps/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ broken json',
  })
}

function setupShipment(overrides: Record<string, any> = {}) {
  const shipment = { ...mockDbShipment, ...overrides }
  ;(prisma as any).erp_shipments.findUnique.mockResolvedValue(shipment)
  ;(prisma as any).erp_shipments.update.mockResolvedValue(shipment)
  return shipment
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/erp/logistics/gps/poll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Validación de campos obligatorios ────────────────────────────────

  it('debe devolver 400 si falta shipmentId', async () => {
    const res = await POST(mockRequest({ latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Campo obligatorio: shipmentId')
    expect((prisma as any).erp_shipments.update).not.toHaveBeenCalled()
  })

  it('debe devolver 400 si falta latitude', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', longitude: -3.5 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Campos obligatorios: latitude, longitude')
  })

  it('debe devolver 400 si falta longitude', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: 38.0 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Campos obligatorios: latitude, longitude')
  })

  it('debe devolver 400 si latitude no es número', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: '38.0', longitude: -3.5 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude y longitude deben ser números')
  })

  it('debe devolver 400 si longitude no es número', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: 38.0, longitude: '-3.5' }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude y longitude deben ser números')
  })

  // ── Validación de rangos geográficos ─────────────────────────────────

  it('debe devolver 400 si latitude es menor a -90', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: -91, longitude: 0 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude debe estar entre -90 y 90')
  })

  it('debe devolver 400 si latitude es mayor a 90', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: 91, longitude: 0 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude debe estar entre -90 y 90')
  })

  it('debe devolver 400 si longitude es menor a -180', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: 0, longitude: -181 }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('longitude debe estar entre -180 y 180')
  })

  it('debe devolver 400 si longitude es mayor a 180', async () => {
    const res = await POST(mockRequest({ shipmentId: 'shp-001', latitude: 0, longitude: 181 }), undefined)

    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBe('longitude debe estar entre -180 y 180')
  })

  it('debe aceptar latitude = -90 exacto (Polo Sur)', async () => {
    setupShipment({ destinationLat: -90, destinationLng: 0 })
    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: -90, longitude: 0 }), undefined)
    expect(res.status).toBe(200)
  })

  it('debe aceptar longitude = 180 exacto', async () => {
    setupShipment({ destinationLat: 0, destinationLng: 180 })
    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: 0, longitude: 180 }), undefined)
    expect(res.status).toBe(200)
  })

  // ── Envío no encontrado o no pertenece al tenant ─────────────────────

  it('debe devolver 404 si el envío no existe', async () => {
    ;(prisma as any).erp_shipments.findUnique.mockResolvedValue(null)

    const res = await POST(mockRequest({ shipmentId: 'no-existe', latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Envío no encontrado')
  })

  it('debe devolver 403 si el envío pertenece a otro tenant', async () => {
    setupShipment({ tenantId: 'other-tenant-id' })

    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toBe('El envío no pertenece a este tenant')
  })

  // ── Estados del envío (no actualizan posición) ───────────────────────

  it('debe devolver warning si el envío ya fue DELIVERED y no actualizar BD', async () => {
    setupShipment({ status: 'DELIVERED', deliveredAt: new Date() })

    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.acknowledged).toBe(true)
    expect(data.warning).toContain('ya fue entregado')
    expect(data.status).toBe('DELIVERED')
    expect((prisma as any).erp_shipments.update).not.toHaveBeenCalled()
  })

  it('debe devolver warning si el envío está CANCELLED y no actualizar BD', async () => {
    setupShipment({ status: 'CANCELLED' })

    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.acknowledged).toBe(true)
    expect(data.warning).toContain('cancelado')
    expect(data.status).toBe('CANCELLED')
    expect((prisma as any).erp_shipments.update).not.toHaveBeenCalled()
  })

  it('debe devolver warning si el envío no ha sido despachado (PENDING)', async () => {
    setupShipment({ status: 'PENDING', dispatchedAt: null })

    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.acknowledged).toBe(true)
    expect(data.warning).toContain('no ha sido despachado')
    expect(data.status).toBe('PENDING')
    expect((prisma as any).erp_shipments.update).not.toHaveBeenCalled()
  })

  it('debe devolver warning si el envío está PREPARING sin dispatchedAt', async () => {
    setupShipment({ status: 'PREPARING', dispatchedAt: null })

    const res = await POST(mockRequest({ shipmentId: 'shp-test-001', latitude: 38.0, longitude: -3.5 }), undefined)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.acknowledged).toBe(true)
    expect(data.warning).toContain('no ha sido despachado')
    expect(data.status).toBe('PREPARING')
    expect((prisma as any).erp_shipments.update).not.toHaveBeenCalled()
  })

  // ── Validación de timestamp ──────────────────────────────────────────

  it('debe devolver 400 si el timestamp es inválido', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.0,
      longitude: -3.5,
      timestamp: 'no-es-una-fecha',
    }), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('timestamp inválido')
  })

  // ── Poll exitoso (caso básico) ───────────────────────────────────────

  it('debe actualizar currentLat, currentLng y lastGpsUpdate en BD', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
    }), undefined)

    expect(res.status).toBe(200)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        currentLat: 38.1234,
        currentLng: -3.5678,
        lastGpsUpdate: expect.any(Date),
      }),
    })
  })

  it('debe devolver acknowledged=true en respuesta exitosa', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
    }), undefined)

    const data = await res.json()
    expect(data.acknowledged).toBe(true)
    expect(data.shipmentId).toBe('shp-test-001')
    expect(data.batchNumber).toBe('SHP-TEST-001')
    expect(data.newPosition).toEqual([38.1234, -3.5678])
  })

  it('debe incluir previousPosition como null si no había posición previa', async () => {
    setupShipment({ currentLat: null, currentLng: null })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
    }), undefined)

    const data = await res.json()
    expect(data.previousPosition).toBeNull()
  })

  it('debe incluir previousPosition con la posición anterior', async () => {
    setupShipment({ currentLat: 37.5, currentLng: -4.0 })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
    }), undefined)

    const data = await res.json()
    expect(data.previousPosition).toEqual([37.5, -4.0])
  })

  // ── Progress y distance ──────────────────────────────────────────────

  it('debe calcular progress entre 0 y 1', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.5,  // ~200km desde Málaga hacia Madrid (ruta ~414km)
      longitude: -4.0,
    }), undefined)

    const data = await res.json()
    expect(data.progress).toBeGreaterThan(0)
    expect(data.progress).toBeLessThan(1)
  })

  it('debe devolver progress=0 en el origen', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 36.7213,  // Málaga (origen exacto)
      longitude: -4.4214,
    }), undefined)

    const data = await res.json()
    expect(data.progress).toBe(0)
    expect(data.distance.fromOriginKm).toBe(0)
  })

  it('debe devolver distance.fromOriginKm y distance.toDestinationKm', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.5,
      longitude: -4.0,
    }), undefined)

    const data = await res.json()
    expect(data.distance.fromOriginKm).toBeGreaterThan(0)
    expect(data.distance.toDestinationKm).toBeGreaterThan(0)
    expect(data.distance.totalKm).toBeGreaterThan(0)
  })

  it('debe devolver progress=null si faltan coordenadas de origen o destino', async () => {
    setupShipment({ originLat: null, originLng: null })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.5,
      longitude: -4.0,
    }), undefined)

    const data = await res.json()
    expect(data.progress).toBeNull()
    expect(data.distance.fromOriginKm).toBeNull()
  })

  // ── Campos opcionales en la respuesta ────────────────────────────────

  it('debe incluir speed, heading y deviceId en la respuesta', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
      speed: 65.5,
      heading: 180,
      deviceId: 'gps-tracker-01',
    }), undefined)

    const data = await res.json()
    expect(data.speed).toBe(65.5)
    expect(data.heading).toBe(180)
    expect(data.deviceId).toBe('gps-tracker-01')
  })

  it('debe devolver null para speed, heading, deviceId si no se enviaron', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
    }), undefined)

    const data = await res.json()
    expect(data.speed).toBeNull()
    expect(data.heading).toBeNull()
    expect(data.deviceId).toBeNull()
  })

  it('debe usar el timestamp proporcionado', async () => {
    setupShipment()

    const ts = '2026-06-03T15:30:00.000Z'
    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
      timestamp: ts,
    }), undefined)

    const data = await res.json()
    expect(data.timestamp).toBe(ts)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        lastGpsUpdate: new Date(ts),
      }),
    })
  })

  // ── addWaypoint ──────────────────────────────────────────────────────

  it('debe añadir waypoint a routeWaypoints si addWaypoint=true', async () => {
    setupShipment({ routeWaypoints: null })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
      speed: 65,
      heading: 180,
      addWaypoint: true,
    }), undefined)

    expect(res.status).toBe(200)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        routeWaypoints: [
          expect.objectContaining({
            lat: 38.1234,
            lng: -3.5678,
            speed: 65,
            heading: 180,
            timestamp: expect.any(String),
          }),
        ],
      }),
    })
    const data = await res.json()
    expect(data.waypointAdded).toBe(true)
    expect(data.waypointCount).toBe(1)
  })

  it('debe añadir waypoint a routeWaypoints existentes', async () => {
    const existingWaypoints = [
      { lat: 37.5, lng: -4.2, timestamp: '2026-06-03T10:00:00.000Z' },
    ]

    setupShipment({ routeWaypoints: existingWaypoints })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.0,
      longitude: -3.8,
      addWaypoint: true,
    }), undefined)

    expect(res.status).toBe(200)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        routeWaypoints: [
          ...existingWaypoints,
          expect.objectContaining({ lat: 38.0, lng: -3.8 }),
        ],
      }),
    })
    const data = await res.json()
    expect(data.waypointCount).toBe(2)
  })

  it('NO debe añadir waypoint si addWaypoint=false o no se envía', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.1234,
      longitude: -3.5678,
    }), undefined)

    // update fue llamado, pero NO debe incluir routeWaypoints
    const updateCall = (prisma as any).erp_shipments.update.mock.calls[0][0]
    expect(updateCall.data.routeWaypoints).toBeUndefined()

    const data = await res.json()
    expect(data.waypointAdded).toBe(false)
    expect(data.waypointCount).toBe(0)
  })

  // ── Auto-transición DISPATCHING → SHIPPED ───────────────────────────

  it('debe auto-transicionar DISPATCHING a SHIPPED con primer GPS', async () => {
    setupShipment({ status: 'DISPATCHING', dispatchedAt: null })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 36.8,
      longitude: -4.3,
    }), undefined)

    expect(res.status).toBe(200)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        status: 'SHIPPED',
        dispatchedAt: expect.any(Date),
        currentLat: 36.8,
        currentLng: -4.3,
      }),
    })
    const data = await res.json()
    expect(data.status).toBe('SHIPPED')
  })

  // ── Manejo de errores ────────────────────────────────────────────────

  it('debe devolver 400 si el body no es JSON válido', async () => {
    const res = await POST(mockMalformedRequest(), undefined)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Cuerpo de la solicitud inválido')
  })

  it('debe devolver 500 si findUnique lanza error', async () => {
    ;(prisma as any).erp_shipments.findUnique.mockRejectedValue(new Error('DB connection error'))

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.0,
      longitude: -3.5,
    }), undefined)

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('DB connection error')
  })

  it('debe devolver 500 si update lanza error', async () => {
    setupShipment()
    ;(prisma as any).erp_shipments.update.mockRejectedValue(new Error('Update failed'))

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.0,
      longitude: -3.5,
    }), undefined)

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Update failed')
  })

  it('debe incluir altitude y accuracy en waypoint si se envían con addWaypoint', async () => {
    setupShipment()

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.0,
      longitude: -3.5,
      altitude: 450,
      accuracy: 10,
      addWaypoint: true,
    }), undefined)

    expect(res.status).toBe(200)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        routeWaypoints: [
          expect.objectContaining({
            altitude: 450,
            accuracy: 10,
          }),
        ],
      }),
    })
  })

  it('debe parsear routeWaypoints como string JSON (desde Prisma)', async () => {
    const waypointsJson = '[{"lat":37.5,"lng":-4.2,"timestamp":"2026-06-03T10:00:00.000Z"}]'
    setupShipment({ routeWaypoints: waypointsJson })

    const res = await POST(mockRequest({
      shipmentId: 'shp-test-001',
      latitude: 38.0,
      longitude: -3.8,
      addWaypoint: true,
    }), undefined)

    expect(res.status).toBe(200)
    expect((prisma as any).erp_shipments.update).toHaveBeenCalledWith({
      where: { id: 'shp-test-001' },
      data: expect.objectContaining({
        routeWaypoints: [
          { lat: 37.5, lng: -4.2, timestamp: '2026-06-03T10:00:00.000Z' },
          expect.objectContaining({ lat: 38.0, lng: -3.8 }),
        ],
      }),
    })
  })
})
