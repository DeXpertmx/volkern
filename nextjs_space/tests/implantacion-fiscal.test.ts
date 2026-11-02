// @vitest-environment node
/**
 * Personalización del alta: impuestos, moneda y datos fiscales.
 *
 * Lo que se prueba es la promesa que se le hace al cliente: el tipo que se le
 * propone es el de **su** país y el de lo que vende, la moneda que le
 * corresponde se detecta (y se avisa cuando no coincide), y no se inventan
 * datos legales: si no hay país, no hay impuestos.
 */

import { describe, it, expect } from 'vitest'

import type { Descubrimiento } from '@/lib/implantacion/descubrimiento'
import {
  monedasOfrecidas,
  normalizarSeleccionFiscal,
  proponerFiscal,
  resumenFiscal,
  type ContextoFiscal,
} from '@/lib/implantacion/fiscal'

function descubrimiento(respuestas: Record<string, string | string[]>): Descubrimiento {
  return {
    respuestas: Object.fromEntries(
      Object.entries(respuestas).map(([id, valor]) => [id, Array.isArray(valor) ? valor : [valor]]),
    ) as Descubrimiento['respuestas'],
    noSe: [],
    notas: '',
    version: 1,
  }
}

const EMISOR_COMPLETO = {
  razonSocial: 'Estudio Norte SL',
  idFiscal: 'B12345678',
  direccion: 'Calle Mayor 1',
  ciudad: 'Madrid',
  codigoPostal: '28013',
  email: 'hola@estudionorte.es',
}

const ES: ContextoFiscal = { pais: 'ES', monedaActual: 'EUR', emisor: EMISOR_COMPLETO }

const propuestas = (d: Descubrimiento, ctx: ContextoFiscal) =>
  proponerFiscal(d, ctx)
    .tasas.filter((t) => t.propuesto)
    .map((t) => t.codigo)

describe('proponerFiscal — impuestos por país y por lo que vende', () => {
  it('propone el tipo general del país donde factura', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), ES)

    expect(propuesta.pais).toBe('ES')
    expect(propuestas(descubrimiento({ que_vende: 'servicios' }), ES)).toEqual(['IVA_ES_GENERAL'])

    const general = propuesta.tasas.find((t) => t.codigo === 'IVA_ES_GENERAL')
    expect(general?.porcentaje).toBe(21)
    expect(general?.porDefecto).toBe(true)
  })

  it('en alojamiento el tipo por defecto es el reducido, no el general', () => {
    const d = descubrimiento({ que_vende: 'alojamiento' })
    const propuesta = proponerFiscal(d, ES)

    expect(propuestas(d, ES)).toEqual(['IVA_ES_GENERAL', 'IVA_ES_REDUCIDO'])
    expect(propuesta.tasas.find((t) => t.codigo === 'IVA_ES_REDUCIDO')?.porDefecto).toBe(true)
    expect(propuesta.tasas.find((t) => t.codigo === 'IVA_ES_GENERAL')?.porDefecto).toBe(false)
  })

  it('no marca los tipos especiales: los enseña con lo que haría falta para usarlos', () => {
    const d = descubrimiento({ que_vende: 'productos' })
    const propuesta = proponerFiscal(d, ES)

    const superReducido = propuesta.tasas.find((t) => t.codigo === 'IVA_ES_SUPER_REDUCIDO')
    const exento = propuesta.tasas.find((t) => t.codigo === 'IVA_ES_EXENTO')

    expect(superReducido?.propuesto).toBe(false)
    expect(superReducido?.paraEncajar).toContain('superreducido')
    expect(exento?.propuesto).toBe(false)
    expect(exento?.porcentaje).toBe(0)
  })

  it('en México propone el 16 % y avisa de que el impuesto varía por estado', () => {
    const d = descubrimiento({ que_vende: 'productos' })
    const propuesta = proponerFiscal(d, { pais: 'MX', monedaActual: 'MXN', emisor: null })

    expect(propuesta.pais).toBe('MX')
    expect(propuesta.requiereEstado).toBe(true)
    expect(propuesta.tasas.find((t) => t.codigo === 'IVA_MX_GENERAL')?.porcentaje).toBe(16)
    expect(propuesta.avisos.join(' ')).toContain('estado')
  })

  it('sin país no inventa impuestos: lo dice y no propone ninguna tasa', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), {
      pais: null,
      monedaActual: 'MXN',
      emisor: null,
    })

    expect(propuesta.pais).toBeNull()
    expect(propuesta.tasas).toEqual([])
    expect(propuesta.avisos.join(' ')).toContain('Sin país fiscal')
    expect(propuesta.moneda.recomendada).toBeNull()
  })

  it('un país sin tipos cargados no recibe los de otro', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'productos' }), {
      pais: 'JP',
      monedaActual: 'USD',
      emisor: null,
    })

    expect(propuesta.tasas).toEqual([])
    expect(propuesta.avisos.join(' ')).toContain('No tenemos los tipos')
  })

  it('la retención de IRPF se explica como nota, no se crea como tasa', () => {
    const d = descubrimiento({ que_vende: 'servicios', a_quien: 'empresas' })
    const propuesta = proponerFiscal(d, ES)

    // No hay fila de retención: en esta plataforma se marca por línea.
    expect(propuesta.tasas.some((t) => t.codigo.includes('RETENCION'))).toBe(false)
    expect(propuesta.notas.join(' ')).toContain('IRPF')
    expect(propuesta.notas.join(' ')).toContain('asesoría')
  })
})

describe('proponerFiscal — moneda', () => {
  it('si la cuenta ya factura en la moneda del país, lo confirma', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), ES)

    expect(propuesta.moneda).toMatchObject({ actual: 'EUR', recomendada: 'EUR', coincide: true })
    expect(propuesta.moneda.motivo).toContain('factura en EUR, la moneda de España')
  })

  it('detecta la moneda heredada: euros de país con pesos en la cuenta', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), {
      pais: 'ES',
      monedaActual: 'MXN',
      emisor: null,
    })

    expect(propuesta.moneda.coincide).toBe(false)
    expect(propuesta.moneda.recomendada).toBe('EUR')
    expect(propuesta.moneda.motivo).toContain('moneda equivocada')
  })

  it('ofrece las monedas con su ficha, sin códigos sueltos en la pantalla', () => {
    const monedas = monedasOfrecidas()
    const eur = monedas.find((m) => m.codigo === 'EUR')

    expect(monedas.length).toBeGreaterThan(3)
    expect(eur?.nombre).toContain('Euro')
    expect(eur?.simbolo).toBe('€')
  })
})

describe('proponerFiscal — datos fiscales', () => {
  it('sin emisor dice los tres datos mínimos que faltan', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), {
      pais: 'ES',
      monedaActual: 'EUR',
      emisor: null,
    })

    expect(propuesta.faltanDatosEmisor).toEqual([
      'Razón social y NIF',
      'Dirección fiscal',
      'Email para la factura',
    ])
  })

  it('con emisor a medias lista exactamente lo que le falta', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), {
      ...ES,
      emisor: { ...EMISOR_COMPLETO, idFiscal: '  ', codigoPostal: null },
    })

    expect(propuesta.faltanDatosEmisor).toEqual(['NIF/CIF', 'Código postal'])
  })
})

describe('normalizarSeleccionFiscal', () => {
  const d = descubrimiento({ que_vende: 'servicios' })
  const propuesta = proponerFiscal(d, { ...ES, monedaActual: 'MXN' })

  it('sin nada elegido parte de la moneda del país, no de la heredada', () => {
    const { seleccion } = normalizarSeleccionFiscal({}, propuesta)
    expect(seleccion.moneda).toBe('EUR')
  })

  it('una moneda inventada no se aplica y se avisa', () => {
    const { seleccion, avisos } = normalizarSeleccionFiscal({ moneda: 'BTC', tasas: [] }, propuesta)

    expect(seleccion.moneda).toBe('EUR')
    expect(avisos.join(' ')).toContain('no es una moneda')
  })

  it('descarta tasas que no son de su país y respeta el orden de la propuesta', () => {
    const { seleccion, avisos } = normalizarSeleccionFiscal(
      { tasas: ['IVA_ES_EXENTO', 'IVA_MX_GENERAL', 'IVA_ES_GENERAL'] },
      propuesta,
    )

    expect(seleccion.tasas).toEqual(['IVA_ES_GENERAL', 'IVA_ES_EXENTO'])
    expect(avisos.join(' ')).toContain('IVA_MX_GENERAL')
  })

  it('sin impuestos y con país lo dice en vez de aplicar una lista vacía en silencio', () => {
    const { avisos } = normalizarSeleccionFiscal({ tasas: [] }, propuesta)
    expect(avisos.join(' ')).toContain('al menos el tipo general')
  })
})

describe('resumenFiscal', () => {
  it('avisa cuando la moneda cambia y lo cuenta con las tasas', () => {
    const propuesta = proponerFiscal(descubrimiento({ que_vende: 'servicios' }), ES)

    const igual = resumenFiscal({ moneda: 'EUR', tasas: ['IVA_ES_GENERAL'] }, propuesta)
    expect(igual.cambiaMoneda).toBe(false)
    expect(igual.texto).toContain('1 impuesto')

    const cambia = resumenFiscal({ moneda: 'USD', tasas: ['IVA_ES_GENERAL'] }, propuesta)
    expect(cambia.cambiaMoneda).toBe(true)
    expect(cambia.texto).toContain('moneda pasa a USD')
  })
})
