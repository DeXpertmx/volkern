import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock data ─────────────────────────────────────────────────────────────

const mockDbVehicle = {
  id: 'veh-test-001',
  tenantId: 'test-tenant-id',
  plate: 'TEST123',
  brand: 'Mercedes-Benz',
  model: 'Sprinter',
  year: 2024,
  type: 'furgoneta',
  status: 'ACTIVE',
  gpsDeviceId: 'VK-GPS-TEST123-X7K2',
  currentLat: null,
  currentLng: null,
  lastGpsUpdate: null,
  currentTemp: null,
  lastSpeed: null,
  capacity: 1500,
  capacityUnit: 'kg',
  fuelType: 'diesel',
}

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    erp_fleet_vehicles: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// ─── Imports ───────────────────────────────────────────────────────────────

import { POST } from '@/app/api/erp/logistics/gps/vehicle-poll/route'
import { prisma } from '@/lib/db'

// ─── Helpers ──────────────────────────────────────────────────────────────

function mockRequest(body: unknown): Request {
  return new Request('https://volkern.app/api/erp/logistics/gps/vehicle-poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockMalformedRequest(): Request {
  return new Request('https://volkern.app/api/erp/logistics/gps/vehicle-poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ broken json',
  })
}

function setupVehicle(overrides: Record<string, any> = {}) {
  const vehicle = { ...mockDbVehicle, ...overrides }
  ;(prisma as any).erp_fleet_vehicles.findUnique.mockResolvedValue(vehicle)
  ;(prisma as any).erp_fleet_vehicles.update.mockResolvedValue(vehicle)
  return vehicle
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/erp/logistics/gps/vehicle-poll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Validación de campos obligatorios ────────────────────────────────

  it('debe devolver 400 si falta deviceKey', async () => {
    const res = await POST(mockRequest({ latitude: 38.0, longitude: -3.5 }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Campo obligatorio: deviceKey')
    expect((prisma as any).erp_fleet_vehicles.update).not.toHaveBeenCalled()
  })

  it('debe devolver 400 si falta latitude', async () => {
    const res = await POST(mockRequest({ deviceKey: 'VK-GPS-TEST', longitude: -3.5 }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Campos obligatorios: latitude, longitude')
  })

  it('debe devolver 400 si falta longitude', async () => {
    const res = await POST(mockRequest({ deviceKey: 'VK-GPS-TEST', latitude: 38.0 }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Campos obligatorios: latitude, longitude')
  })

  it('debe devolver 400 si latitude no es número', async () => {
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST',
      latitude: '38.0',
      longitude: -3.5,
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude y longitude deben ser números')
  })

  it('debe devolver 400 si longitude no es número', async () => {
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST',
      latitude: 38.0,
      longitude: '-3.5',
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude y longitude deben ser números')
  })

  // ── Validación de rangos geográficos ─────────────────────────────────

  it('debe devolver 400 si latitude < -90', async () => {
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST',
      latitude: -91,
      longitude: 0,
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude debe estar entre -90 y 90')
  })

  it('debe devolver 400 si latitude > 90', async () => {
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST',
      latitude: 91,
      longitude: 0,
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('latitude debe estar entre -90 y 90')
  })

  it('debe devolver 400 si longitude < -180', async () => {
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST',
      latitude: 0,
      longitude: -181,
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('longitude debe estar entre -180 y 180')
  })

  it('debe devolver 400 si longitude > 180', async () => {
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST',
      latitude: 0,
      longitude: 181,
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('longitude debe estar entre -180 y 180')
  })

  it('debe aceptar latitude = -90 (Polo Sur)', async () => {
    setupVehicle()
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: -90,
      longitude: 0,
    }))
    expect(res.status).toBe(200)
  })

  it('debe aceptar longitude = 180', async () => {
    setupVehicle()
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 0,
      longitude: 180,
    }))
    expect(res.status).toBe(200)
  })

  // ── Vehículo no encontrado ───────────────────────────────────────────

  it('debe devolver 404 si el vehículo no existe', async () => {
    ;(prisma as any).erp_fleet_vehicles.findUnique.mockResolvedValue(null)

    const res = await POST(mockRequest({
      deviceKey: 'NO-EXISTE',
      latitude: 38.0,
      longitude: -3.5,
    }))

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Vehículo no encontrado. Verifica el deviceKey.')
  })

  it('debe buscar vehículo por gpsDeviceId', async () => {
    setupVehicle()

    await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.0,
      longitude: -3.5,
    }))

    expect((prisma as any).erp_fleet_vehicles.findUnique).toHaveBeenCalledWith({
      where: { gpsDeviceId: 'VK-GPS-TEST123-X7K2' },
    })
  })

  // ── Validación de timestamp ──────────────────────────────────────────

  it('debe devolver 400 si el timestamp es inválido', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.0,
      longitude: -3.5,
      timestamp: 'no-es-una-fecha',
    }))

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('timestamp inválido')
  })

  it('debe usar el timestamp proporcionado si es válido', async () => {
    setupVehicle()

    const ts = '2026-06-03T15:30:00.000Z'
    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
      timestamp: ts,
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.timestamp).toBe(ts)
    expect((prisma as any).erp_fleet_vehicles.update).toHaveBeenCalledWith({
      where: { id: 'veh-test-001' },
      data: expect.objectContaining({
        lastGpsUpdate: new Date(ts),
      }),
    })
  })

  // ── Poll exitoso (caso básico) ───────────────────────────────────────

  it('debe actualizar currentLat, currentLng y lastGpsUpdate en BD', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
    }))

    expect(res.status).toBe(200)
    expect((prisma as any).erp_fleet_vehicles.update).toHaveBeenCalledWith({
      where: { id: 'veh-test-001' },
      data: expect.objectContaining({
        currentLat: 38.1234,
        currentLng: -3.5678,
        lastGpsUpdate: expect.any(Date),
      }),
    })
  })

  it('debe devolver acknowledged=true en respuesta exitosa', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
    }))

    const data = await res.json()
    expect(data.acknowledged).toBe(true)
    expect(data.vehicleId).toBe('veh-test-001')
    expect(data.plate).toBe('TEST123')
    expect(data.newPosition).toEqual([38.1234, -3.5678])
  })

  it('debe incluir previousPosition como null si no había posición previa', async () => {
    setupVehicle({ currentLat: null, currentLng: null })

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
    }))

    const data = await res.json()
    expect(data.previousPosition).toBeNull()
  })

  it('debe incluir previousPosition con la posición anterior', async () => {
    setupVehicle({ currentLat: 37.5, currentLng: -4.0 })

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
    }))

    const data = await res.json()
    expect(data.previousPosition).toEqual([37.5, -4.0])
  })

  // ── Campos opcionales en la respuesta ────────────────────────────────

  it('debe persistir speed, cargoTemp si se envían', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
      speed: 65.5,
      cargoTemp: 22.3,
    }))

    expect(res.status).toBe(200)
    expect((prisma as any).erp_fleet_vehicles.update).toHaveBeenCalledWith({
      where: { id: 'veh-test-001' },
      data: expect.objectContaining({
        currentLat: 38.1234,
        currentLng: -3.5678,
        lastSpeed: 65.5,
        currentTemp: 22.3,
      }),
    })
  })

  it('debe incluir speed, heading y cargoTemp en la respuesta', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
      speed: 65.5,
      heading: 180,
      cargoTemp: 22.3,
    }))

    const data = await res.json()
    expect(data.speed).toBe(65.5)
    expect(data.heading).toBe(180)
    expect(data.cargoTemp).toBe(22.3)
  })

  it('debe devolver null para speed, heading, cargoTemp si no se enviaron', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.1234,
      longitude: -3.5678,
    }))

    const data = await res.json()
    expect(data.speed).toBeNull()
    expect(data.heading).toBeNull()
    expect(data.cargoTemp).toBeNull()
  })

  // ── Manejo de errores ────────────────────────────────────────────────

  it('debe devolver 400 si el body no es JSON válido', async () => {
    const res = await POST(mockMalformedRequest())

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Cuerpo de la solicitud inválido')
  })

  it('debe devolver 500 si findUnique lanza error', async () => {
    ;(prisma as any).erp_fleet_vehicles.findUnique.mockRejectedValue(
      new Error('DB connection error')
    )

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.0,
      longitude: -3.5,
    }))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('DB connection error')
  })

  it('debe devolver 500 si update lanza error', async () => {
    setupVehicle()
    ;(prisma as any).erp_fleet_vehicles.update.mockRejectedValue(
      new Error('Update failed')
    )

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.0,
      longitude: -3.5,
    }))

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Update failed')
  })

  // ── Validación de campos opcionales extras ───────────────────────────

  it('debe ignorar campos extra no definidos en el esquema', async () => {
    setupVehicle()

    const res = await POST(mockRequest({
      deviceKey: 'VK-GPS-TEST123-X7K2',
      latitude: 38.0,
      longitude: -3.5,
      extraField: 'should be ignored',
      anotherExtra: 42,
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.acknowledged).toBe(true)
  })
})
