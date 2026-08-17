import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async () =>
    handler(new Request('http://localhost/api/erp/expenses/import/template'), {
      valid: true,
      tenant: { id: 'tenant-1' },
      user: { id: 'user-1' },
    }),
}))

import { GET } from '@/app/api/erp/expenses/import/template/route'

describe('GET /api/erp/expenses/import/template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve un XLSX descargable con las columnas esperadas y filas de ejemplo', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml.sheet')
    expect(res.headers.get('Content-Disposition')).toContain('plantilla-gastos.xlsx')

    const buf = Buffer.from(await res.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })

    // Primera hoja: cabecera + 3 ejemplos
    const ws = wb.Sheets['Gastos']
    expect(ws).toBeDefined()
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]

    expect(aoa[0]).toEqual([
      'NOMBRE', 'C.I.F.', 'FECHA', 'Nº FRA.',
      'BASE 21%', 'BASE 10%', 'BASE 7,5%', 'BASE 5%', 'BASE 4%', 'BASE 2%', 'BASE 0%',
      'IVA', 'TOTAL',
    ])
    expect(aoa.length).toBe(4)
    expect(aoa[1][0]).toContain('SUMINISTROS')
    // Fecha como serial de Excel
    expect(typeof aoa[1][2]).toBe('number')
    // Importes con formato
    expect(aoa[1][4]).toBe(1000)
    expect(aoa[1][11]).toBe(210)
    expect(aoa[1][12]).toBe(1210)
    // Ejemplo mixto: 10% y 4%
    expect(aoa[2][5]).toBe(500)
    expect(aoa[2][8]).toBe(100)
    expect(aoa[2][11]).toBe(54)
    expect(aoa[2][12]).toBe(654)
    // Ejemplo exento 0%
    expect(aoa[3][10]).toBe(200)
    expect(aoa[3][12]).toBe(200)
  })

  it('incluye una hoja de instrucciones', async () => {
    const res = await GET()
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Instrucciones')
    const instr = XLSX.utils.sheet_to_json(wb.Sheets['Instrucciones'], { header: 1 })
    const flat = instr.flat().join(' ')
    expect(flat).toContain('BASE')
    expect(flat).toContain('FECHA')
  })
})