import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  interpolateCurrentPosition,
  buildTrackingTimeline,
  getDisplayCity,
  DISPLAY_CITIES,
} from '@/lib/tracking-utils'

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Test helpers ──────────────────────────────────────────────────────────
const makeShipment = (overrides: Record<string, any> = {}) => ({
  id: 'shp-001',
  batchNumber: 'SHP-2024-001',
  status: 'SHIPPED',
  carrier: 'SEUR',
  trackingNumber: 'SEUR-482917365',
  originLat: 36.7213,
  originLng: -4.4214,
  destinationLat: 40.4168,
  destinationLng: -3.7038,
  dispatchedAt: new Date(Date.now() - 3600000), // 1 hour ago
  deliveredAt: null,
  receiverName: null,
  erp_delivery_confirmations: [],
  ...overrides,
})

// ─── DISPLAY_CITIES ───────────────────────────────────────────────────────
describe('DISPLAY_CITIES', () => {
  it('debe contener los 6 envíos del seed', () => {
    expect(Object.keys(DISPLAY_CITIES)).toHaveLength(6)
    expect(DISPLAY_CITIES['shp-001']).toEqual({ origin: 'Málaga', destination: 'Madrid' })
    expect(DISPLAY_CITIES['shp-002']).toEqual({ origin: 'Málaga', destination: 'Barcelona' })
    expect(DISPLAY_CITIES['shp-003']).toEqual({ origin: 'Zaragoza', destination: 'Bilbao' })
    expect(DISPLAY_CITIES['shp-004']).toEqual({ origin: 'Zaragoza', destination: 'Sevilla' })
    expect(DISPLAY_CITIES['shp-005']).toEqual({ origin: 'Málaga', destination: 'Valencia' })
    expect(DISPLAY_CITIES['shp-006']).toEqual({ origin: 'Sevilla', destination: 'Granada' })
  })
})

// ─── getDisplayCity ───────────────────────────────────────────────────────
describe('getDisplayCity', () => {
  it('debe retornar el nombre de ciudad del DISPLAY_CITIES', () => {
    const s = makeShipment()
    expect(getDisplayCity(s, 'origin')).toBe('Málaga')
    expect(getDisplayCity(s, 'destination')).toBe('Madrid')
  })

  it('debe retornar coordenadas como fallback si el ID no está en DISPLAY_CITIES', () => {
    const s = makeShipment({ id: 'unknown-001', originLat: 41.3874, originLng: 2.1686 })
    expect(getDisplayCity(s, 'origin')).toMatch(/^41\.\d+, 2\.\d+/)
  })

  it('debe retornar "origen"/"destino" si no hay coordenadas ni DISPLAY_CITIES', () => {
    const s = makeShipment({
      id: 'unknown-002',
      originLat: null, originLng: null,
      destinationLat: null, destinationLng: null,
    })
    expect(getDisplayCity(s, 'origin')).toBe('origen')
    expect(getDisplayCity(s, 'destination')).toBe('destino')
  })
})

// ─── interpolateCurrentPosition ───────────────────────────────────────────
describe('interpolateCurrentPosition', () => {
  it('debe retornar destino + progress=1 para envío DELIVERED', () => {
    const s = makeShipment({
      status: 'DELIVERED',
      deliveredAt: new Date(),
    })
    const result = interpolateCurrentPosition(s)
    expect(result.currentCoords).toEqual([s.destinationLat, s.destinationLng])
    expect(result.progress).toBe(1)
  })

  it('debe retornar null si faltan coordenadas de origen', () => {
    const s = makeShipment({ originLat: null, originLng: null })
    const result = interpolateCurrentPosition(s)
    expect(result.currentCoords).toBeNull()
    expect(result.lastGpsUpdate).toBeNull()
    expect(result.progress).toBe(0)
  })

  it('debe retornar null si faltan coordenadas de destino', () => {
    const s = makeShipment({ destinationLat: null, destinationLng: null })
    const result = interpolateCurrentPosition(s)
    expect(result.currentCoords).toBeNull()
    expect(result.progress).toBe(0)
  })

  it('debe retornar origen + progress=0 para envío PENDING sin dispatchedAt', () => {
    const s = makeShipment({
      status: 'PENDING',
      dispatchedAt: null,
    })
    const result = interpolateCurrentPosition(s)
    expect(result.currentCoords).toEqual([s.originLat, s.originLng])
    expect(result.progress).toBe(0)
  })

  it('debe retornar origen + progress=0 para envío PREPARING', () => {
    const s = makeShipment({
      status: 'PREPARING',
      dispatchedAt: null,
    })
    const result = interpolateCurrentPosition(s)
    expect(result.currentCoords).toEqual([s.originLat, s.originLng])
    expect(result.progress).toBe(0)
  })

  it('debe interpolar para envío SHIPPED con dispatchedAt reciente', () => {
    // Despachado hace 5 minutos → progress debe ser ~0 (apenas salió)
    const s = makeShipment({
      status: 'SHIPPED',
      dispatchedAt: new Date(Date.now() - 5 * 60 * 1000),
    })
    const result = interpolateCurrentPosition(s)
    expect(result.progress).toBeGreaterThan(0)
    expect(result.progress).toBeLessThan(0.05)
    expect(result.currentCoords).toBeDefined()
  })

  it('debe retornar destino + progress=1 para envío SHIPPED con dispatchedAt muy antiguo', () => {
    // Despachado hace 100 horas → ya debería haber llegado
    const s = makeShipment({
      status: 'SHIPPED',
      dispatchedAt: new Date(Date.now() - 100 * 3600000),
    })
    const result = interpolateCurrentPosition(s)
    expect(result.progress).toBe(1)
  })

  it('debe progresar más con más tiempo transcurrido', () => {
    const early = makeShipment({
      status: 'SHIPPED',
      dispatchedAt: new Date(Date.now() - 2 * 3600000), // 2h ago
    })
    const later = makeShipment({
      status: 'SHIPPED',
      dispatchedAt: new Date(Date.now() - 6 * 3600000), // 6h ago
    })
    expect(interpolateCurrentPosition(later).progress)
      .toBeGreaterThan(interpolateCurrentPosition(early).progress)
  })

  it('debe ser determinista para el mismo input', () => {
    const s = makeShipment()
    const r1 = interpolateCurrentPosition(s)
    const r2 = interpolateCurrentPosition(s)
    expect(r1.progress).toBe(r2.progress)
  })
})

// ─── buildTrackingTimeline ────────────────────────────────────────────────
describe('buildTrackingTimeline', () => {
  it('debe incluir evento CREATED por defecto', () => {
    const events = buildTrackingTimeline(makeShipment())
    const created = events.find((e: any) => e.type === 'CREATED')
    expect(created).toBeDefined()
    expect(created!.title).toBe('Envío registrado')
    expect(created!.description).toContain('SHP-2024-001')
  })

  it('debe incluir evento DISPATCH cuando hay dispatchedAt', () => {
    const events = buildTrackingTimeline(makeShipment())
    const dispatch = events.find((e: any) => e.type === 'DISPATCH')
    expect(dispatch).toBeDefined()
    expect(dispatch!.title).toBe('Despachado')
    expect(dispatch!.description).toContain('Málaga')
    expect(dispatch!.description).toContain('SEUR')
  })

  it('debe incluir evento TRANSIT cuando hay trackingNumber y no está entregado', () => {
    const events = buildTrackingTimeline(makeShipment())
    const transit = events.find((e: any) => e.type === 'TRANSIT')
    expect(transit).toBeDefined()
    expect(transit!.title).toBe('En tránsito')
    expect(transit!.description).toContain('Málaga')
    expect(transit!.description).toContain('Madrid')
  })

  it('debe incluir evento DELIVERY cuando hay deliveredAt', () => {
    const events = buildTrackingTimeline(makeShipment({
      deliveredAt: new Date(),
      receiverName: 'Juan Pérez',
    }))
    const delivery = events.find((e: any) => e.type === 'DELIVERY')
    expect(delivery).toBeDefined()
    expect(delivery!.title).toBe('Entregado')
    expect(delivery!.description).toContain('Juan Pérez')
  })

  it('debe incluir evento POD cuando hay erp_delivery_confirmations', () => {
    const events = buildTrackingTimeline(makeShipment({
      erp_delivery_confirmations: [
        { id: 'pod-001', confirmedBy: 'Ana López', confirmedAt: new Date(), notes: 'Todo bien' },
      ],
    }))
    const pod = events.find((e: any) => e.type === 'POD')
    expect(pod).toBeDefined()
    expect(pod!.title).toBe('POD registrado')
    expect(pod!.description).toContain('Ana López')
    expect(pod!.description).toContain('Todo bien')
  })

  it('debe ordenar eventos cronológicamente', () => {
    const events = buildTrackingTimeline(makeShipment({
      dispatchedAt: new Date(Date.now() - 3 * 86400000), // 3 days ago
      deliveredAt: new Date(Date.now() - 1 * 86400000),  // 1 day ago
    }))
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(events[i - 1].timestamp).getTime())
    }
  })

  it('debe devolver solo los eventos que no dependen de batchNumber', () => {
    // Sin batchNumber se salta CREATED, pero DISPATCH/TRANSIT aún aparecen si hay dispatchedAt
    const events = buildTrackingTimeline(makeShipment({ batchNumber: null }))
    const created = events.find((e: any) => e.type === 'CREATED')
    expect(created).toBeUndefined()
    const dispatch = events.find((e: any) => e.type === 'DISPATCH')
    expect(dispatch).toBeDefined()
  })

  it('debe devolver array vacío si no hay datos que generen eventos', () => {
    const events = buildTrackingTimeline(makeShipment({
      batchNumber: null,
      dispatchedAt: null,
      deliveredAt: null,
      trackingNumber: null,
    }))
    expect(events).toHaveLength(0)
  })

  it('debe incluir location en todos los eventos', () => {
    const events = buildTrackingTimeline(makeShipment())
    for (const evt of events) {
      expect(evt.location).toBeDefined()
      expect(typeof evt.location).toBe('string')
    }
  })

  it('debe incluir icon y color en todos los eventos', () => {
    const events = buildTrackingTimeline(makeShipment())
    for (const evt of events) {
      expect(evt.icon).toBeDefined()
      expect(evt.color).toBeDefined()
    }
  })
})
