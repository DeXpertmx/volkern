import { describe, it, expect } from 'vitest'
import {
  TOLERANCIA_MINIMA,
  TOLERANCIA_RELATIVA,
  candidatoDesdePedido,
  describirCandidato,
  diferenciaDeImporte,
  emparejarFactura,
  importesCompatibles,
  monedasCompatibles,
  normalizarMoneda,
  ordenarCandidatos,
  toleranciaDeConciliacion,
  type CandidatoConciliacion,
} from '@/lib/compras/conciliacion'

function candidato(parcial: Partial<CandidatoConciliacion>): CandidatoConciliacion {
  return {
    compraId: 'c1',
    numero: 'OC-2026-0001',
    proveedorId: 'p1',
    proveedorNombre: 'Proveedor',
    importePedido: 121,
    moneda: 'EUR',
    fechaRecepcion: '2026-10-01T10:00:00.000Z',
    diferencia: 0,
    exacto: true,
    ...parcial,
  }
}

describe('Conciliación · margen de importes', () => {
  it('los pedidos pequeños usan el suelo absoluto, no el 1 %', () => {
    expect(toleranciaDeConciliacion(10)).toBe(TOLERANCIA_MINIMA)
    expect(toleranciaDeConciliacion(0)).toBe(TOLERANCIA_MINIMA)
  })

  it('en importes grandes manda el porcentaje', () => {
    expect(toleranciaDeConciliacion(10_000)).toBe(10_000 * TOLERANCIA_RELATIVA)
  })

  it('un céntimo de redondeo no separa un pedido de su factura', () => {
    expect(importesCompatibles(121, 121.01)).toBe(true)
    expect(importesCompatibles(121, 120.99)).toBe(true)
  })

  it('un 2 % de diferencia ya no cuadra: puede ser un porte o un error', () => {
    expect(importesCompatibles(1000, 980)).toBe(false)
  })

  it('la diferencia lleva signo: negativa cuando la factura es mayor', () => {
    expect(diferenciaDeImporte(121, 120)).toBe(1)
    expect(diferenciaDeImporte(120, 121)).toBe(-1)
  })

  it('un importe corrupto no cuadra con nada, en vez de colarse', () => {
    // `NaN` se lee como 0: un pedido sin total utilizable no debe emparejarse
    // con la primera factura que pase. El lado seguro es no conciliar.
    expect(importesCompatibles(Number.NaN, 100)).toBe(false)
    expect(diferenciaDeImporte(Number.NaN, 100)).toBe(-100)
  })
})

describe('Conciliación · divisas', () => {
  it('normaliza antes de comparar', () => {
    expect(normalizarMoneda(' eur ')).toBe('EUR')
    expect(monedasCompatibles('eur', 'EUR')).toBe(true)
  })

  it('no concilia una factura en otra divisa', () => {
    expect(monedasCompatibles('USD', 'EUR')).toBe(false)
  })

  it('sin divisa declarada no se descarta el candidato', () => {
    expect(monedasCompatibles(null, 'EUR')).toBe(true)
    expect(monedasCompatibles(undefined, undefined)).toBe(true)
  })
})

describe('Conciliación · candidato', () => {
  it('marca exacto sólo cuando cuadra al céntimo', () => {
    const exacto = candidatoDesdePedido({
      compraId: 'c1',
      numero: 'OC-2026-0001',
      importePedido: 121,
      importeFactura: 121,
    })
    expect(exacto.exacto).toBe(true)
    expect(exacto.diferencia).toBe(0)
  })

  it('con diferencia admisible deja de ser exacto y la cifra', () => {
    const casi = candidatoDesdePedido({
      compraId: 'c1',
      numero: 'OC-2026-0001',
      importePedido: 121,
      importeFactura: 121.2,
    })
    expect(casi.exacto).toBe(false)
    expect(casi.diferencia).toBe(-0.2)
  })

  it('serializa la fecha de recepción en ISO', () => {
    const fecha = new Date('2026-09-30T08:15:00.000Z')
    expect(
      candidatoDesdePedido({
        compraId: 'c1',
        numero: 'OC-2026-0001',
        importePedido: 10,
        importeFactura: 10,
        fechaRecepcion: fecha,
      }).fechaRecepcion
    ).toBe('2026-09-30T08:15:00.000Z')
  })

  it('un pedido sin fecha de recepción no inventa una', () => {
    expect(
      candidatoDesdePedido({
        compraId: 'c1',
        numero: 'OC-2026-0001',
        importePedido: 10,
        importeFactura: 10,
        fechaRecepcion: null,
      }).fechaRecepcion
    ).toBeNull()
  })
})

describe('Conciliación · decisión', () => {
  it('sin candidatos la factura es un gasto nuevo', () => {
    expect(emparejarFactura([])).toEqual({ estado: 'ninguna' })
  })

  it('una única coincidencia exacta se concilia sola', () => {
    const resultado = emparejarFactura([candidato({ compraId: 'c1' })])
    expect(resultado.estado).toBe('automatica')
  })

  it('dos pedidos del mismo importe no se adivinan', () => {
    const resultado = emparejarFactura([
      candidato({ compraId: 'c1', numero: 'OC-2026-0001' }),
      candidato({ compraId: 'c2', numero: 'OC-2026-0002' }),
    ])
    expect(resultado.estado).toBe('revisar')
    if (resultado.estado === 'revisar') {
      expect(resultado.candidatos.map((c) => c.compraId)).toEqual(['c1', 'c2'])
    }
  })

  it('una coincidencia exacta manda sobre otras aproximadas', () => {
    const resultado = emparejarFactura([
      candidato({ compraId: 'aprox', exacto: false, diferencia: 0.4 }),
      candidato({ compraId: 'exacta' }),
    ])
    expect(resultado.estado).toBe('automatica')
    if (resultado.estado === 'automatica') {
      expect(resultado.candidato.compraId).toBe('exacta')
    }
  })

  it('una sola coincidencia aproximada se propone, no se aplica', () => {
    const resultado = emparejarFactura([candidato({ compraId: 'c1', exacto: false, diferencia: 0.4 })])
    expect(resultado.estado).toBe('revisar')
  })
})

describe('Conciliación · presentación', () => {
  it('ordena exactos primero y luego por cercanía', () => {
    const ordenados = ordenarCandidatos([
      candidato({ compraId: 'lejos', exacto: false, diferencia: -0.4 }),
      candidato({ compraId: 'exacta' }),
      candidato({ compraId: 'cerca', exacto: false, diferencia: 0.1 }),
    ])
    expect(ordenados.map((c) => c.compraId)).toEqual(['exacta', 'cerca', 'lejos'])
  })

  it('describe la diferencia en el sentido correcto', () => {
    expect(describirCandidato(candidato({ exacto: true }))).toBe('OC-2026-0001')
    expect(describirCandidato(candidato({ exacto: false, diferencia: 12.4 }))).toContain('el pedido es mayor en 12.40')
    expect(describirCandidato(candidato({ exacto: false, diferencia: -12.4 }))).toContain('la factura es mayor en 12.40')
  })
})
