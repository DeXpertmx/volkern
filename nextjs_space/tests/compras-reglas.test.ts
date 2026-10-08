import { describe, it, expect } from 'vitest'
import {
  calcularLinea,
  calcularTotales,
  categoriaGastoDeCompra,
  esEstadoCompra,
  estadoTrasRecepcion,
  estaCompleta,
  estaPendienteDeRecepcion,
  numeroCompra,
  pendienteDeLinea,
  pendienteDeRecepcion,
  puedeTransicionar,
  redondear2,
  secuenciaDeNumero,
  siguienteNumeroCompra,
  validarRecepcionDeLinea,
} from '@/lib/compras/reglas'

describe('Compras · importes', () => {
  it('calcula subtotal, IVA y total de una línea', () => {
    expect(calcularLinea({ cantidad: 3, precioUnitario: 12.5, porcentajeImpuesto: 21 })).toEqual({
      subtotal: 37.5,
      montoImpuesto: 7.88,
      total: 45.38,
    })
  })

  it('usa el 21% por defecto y admite líneas exentas', () => {
    expect(calcularLinea({ cantidad: 1, precioUnitario: 100 }).montoImpuesto).toBe(21)
    expect(calcularLinea({ cantidad: 1, precioUnitario: 100, porcentajeImpuesto: 0 }).montoImpuesto).toBe(0)
    expect(calcularLinea({ cantidad: 2, precioUnitario: 50, porcentajeImpuesto: 10 }).montoImpuesto).toBe(10)
  })

  it('redondea cada línea antes de sumar, para que el total cuadre con la pantalla', () => {
    const lineas = [
      { cantidad: 3, precioUnitario: 0.335 }, // 1,005 → 1,00 en línea
      { cantidad: 1, precioUnitario: 10 },
    ]
    const totales = calcularTotales(lineas)
    const sumaLineas = lineas.reduce((acc, l) => acc + calcularLinea(l).total, 0)
    expect(totales.subtotal).toBe(redondear2(sumaLineas - calcularLinea(lineas[0]).montoImpuesto - calcularLinea(lineas[1]).montoImpuesto))
    expect(totales.total).toBe(redondear2(sumaLineas))
  })

  it('un pedido sin líneas vale cero, no NaN', () => {
    expect(calcularTotales([])).toEqual({ subtotal: 0, totalImpuestos: 0, total: 0 })
  })

  it('el total es subtotal más impuestos', () => {
    const t = calcularTotales([
      { cantidad: 2, precioUnitario: 100, porcentajeImpuesto: 21 },
      { cantidad: 1, precioUnitario: 50, porcentajeImpuesto: 10 },
    ])
    expect(t.subtotal).toBe(250)
    expect(t.totalImpuestos).toBe(47)
    expect(t.total).toBe(297)
  })
})

describe('Compras · ciclo de estados', () => {
  it('un borrador solo puede enviarse o cancelarse', () => {
    expect(puedeTransicionar('borrador', 'enviada')).toBe(true)
    expect(puedeTransicionar('borrador', 'cancelada')).toBe(true)
    expect(puedeTransicionar('borrador', 'recibida')).toBe(false)
    expect(puedeTransicionar('borrador', 'parcial')).toBe(false)
  })

  it('una orden recibida es final: no vuelve a borrador ni se cancela', () => {
    expect(puedeTransicionar('recibida', 'borrador')).toBe(false)
    expect(puedeTransicionar('recibida', 'cancelada')).toBe(false)
    expect(puedeTransicionar('recibida', 'parcial')).toBe(false)
  })

  it('una cancelada no revive', () => {
    expect(puedeTransicionar('cancelada', 'borrador')).toBe(false)
    expect(puedeTransicionar('cancelada', 'enviada')).toBe(false)
  })

  it('solo se recibe sobre lo enviado o lo parcial', () => {
    expect(estaPendienteDeRecepcion('enviada')).toBe(true)
    expect(estaPendienteDeRecepcion('parcial')).toBe(true)
    expect(estaPendienteDeRecepcion('borrador')).toBe(false)
    expect(estaPendienteDeRecepcion('recibida')).toBe(false)
    expect(estaPendienteDeRecepcion('cancelada')).toBe(false)
  })

  it('reconoce sus propios estados y rechaza cualquier otro', () => {
    expect(esEstadoCompra('parcial')).toBe(true)
    expect(esEstadoCompra('PARCIAL')).toBe(false)
    expect(esEstadoCompra('entregada')).toBe(false)
    expect(esEstadoCompra(undefined)).toBe(false)
  })
})

describe('Compras · recepción', () => {
  it('el estado sale de lo recibido, no de lo que se pida', () => {
    expect(estadoTrasRecepcion([{ cantidad: 10, cantidadRecibida: 10 }])).toBe('recibida')
    expect(estadoTrasRecepcion([{ cantidad: 10, cantidadRecibida: 4 }])).toBe('parcial')
    expect(
      estadoTrasRecepcion([
        { cantidad: 10, cantidadRecibida: 10 },
        { cantidad: 2, cantidadRecibida: 1 },
      ])
    ).toBe('parcial')
  })

  it('un pedido sin líneas no se considera completo', () => {
    expect(estaCompleta([])).toBe(false)
    expect(estadoTrasRecepcion([])).toBe('parcial')
  })

  it('calcula lo que falta por recibir', () => {
    const lineas = [
      { cantidad: 10, cantidadRecibida: 4 },
      { cantidad: 3, cantidadRecibida: 0 },
    ]
    expect(pendienteDeLinea(lineas[0])).toBe(6)
    expect(pendienteDeRecepcion(lineas)).toBe(9)
  })

  it('nunca devuelve pendientes negativos (una línea de más no resta)', () => {
    expect(pendienteDeLinea({ cantidad: 2, cantidadRecibida: 5 })).toBe(0)
  })

  it('rechaza cantidades imposibles', () => {
    const linea = { cantidad: 10, cantidadRecibida: 4 }
    expect(validarRecepcionDeLinea(linea, 0)).toMatch(/mayor que cero/)
    expect(validarRecepcionDeLinea(linea, -1)).toMatch(/mayor que cero/)
    expect(validarRecepcionDeLinea(linea, Number.NaN)).toMatch(/mayor que cero/)
    expect(validarRecepcionDeLinea(linea, 7)).toMatch(/solo faltan 6/)
  })

  it('acepta lo que cabe, incluido el resto exacto', () => {
    expect(validarRecepcionDeLinea({ cantidad: 10, cantidadRecibida: 4 }, 6)).toBeNull()
    expect(validarRecepcionDeLinea({ cantidad: 10, cantidadRecibida: 4 }, 1)).toBeNull()
  })

  it('rechaza recibir una línea ya completa', () => {
    expect(validarRecepcionDeLinea({ cantidad: 10, cantidadRecibida: 10 }, 1)).toMatch(/ya está recibida/)
  })
})

describe('Compras · coste contable', () => {
  it('un pedido con existencias es mercaderías (600)', () => {
    expect(categoriaGastoDeCompra([{ catalogoItemId: 'item_1' }])).toBe('mercaderias')
  })

  it('un pedido de servicios sin artículo de almacén no va a mercaderías', () => {
    expect(categoriaGastoDeCompra([{ catalogoItemId: null }, { catalogoItemId: null }])).toBe('otros')
  })
})

describe('Compras · numeración', () => {
  it('numera con prefijo, año y cuatro dígitos', () => {
    expect(numeroCompra(2026, 7)).toBe('OC-2026-0007')
    expect(numeroCompra(2026, 1234)).toBe('OC-2026-1234')
  })

  it('continúa la serie del año ignorando huecos y años anteriores', () => {
    expect(siguienteNumeroCompra(['OC-2026-0003', 'OC-2025-0099', 'OC-2026-0001'], 2026)).toBe('OC-2026-0004')
  })

  it('empieza en 1 cuando no hay ninguna del año', () => {
    expect(siguienteNumeroCompra([], 2026)).toBe('OC-2026-0001')
    expect(siguienteNumeroCompra(['OC-2025-0042'], 2026)).toBe('OC-2026-0001')
  })

  it('no confunde números de otros años ni con otra forma', () => {
    expect(secuenciaDeNumero('OC-2025-0009', 2026)).toBeNull()
    expect(secuenciaDeNumero('OV-2026-0009', 2026)).toBeNull()
    expect(secuenciaDeNumero('OC-2026-abc', 2026)).toBeNull()
    expect(secuenciaDeNumero('OC-2026-0009', 2026)).toBe(9)
  })
})
