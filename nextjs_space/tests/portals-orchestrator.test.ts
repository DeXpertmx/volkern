/**
 * Tests — Orquestador de sindicación multiportal
 *
 * El orquestador es quien decide tenant, portal y qué se registra, así que sus
 * garantías se prueban aquí sin base de datos real: una Prisma en memoria que
 * imita los filtros por `tenantId` y un adaptador falso que solo mapea. Así los
 * cuatro comportamientos críticos quedan cubiertos sin depender de una prueba
 * manual en producción:
 *
 *  · idempotencia por hash del payload (no se reenvía lo que no cambia),
 *  · exclusión de estados (vendida/retirada/reservada/alquilada),
 *  · bajas del feed absoluto (lo que deja de salir pasa a `removed`),
 *  · aislamiento entre tenants (ni lecturas ni escrituras cruzadas).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  type Fila = Record<string, any>

  const estado = {
    conexiones: [] as Fila[],
    inmuebles: [] as Fila[],
    publicaciones: [] as Fila[],
    logs: [] as Fila[],
    tenants: [] as Fila[],
    /** Probes concretos: cuántos upserts y con qué tenant se leyó el maestro. */
    upserts: 0,
    lecturasPorTenant: [] as string[],
    secuencia: 0,
  }

  const siguienteId = (prefijo: string) => `${prefijo}_${++estado.secuencia}`
  const aplicar = (fila: Fila, data: Fila) => {
    for (const [clave, valor] of Object.entries(data)) {
      if (valor && typeof valor === 'object' && 'increment' in valor) {
        fila[clave] = (fila[clave] ?? 0) + Number(valor.increment)
      } else {
        fila[clave] = valor
      }
    }
    return fila
  }
  const coincide = (where: Fila) => (fila: Fila) =>
    Object.entries(where).every(([clave, valor]) => fila[clave] === valor)
  const buscarPublicacion = (where: Fila) => {
    const k = where.tenantId_propertyId_portalKey
    return estado.publicaciones.find(
      (p) =>
        p.tenantId === k.tenantId &&
        p.propertyId === k.propertyId &&
        p.portalKey === k.portalKey
    )
  }

  // Adaptador falso: solo lo que el orquestador invoca. La exclusión de
  // inmuebles la decide el orquestador, que es justo lo que se verifica.
  const adaptador = {
    validateConfig: () => ({ valid: true, errors: [] }),
    mapProperty: (property: Fila) => ({
      propertyId: property.id,
      reference: `ref-${property.id}`,
      payload: { id: property.id, price: property.precioBase },
    }),
    validatePayload: () => ({ valid: true, errors: [] }),
    deliver: async () => ({ ok: true, document: '<feed/>' }),
  }

  const prisma = {
    portalConnection: {
      findUnique: vi.fn(async (args: any) => {
        const k = args.where.tenantId_portalKey
        return estado.conexiones.find(coincide(k)) ?? null
      }),
      update: vi.fn(async (args: any) => {
        const conexion = estado.conexiones.find((c) => c.id === args.where.id)
        if (!conexion) throw new Error('conexión inexistente')
        return aplicar(conexion, args.data)
      }),
    },
    portalSyncLog: {
      create: vi.fn(async (args: any) => {
        const log = { id: siguienteId('log'), ...args.data }
        estado.logs.push(log)
        return log
      }),
      update: vi.fn(async (args: any) => {
        const log = estado.logs.find((l) => l.id === args.where.id)
        if (!log) throw new Error('log inexistente')
        return aplicar(log, args.data)
      }),
    },
    portalPublication: {
      findMany: vi.fn(async (args: any) => {
        const where = args.where ?? {}
        return estado.publicaciones
          .filter(coincide(where))
          .map((p) => ({ ...p }))
      }),
      upsert: vi.fn(async (args: any) => {
        estado.upserts++
        const existente = buscarPublicacion(args.where)
        if (existente) return aplicar(existente, args.update)
        const nueva = { id: siguienteId('pub'), ...args.create }
        estado.publicaciones.push(nueva)
        return nueva
      }),
      update: vi.fn(async (args: any) => {
        const existente = buscarPublicacion(args.where)
        if (!existente) throw new Error('publicación inexistente')
        return aplicar(existente, args.data)
      }),
    },
    catalogoItem: {
      findMany: vi.fn(async (args: any) => {
        const where = args.where ?? {}
        estado.lecturasPorTenant.push(where.tenantId)
        return estado.inmuebles.filter(coincide(where)).map((i) => ({ ...i }))
      }),
    },
    tenant: {
      findUnique: vi.fn(async (args: any) =>
        estado.tenants.find((t) => t.id === args.where.id) ?? null
      ),
    },
  }

  return { estado, prisma, adaptador }
})

vi.mock('@/lib/db', () => ({ prisma: h.prisma }))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/portals/registry', () => ({
  getAdapter: (key: string) => (key === 'kyero' ? h.adaptador : null),
}))

import { runPortalSync, PortalNotConfiguredError } from '@/lib/portals/orchestrator'

const TENANT_A = 'tenant-alfa'
const TENANT_B = 'tenant-beta'

function inmueble(
  id: string,
  tenantId: string,
  opciones: { estado?: string; publicable?: boolean; precio?: number } = {}
) {
  return {
    id,
    tenantId,
    nombre: `Inmueble ${id}`,
    precioBase: opciones.precio ?? 300000,
    moneda: 'EUR',
    activo: true,
    tipo: 'inmueble',
    customFieldValues: {
      tipo_operacion: 'venta',
      tipo_inmueble: 'casa',
      estado: opciones.estado ?? 'disponible',
      publicable_portales: opciones.publicable !== false,
    },
  }
}

function conexion(tenantId: string, extra: Record<string, any> = {}) {
  return {
    id: `conn-${tenantId}`,
    tenantId,
    portalKey: 'kyero',
    enabled: true,
    config: {},
    syncFrequencyMinutes: 360,
    credentialsEnc: null,
    feedToken: `token-${tenantId}`,
    feedTokenRevokedAt: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    ...extra,
  }
}

/** Copias: un test que compare contra una fila viva acabaría comparándola consigo misma. */
function publicacionesDe(tenantId: string, propertyId?: string) {
  return h.estado.publicaciones
    .filter(
      (p) =>
        p.tenantId === tenantId &&
        (propertyId === undefined || p.propertyId === propertyId)
    )
    .map((p) => ({ ...p }))
}

beforeEach(() => {
  h.estado.conexiones = []
  h.estado.inmuebles = []
  h.estado.publicaciones = []
  h.estado.logs = []
  h.estado.tenants = [TENANT_A, TENANT_B].map((id) => ({
    id,
    nombre: `Cuenta ${id}`,
    billingEmail: null,
  }))
  h.estado.upserts = 0
  h.estado.lecturasPorTenant = []
  h.estado.secuencia = 0
})

describe('orquestador: idempotencia por hash', () => {
  beforeEach(() => {
    h.estado.conexiones.push(conexion(TENANT_A))
    h.estado.inmuebles.push(inmueble('prop-1', TENANT_A))
  })

  it('publica la primera vez, deja rastro y no reenvía lo que no ha cambiado', async () => {
    const primera = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })
    expect(primera).toMatchObject({
      status: 'success',
      propertiesTotal: 1,
      published: 1,
      updated: 0,
      unchanged: 0,
    })

    const [publicada] = publicacionesDe(TENANT_A, 'prop-1')
    expect(publicada.status).toBe('published')
    expect(publicada.attempts).toBe(1)
    expect(publicada.lastPayloadHash).toMatch(/^[a-f0-9]{64}$/)

    expect(h.estado.logs).toHaveLength(1)
    expect(h.estado.logs[0]).toMatchObject({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      status: 'success',
      propertiesTotal: 1,
      propertiesPublished: 1,
      propertiesUpdated: 0,
      propertiesUnchanged: 0,
      propertiesRemoved: 0,
    })

    const segunda = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'cron',
    })
    expect(segunda).toMatchObject({ published: 0, updated: 0, unchanged: 1 })

    const [sinCambios] = publicacionesDe(TENANT_A, 'prop-1')
    expect(sinCambios).toMatchObject({
      status: 'published',
      attempts: 1,
      lastPayloadHash: publicada.lastPayloadHash,
    })

    // La segunda pasada no reescribió la publicación: solo la leyó.
    expect(h.estado.upserts).toBe(1)
  })

  it('reenvía como updated cuando el payload cambia de verdad', async () => {
    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    const hashAntes = publicacionesDe(TENANT_A, 'prop-1')[0].lastPayloadHash

    h.estado.inmuebles[0].precioBase = 325000
    const segunda = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })

    expect(segunda).toMatchObject({ published: 0, updated: 1, unchanged: 0 })
    const [despues] = publicacionesDe(TENANT_A, 'prop-1')
    expect(despues.status).toBe('updated')
    expect(despues.attempts).toBe(2)
    expect(despues.lastPayloadHash).not.toBe(hashAntes)
  })
})

describe('orquestador: exclusión de estados', () => {
  it('nunca publica vendidas, retiradas, reservadas ni alquiladas', async () => {
    h.estado.conexiones.push(conexion(TENANT_A))
    h.estado.inmuebles.push(
      inmueble('prop-disponible', TENANT_A),
      inmueble('prop-vendida', TENANT_A, { estado: 'Vendida' }),
      inmueble('prop-retirada', TENANT_A, { estado: 'retirada' }),
      inmueble('prop-reservada', TENANT_A, { estado: 'Reservada' }),
      inmueble('prop-alquilada', TENANT_A, { estado: 'alquilada' }),
      inmueble('prop-oculta', TENANT_A, { publicable: false })
    )

    const resultado = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })

    expect(resultado.propertiesTotal).toBe(1)
    expect(resultado.published).toBe(1)
    expect(h.estado.publicaciones.map((p) => p.propertyId)).toEqual(['prop-disponible'])
  })

  it('incluye reservadas y alquiladas solo si la conexión lo autoriza', async () => {
    h.estado.conexiones.push(
      conexion(TENANT_A, { config: { includeReserved: true, includeRented: true } })
    )
    h.estado.inmuebles.push(
      inmueble('prop-reservada', TENANT_A, { estado: 'reservada' }),
      inmueble('prop-alquilada', TENANT_A, { estado: 'Alquilada' })
    )

    const resultado = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })

    expect(resultado.propertiesTotal).toBe(2)
    expect(resultado.published).toBe(2)
    expect(h.estado.publicaciones.map((p) => p.propertyId).sort()).toEqual([
      'prop-alquilada',
      'prop-reservada',
    ])
  })
})

describe('orquestador: bajas del feed', () => {
  beforeEach(() => {
    h.estado.conexiones.push(conexion(TENANT_A))
    h.estado.inmuebles.push(
      inmueble('prop-a', TENANT_A),
      inmueble('prop-b', TENANT_A),
      inmueble('prop-c', TENANT_A)
    )
  })

  it('marca como removed lo que deja de ser publicable o pasa a vendido', async () => {
    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    expect(publicacionesDe(TENANT_A)).toHaveLength(3)

    h.estado.inmuebles[0].customFieldValues.publicable_portales = false
    h.estado.inmuebles[1].customFieldValues.estado = 'vendida'
    const resultado = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })

    expect(resultado).toMatchObject({
      propertiesTotal: 1,
      published: 0,
      updated: 0,
      unchanged: 1,
      removed: 2,
    })
    expect(publicacionesDe(TENANT_A, 'prop-a')[0].status).toBe('removed')
    expect(publicacionesDe(TENANT_A, 'prop-b')[0].status).toBe('removed')
    // Lo que sigue publicable no se toca.
    expect(publicacionesDe(TENANT_A, 'prop-c')[0].status).toBe('published')
  })

  it('no repite la baja en las sincronizaciones siguientes', async () => {
    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    h.estado.inmuebles[0].customFieldValues.publicable_portales = false

    const baja = await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    expect(baja.removed).toBe(1)

    const repetida = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })
    expect(repetida).toMatchObject({ removed: 0, unchanged: 2 })
    expect(publicacionesDe(TENANT_A, 'prop-a')[0].status).toBe('removed')
  })

  it('republica un inmueble retirado que vuelve a ser publicable', async () => {
    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    h.estado.inmuebles[0].customFieldValues.publicable_portales = false
    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })

    h.estado.inmuebles[0].customFieldValues.publicable_portales = true
    const vuelta = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })

    expect(vuelta).toMatchObject({ published: 0, updated: 1, unchanged: 2, removed: 0 })
    expect(publicacionesDe(TENANT_A, 'prop-a')[0].status).toBe('updated')
  })
})

describe('orquestador: aislamiento entre tenants', () => {
  it('cada tenant publica solo sus inmuebles y no toca los del otro', async () => {
    h.estado.conexiones.push(conexion(TENANT_A), conexion(TENANT_B))
    h.estado.inmuebles.push(
      inmueble('prop-a1', TENANT_A),
      inmueble('prop-b1', TENANT_B),
      inmueble('prop-b2', TENANT_B)
    )

    const alfa = await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    expect(alfa.published).toBe(1)
    expect(publicacionesDe(TENANT_A)).toHaveLength(1)
    expect(publicacionesDe(TENANT_B)).toHaveLength(0)

    const beta = await runPortalSync({ tenantId: TENANT_B, portalKey: 'kyero', trigger: 'manual' })
    expect(beta.published).toBe(2)
    expect(publicacionesDe(TENANT_B)).toHaveLength(2)
    expect(publicacionesDe(TENANT_B).every((p) => p.tenantId === TENANT_B)).toBe(true)

    // La sincronización de beta no reescribió la publicación de alfa.
    expect(publicacionesDe(TENANT_A)).toHaveLength(1)
    expect(publicacionesDe(TENANT_A)[0]).toMatchObject({
      tenantId: TENANT_A,
      propertyId: 'prop-a1',
      status: 'published',
    })

    // El registro maestro se lee siempre filtrado por el tenant sincronizado.
    expect(h.estado.lecturasPorTenant).toEqual([TENANT_A, TENANT_B])
  })

  it('el mismo id de inmueble en dos tenants son publicaciones distintas', async () => {
    h.estado.conexiones.push(conexion(TENANT_A), conexion(TENANT_B))
    h.estado.inmuebles.push(
      inmueble('prop-compartida', TENANT_A, { precio: 300000 }),
      inmueble('prop-compartida', TENANT_B, { precio: 450000 })
    )

    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })
    await runPortalSync({ tenantId: TENANT_B, portalKey: 'kyero', trigger: 'manual' })

    const [publicadaA] = publicacionesDe(TENANT_A, 'prop-compartida')
    const [publicadaB] = publicacionesDe(TENANT_B, 'prop-compartida')
    expect(publicadaA).toBeDefined()
    expect(publicadaB).toBeDefined()
    expect(publicadaA.lastPayloadHash).not.toBe(publicadaB.lastPayloadHash)

    // Alfa sigue viendo su payload como vigente pese a que beta cambió el suyo.
    const segundaAlfa = await runPortalSync({
      tenantId: TENANT_A,
      portalKey: 'kyero',
      trigger: 'manual',
    })
    expect(segundaAlfa).toMatchObject({ unchanged: 1, updated: 0, published: 0 })
    expect(publicacionesDe(TENANT_A, 'prop-compartida')[0].lastPayloadHash).toBe(
      publicadaA.lastPayloadHash
    )
  })

  it('sin conexión propia falla sin abrir log ni alterar al otro tenant', async () => {
    h.estado.conexiones.push(conexion(TENANT_A))
    h.estado.inmuebles.push(inmueble('prop-a1', TENANT_A), inmueble('prop-b1', TENANT_B))

    await runPortalSync({ tenantId: TENANT_A, portalKey: 'kyero', trigger: 'manual' })

    await expect(
      runPortalSync({ tenantId: TENANT_B, portalKey: 'kyero', trigger: 'manual' })
    ).rejects.toBeInstanceOf(PortalNotConfiguredError)

    expect(h.estado.logs).toHaveLength(1)
    expect(h.estado.logs[0].tenantId).toBe(TENANT_A)
    expect(publicacionesDe(TENANT_B)).toHaveLength(0)
    expect(publicacionesDe(TENANT_A)[0].status).toBe('published')
  })
})
