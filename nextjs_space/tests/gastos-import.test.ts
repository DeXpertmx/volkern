import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

// ─── Mocks ─────────────────────────────────────────────────────────────────

const { prismaMock, createExpenseMock } = vi.hoisted(() => ({
  prismaMock: {
    supplier: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    expense: {
      findFirst: vi.fn(),
    },
  },
  createExpenseMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

vi.mock('@/lib/skills', () => ({
  skills: { create_expense: (...args: any[]) => createExpenseMock(...args) },
}))

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: Request) =>
    handler(request, {
      valid: true,
      tenant: { id: 'tenant-1' },
      user: { id: 'user-1' },
      db: {
        user: {
          findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }),
        },
      },
    }),
}))

import { POST } from '@/app/api/erp/expenses/import/route'

// ─── Fixture: libro XLSX con las columnas del resumen ─────────────────────

function buildWorkbookBuffer(rows: any[][]): Buffer {
  const aoa = [
    ['NOMBRE', 'C.I.F.', 'FECHA', 'Nº FRA.', 'BASE 21%', 'BASE 10%', 'BASE 7,5%', 'BASE 5%', 'BASE 4%', 'BASE 2%', 'BASE 0%', 'IVA', 'TOTAL'],
    ...rows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function makeRequest(buffer: Buffer, mode: string): Request {
  const req = new Request(`http://localhost/api/erp/expenses/import?mode=${mode}`, { method: 'POST' })
  const fakeFile = {
    name: 'gastos.xlsx',
    size: buffer.length,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arrayBuffer: async () => new Uint8Array(buffer).buffer,
  }
  // La ruta lee el archivo de formData.get('file'); sobreescribimos formData
  // para evitar depender del FormData/File globales del entorno de Node.
  ;(req as any).formData = async () => ({ get: (k: string) => (k === 'file' ? fakeFile : null) })
  return req
}

const SUPPLIER_1 = { id: 'sup-1', name: 'SUMINISTROS SL', taxId: 'B12345678', createdAt: new Date('2024-01-01') }

describe('POST /api/erp/expenses/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.supplier.findFirst.mockResolvedValue(SUPPLIER_1)
    prismaMock.expense.findFirst.mockResolvedValue(null)
    createExpenseMock.mockResolvedValue({ id: 'exp-1' })
  })

  it('mode preview: analiza las columnas (nombre, CIF, fecha, nº fra., bases por tramo) sin crear nada', async () => {
    const buffer = buildWorkbookBuffer([
      ['SUMINISTROS GENERALES DEL SUR S.L.', 'B91234567', '12/08/2026', 'FRA-0001', 100, 50, '', '', '', '', '', 26, 176],
    ])

    const res = await POST(makeRequest(buffer, 'preview'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.mode).toBe('preview')
    expect(json.total).toBe(1)
    expect(createExpenseMock).not.toHaveBeenCalled()

    const row = json.rows[0]
    expect(row.ok).toBe(true)
    expect(row.supplierName).toBe('SUMINISTROS GENERALES DEL SUR S.L.')
    expect(row.supplierTaxId).toBe('B91234567')
    expect(row.invoiceNumber).toBe('FRA-0001')
    expect(row.preview.tramos).toEqual([
      { rate: 21, base: 100, amount: 21 },
      { rate: 10, base: 50, amount: 5 },
    ])
    expect(row.preview.taxableBase).toBe(150)
    expect(row.preview.vatAmount).toBe(26)
    expect(row.preview.total).toBe(176)
  })

  it('mode commit crea los gastos con desglose por tramos y salta duplicados', async () => {
    const buffer = buildWorkbookBuffer([
      ['Empresa A SL', 'A11111111', '01/01/2026', 'FA-1', 100, '', '', '', '', '', '', 21, 121],
      ['Empresa B SL', 'B22222222', '02/01/2026', 'FA-2', '', 50, '', '', '', '', '', 5, 55],
    ])
    // La segunda fila es duplicado (misma factura + proveedor)
    prismaMock.expense.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'exp-existente' })
    prismaMock.supplier.findFirst.mockResolvedValueOnce(SUPPLIER_1).mockResolvedValueOnce({
      id: 'sup-2', name: 'Empresa B SL', taxId: 'B22222222',
    })

    const res = await POST(makeRequest(buffer, 'commit'))
    const json = await res.json()

    expect(json.mode).toBe('commit')
    expect(json.imported).toBe(1)
    expect(json.duplicates).toBe(1)
    expect(createExpenseMock).toHaveBeenCalledTimes(1)

    const arg = createExpenseMock.mock.calls[0][0]
    expect(arg.supplierId).toBe('sup-1')
    expect(arg.invoiceNumber).toBe('FA-1')
    expect(arg.taxableBase).toBe(100)
    expect(arg.vatAmount).toBe(21)
    expect(arg.amount).toBe(121)
    expect(arg.vatBreakdown).toEqual([{ rate: 21, base: 100, amount: 21 }])
    expect(arg.vatRate).toBe(21)
    expect(arg.date).toBeInstanceOf(Date)
  })

  it('crea el proveedor nuevo si no existe por CIF ni nombre (commit)', async () => {
    const buffer = buildWorkbookBuffer([
      ['PROVEEDOR NUEVO SL', 'C33333333', '05/01/2026', 'F3', 200, '', '', '', '', '', '', 42, 242],
    ])
    prismaMock.supplier.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    prismaMock.supplier.create.mockResolvedValue({
      id: 'sup-nuevo', name: 'PROVEEDOR NUEVO SL', taxId: 'C33333333', createdAt: new Date(),
    })

    const res = await POST(makeRequest(buffer, 'commit'))
    const json = await res.json()

    expect(json.imported).toBe(1)
    expect(json.rows[0].supplierCreated).toBe(true)
    expect(prismaMock.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'PROVEEDOR NUEVO SL', taxId: 'C33333333', tenantId: 'tenant-1' }),
      }),
    )
  })

  it('detecta un fichero sin las columnas esperadas (422 + headerErrors)', async () => {
    const aoa = [
      ['EMPRESA', 'IMPORTE', 'NOTA'],
      ['X', '10', 'hola'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Datos')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const res = await POST(makeRequest(buffer, 'preview'))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.headerErrors.length).toBeGreaterThan(0)
    expect(json.headerErrors.join(' ')).toContain('BASE')
  })

  it('marca error la fila sin nombre de proveedor', async () => {
    const buffer = buildWorkbookBuffer([
      ['', 'B99999999', '05/01/2026', 'F-X', 10, '', '', '', '', '', '', 2.1, 12.1],
    ])

    const res = await POST(makeRequest(buffer, 'preview'))
    const json = await res.json()

    expect(json.total).toBe(1)
    expect(json.rows[0].ok).toBe(false)
    expect(json.rows[0].error).toContain('proveedor')
  })
})