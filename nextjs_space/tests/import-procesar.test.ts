// @vitest-environment node
/**
 * El contrato de R2, con Prisma simulado:
 *   1. `preview` analiza y **no escribe ni un registro**.
 *   2. `commit` escribe y guarda las trazas (qué ids creó, qué cambió) para
 *      poder deshacer.
 *   3. `deshacer` borra lo creado, restaura lo actualizado y se niega si hay
 *      lotes posteriores.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  leadFindMany: vi.fn(),
  leadCreate: vi.fn(),
  leadUpdate: vi.fn(),
  leadDeleteMany: vi.fn(),
  leadFindUnique: vi.fn(),
  fiscalFindMany: vi.fn(),
  fiscalCreate: vi.fn(),
  fiscalUpsert: vi.fn(),
  fiscalDeleteMany: vi.fn(),
  fiscalFindUnique: vi.fn(),
  fiscalUpdate: vi.fn(),
  servicioFindMany: vi.fn(),
  servicioCreate: vi.fn(),
  servicioUpdate: vi.fn(),
  servicioFindUnique: vi.fn(),
  servicioDeleteMany: vi.fn(),
  accountFindMany: vi.fn(),
  entryDeleteMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  importLogCreate: vi.fn(),
  importLogFindFirst: vi.fn(),
  importLogCount: vi.fn(),
  importLogUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
}))

vi.mock('@/lib/db', () => {
  const prisma = {
    lead: {
      findMany: mocks.leadFindMany,
      create: mocks.leadCreate,
      update: mocks.leadUpdate,
      deleteMany: mocks.leadDeleteMany,
      findUnique: mocks.leadFindUnique,
    },
    customerFiscalData: {
      findMany: mocks.fiscalFindMany,
      create: mocks.fiscalCreate,
      upsert: mocks.fiscalUpsert,
      deleteMany: mocks.fiscalDeleteMany,
      findUnique: mocks.fiscalFindUnique,
      update: mocks.fiscalUpdate,
    },
    servicio: {
      findMany: mocks.servicioFindMany,
      create: mocks.servicioCreate,
      update: mocks.servicioUpdate,
      findUnique: mocks.servicioFindUnique,
      deleteMany: mocks.servicioDeleteMany,
    },
    accountingAccount: { findMany: mocks.accountFindMany },
    accountingEntry: { deleteMany: mocks.entryDeleteMany },
    tenant: { findUnique: mocks.tenantFindUnique },
    importLog: {
      create: mocks.importLogCreate,
      findFirst: mocks.importLogFindFirst,
      count: mocks.importLogCount,
      update: mocks.importLogUpdate,
    },
    auditLog: { create: mocks.auditLogCreate },
  }
  return { prisma, default: prisma }
})

import { procesarImportacion } from '@/lib/import/procesar'
import { deshacerLote } from '@/lib/import/deshacer'

const CSV = 'nombre,email,nif\nAna,ana@empresa.es,12345678Z\nBeto,beto@empresa.es,\n'
const BUFFER = Buffer.from(CSV, 'utf8')

const MAPPING = [
  { sourceField: 'nombre', targetField: 'nombre' },
  { sourceField: 'email', targetField: 'email' },
  { sourceField: 'nif', targetField: 'nif' },
]

const entrada = (mode: 'preview' | 'commit') => ({
  tenantId: 't-1',
  userId: 'u-1',
  tipo: 'clients' as const,
  source: 'generic_csv' as const,
  buffer: BUFFER,
  mimeType: 'text/csv',
  mapping: MAPPING,
  mode,
  fileName: 'clientes.csv',
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.leadFindMany.mockResolvedValue([])
  mocks.fiscalFindMany.mockResolvedValue([])
  mocks.servicioFindMany.mockResolvedValue([])
  mocks.accountFindMany.mockResolvedValue([])
  mocks.tenantFindUnique.mockResolvedValue({ moneda: 'EUR' })
  mocks.importLogCreate.mockResolvedValue({ id: 'log-1' })
})

describe('preview: analiza y no escribe', () => {
  it('devuelve el informe sin crear ni un cliente y deja log de previsualización', async () => {
    const resultado = await procesarImportacion(entrada('preview'))

    expect(resultado.mode).toBe('preview')
    expect(resultado.informe.total).toBe(2)
    expect(resultado.informe.nuevas).toBe(2)
    expect(resultado.informe.aEscribir).toBe(2)
    expect(resultado.escritos).toBe(0)
    expect(resultado.puedeDeshacerse).toBe(false)

    expect(mocks.leadCreate).not.toHaveBeenCalled()
    expect(mocks.fiscalCreate).not.toHaveBeenCalled()
    expect(mocks.importLogCreate).toHaveBeenCalledTimes(1)
    expect(mocks.importLogCreate.mock.calls[0][0].data.mode).toBe('preview')
    expect(mocks.importLogCreate.mock.calls[0][0].data.recordsImported).toBe(0)
  })

  it('un fichero con duplicados internos no escribe y deja cuarentena', async () => {
    const doble = Buffer.from(
      'nombre,email\nAna,ana@empresa.es\nAna otra,ana@empresa.es\n',
      'utf8',
    )
    const resultado = await procesarImportacion({
      ...entrada('preview'),
      buffer: doble,
      mapping: [
        { sourceField: 'nombre', targetField: 'nombre' },
        { sourceField: 'email', targetField: 'email' },
      ],
    })

    expect(resultado.informe.nuevas).toBe(1)
    expect(resultado.informe.rechazadas).toBe(1)
    expect(resultado.cuarentenaCsv).toContain('DUPLICADO_FICHERO')
    expect(mocks.leadCreate).not.toHaveBeenCalled()
  })
})

describe('commit: escribe y guarda trazas para deshacer', () => {
  it('crea los clientes y registra los ids en el lote', async () => {
    mocks.leadCreate
      .mockResolvedValueOnce({ id: 'lead-1' })
      .mockResolvedValueOnce({ id: 'lead-2' })

    const resultado = await procesarImportacion(entrada('commit'))

    expect(resultado.escritos).toBe(2)
    expect(resultado.puedeDeshacerse).toBe(true)
    expect(mocks.leadCreate).toHaveBeenCalledTimes(2)
    expect(mocks.fiscalCreate).toHaveBeenCalledTimes(1) // solo Ana trae NIF

    const log = mocks.importLogCreate.mock.calls[0][0].data
    expect(log.mode).toBe('commit')
    expect(log.recordsImported).toBe(2)
    expect(log.report.creados).toEqual([
      { modelo: 'lead', id: 'lead-1' },
      { modelo: 'lead', id: 'lead-2' },
    ])
  })

  it('guarda la instantánea del cliente que actualiza', async () => {
    mocks.leadFindMany.mockResolvedValue([{ id: 'lead-1', nombre: 'Ana', email: 'ana@empresa.es' }])
    mocks.leadFindUnique.mockResolvedValue({
      nombre: 'Ana',
      email: 'ana@empresa.es',
      telefono: null,
      empresa: null,
      ubicacion: null,
    })

    const resultado = await procesarImportacion(entrada('commit'))

    expect(resultado.informe.actualizadas).toBe(1)
    expect(mocks.leadUpdate).toHaveBeenCalledTimes(1)

    const log = mocks.importLogCreate.mock.calls[0][0].data
    expect(log.report.actualizados).toHaveLength(1)
    expect(log.report.actualizados[0]).toMatchObject({
      modelo: 'lead',
      id: 'lead-1',
      antes: { nombre: 'Ana', email: 'ana@empresa.es' },
    })
  })
})

describe('deshacer por lote', () => {
  const lote = {
    id: 'log-1',
    tenantId: 't-1',
    mode: 'commit',
    revertedAt: null,
    createdAt: new Date('2026-10-31T10:00:00Z'),
    report: {
      creados: [{ modelo: 'lead', id: 'lead-1' }],
      actualizados: [
        {
          modelo: 'lead',
          id: 'lead-2',
          antes: { nombre: 'Nombre viejo', email: 'viejo@empresa.es', telefono: null, empresa: null, ubicacion: null },
        },
      ],
    },
  }

  beforeEach(() => {
    mocks.leadDeleteMany.mockResolvedValue({ count: 1 })
    mocks.leadUpdate.mockResolvedValue({})
    mocks.importLogCount.mockResolvedValue(0)
    mocks.importLogUpdate.mockResolvedValue({})
    mocks.auditLogCreate.mockResolvedValue({})
  })

  it('borra lo creado y restaura lo actualizado', async () => {
    mocks.importLogFindFirst.mockResolvedValue(lote)

    const resultado = await deshacerLote('t-1', 'log-1', 'u-1')

    expect(resultado).toMatchObject({ ok: true, borrados: 1, restaurados: 1 })
    expect(mocks.leadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-2' },
      data: lote.report.actualizados[0].antes,
    })
    expect(mocks.leadDeleteMany).toHaveBeenCalledWith({ where: { id: 'lead-1', tenantId: 't-1' } })
    expect(mocks.importLogUpdate).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({ status: 'reverted' }),
    })
  })

  it('se niega si después se ha importado otro lote', async () => {
    mocks.importLogFindFirst.mockResolvedValue(lote)
    mocks.importLogCount.mockResolvedValue(2)

    const resultado = await deshacerLote('t-1', 'log-1', 'u-1')

    expect(resultado).toMatchObject({ ok: false, motivo: 'hay_lotes_posteriores' })
    expect(mocks.leadDeleteMany).not.toHaveBeenCalled()
    expect(mocks.leadUpdate).not.toHaveBeenCalled()
  })

  it('se niega dos veces y con una previsualización', async () => {
    mocks.importLogFindFirst.mockResolvedValue({ ...lote, revertedAt: new Date() })
    expect(await deshacerLote('t-1', 'log-1')).toMatchObject({ ok: false, motivo: 'ya_deshecho' })

    mocks.importLogFindFirst.mockResolvedValue({ ...lote, mode: 'preview', report: null })
    expect(await deshacerLote('t-1', 'log-1')).toMatchObject({ ok: false, motivo: 'no_es_lote' })
    expect(mocks.leadDeleteMany).not.toHaveBeenCalled()
  })
})
