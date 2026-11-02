// @vitest-environment node
/**
 * Personalización del alta: escribir impuestos y moneda.
 *
 * Los casos que importan son los que pueden duplicar o romper datos: dos
 * pasadas del alta no pueden dejar dos juegos de IVA con fechas distintas, una
 * tasa con otro porcentaje se corrige, y deshacer no borra un impuesto que ya
 * está en una cotización.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  tasaImpuesto: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  tenant: { findUnique: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }))

const { aplicarFiscal, deshacerFiscal } = await import('@/lib/implantacion/aplicar-fiscal')
const { proponerFiscal } = await import('@/lib/implantacion/fiscal')

import type { Descubrimiento } from '@/lib/implantacion/descubrimiento'

const DESCUBRIMIENTO: Descubrimiento = {
  respuestas: { que_vende: ['servicios'] },
  noSe: [],
  notas: '',
  version: 1,
}

const CONTEXTO = {
  pais: 'ES',
  monedaActual: 'MXN',
  emisor: {
    razonSocial: 'Estudio Norte SL',
    idFiscal: 'B12345678',
    direccion: 'Calle Mayor 1',
    ciudad: 'Madrid',
    codigoPostal: '28013',
    email: 'hola@estudionorte.es',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tasaImpuesto.findFirst.mockResolvedValue(null)
  mocks.tasaImpuesto.create.mockImplementation(async ({ data }: any) => ({
    id: `t-${data.codigo}`,
    nombre: data.nombre,
  }))
  mocks.tasaImpuesto.update.mockResolvedValue({})
  mocks.tasaImpuesto.delete.mockResolvedValue({})
  mocks.tenant.findUnique.mockResolvedValue({ moneda: 'MXN' })
  mocks.tenant.update.mockResolvedValue({})
})

describe('aplicarFiscal — tasas', () => {
  it('crea las que no existen con su país y su tipo', async () => {
    const propuesta = proponerFiscal(DESCUBRIMIENTO, CONTEXTO)
    const resultado = await aplicarFiscal('t1', propuesta, {
      moneda: 'EUR',
      tasas: ['IVA_ES_GENERAL'],
    })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    expect(resultado.resultado.tasas[0]).toMatchObject({
      codigo: 'IVA_ES_GENERAL',
      porcentaje: 21,
      estado: 'creada',
    })

    const datos = mocks.tasaImpuesto.create.mock.calls[0][0].data
    expect(datos).toMatchObject({ tenantId: 't1', pais: 'ES', tipo: 'iva', codigo: 'IVA_ES_GENERAL' })
  })

  it('no duplica: una tasa activa con el mismo porcentaje se deja como está', async () => {
    mocks.tasaImpuesto.findFirst.mockResolvedValue({
      id: 't1',
      nombre: 'IVA general ES',
      porcentaje: 21,
    })

    const propuesta = proponerFiscal(DESCUBRIMIENTO, CONTEXTO)
    const resultado = await aplicarFiscal('t1', propuesta, { moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.resultado.tasas[0].estado).toBe('sin_cambios')
    expect(mocks.tasaImpuesto.create).not.toHaveBeenCalled()
    expect(mocks.tasaImpuesto.update).not.toHaveBeenCalled()
  })

  it('corrige el porcentaje de la que ya existe en vez de crear otra', async () => {
    mocks.tasaImpuesto.findFirst.mockResolvedValue({
      id: 't-old',
      nombre: 'IVA general ES',
      porcentaje: 18,
    })

    const propuesta = proponerFiscal(DESCUBRIMIENTO, CONTEXTO)
    const resultado = await aplicarFiscal('t1', propuesta, { moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.resultado.tasas[0].estado).toBe('actualizada')
    expect(mocks.tasaImpuesto.update).toHaveBeenCalledWith({
      where: { id: 't-old' },
      data: { porcentaje: 21 },
    })
    expect(mocks.tasaImpuesto.create).not.toHaveBeenCalled()
  })

  it('sin país o sin tasas no escribe nada', async () => {
    const propuesta = proponerFiscal(DESCUBRIMIENTO, { ...CONTEXTO, pais: null })

    const sinPais = await aplicarFiscal('t1', propuesta, { moneda: 'EUR', tasas: [] })
    expect(sinPais.ok).toBe(false)
    expect(mocks.tasaImpuesto.create).not.toHaveBeenCalled()
  })
})

describe('aplicarFiscal — moneda', () => {
  it('cambia la moneda del tenant y deja constancia de que fue una elección', async () => {
    const propuesta = proponerFiscal(DESCUBRIMIENTO, CONTEXTO)
    const resultado = await aplicarFiscal('t1', propuesta, { moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.resultado.moneda).toEqual({ anterior: 'MXN', actual: 'EUR', cambiada: true })
    expect(mocks.tenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { moneda: 'EUR', monedaInferida: 'EUR', monedaInferenciaSource: 'EXPLICIT' },
    })
  })

  it('si la moneda ya es la correcta no toca el tenant', async () => {
    mocks.tenant.findUnique.mockResolvedValue({ moneda: 'EUR' })

    const propuesta = proponerFiscal(DESCUBRIMIENTO, CONTEXTO)
    const resultado = await aplicarFiscal('t1', propuesta, { moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] })

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.resultado.moneda.cambiada).toBe(false)
    expect(mocks.tenant.update).not.toHaveBeenCalled()
  })
})

describe('deshacerFiscal', () => {
  it('borra lo que no está en documentos y conserva lo que sí', async () => {
    mocks.tasaImpuesto.findFirst
      .mockResolvedValueOnce({
        id: 't1',
        nombre: 'IVA general ES',
        _count: { catalogoItems: 0, cotizacionItems: 0, ordenVentaItems: 0, contratoItems: 0 },
      })
      .mockResolvedValueOnce({
        id: 't2',
        nombre: 'IVA reducido ES',
        _count: { catalogoItems: 3, cotizacionItems: 0, ordenVentaItems: 0, contratoItems: 0 },
      })
      .mockResolvedValueOnce(null)

    const resultado = await deshacerFiscal('t1', ['IVA_ES_GENERAL', 'IVA_ES_REDUCIDO', 'IVA_ES_EXENTO'])

    expect(resultado.borradas).toEqual(['IVA_ES_GENERAL'])
    expect(resultado.conservadas).toEqual([{ codigo: 'IVA_ES_REDUCIDO', nombre: 'IVA reducido ES', usos: 3 }])
    expect(resultado.ausentes).toEqual(['IVA_ES_EXENTO'])
    expect(mocks.tasaImpuesto.delete).toHaveBeenCalledTimes(1)
    expect(mocks.tasaImpuesto.delete).toHaveBeenCalledWith({ where: { id: 't1' } })
  })

  it('no revierte la moneda: los importes escritos después ya están en la nueva', async () => {
    await deshacerFiscal('t1', [])
    expect(mocks.tenant.update).not.toHaveBeenCalled()
  })
})
