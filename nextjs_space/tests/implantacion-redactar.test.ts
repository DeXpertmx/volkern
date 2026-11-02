// @vitest-environment node
/**
 * Redacción de la propuesta con IA (R3).
 *
 * Lo que se prueba es el contrato que protege la pantalla: la salida del
 * modelo se valida antes de entrar, y cuando el proveedor falla, tarda o
 * devuelve basura el alta sigue con los motivos plantilla. La IA mejora el
 * texto; no puede ser un requisito para avanzar.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  REDACCION_VACIA,
  aplicarRedaccion,
  leerRedaccion,
  parsearRedaccion,
  redactarPropuesta,
} from '@/lib/implantacion/redactar'
import type { Recomendacion } from '@/lib/implantacion/recomendar'
import type { Descubrimiento } from '@/lib/implantacion/descubrimiento'

const recomendacion = (over: Partial<Recomendacion> = {}): Recomendacion => ({
  modulos: [
    {
      id: 'catalogo',
      etiqueta: 'Catálogo',
      icono: 'package',
      motivo: 'Servicios con tarifa y alcance, para no inventar precio en cada llamada.',
      requisito: 'Lista de productos o servicios con precio y unidad.',
      limite: null,
      incluidoEnPlan: true,
      peso: 0.8,
      senales: ['vende_servicios'],
    },
    {
      id: 'cotizaciones',
      etiqueta: 'Cotizaciones',
      icono: 'file-text',
      motivo: 'El alcance del servicio en una propuesta con validez y condiciones.',
      requisito: 'Catálogo cargado e impuestos configurados.',
      limite: 'No hace firma electrónica cualificada.',
      incluidoEnPlan: true,
      peso: 0.75,
      senales: ['vende_servicios'],
    },
  ],
  nucleo: { ids: ['leads'], nota: 'Lo básico ya viene encendido.' },
  embudo: { nombre: 'Ventas', etapas: [] },
  informes: ['embudo_etapas'],
  plantillas: ['cotizacion'],
  riesgos: ['Vendes a empresas y cierras en menos de 7 días: el embudo puede quedarse corto.'],
  limites: { plan: 'basico', embudos: 1, usuarios: 5 },
  preguntasSinResponder: [],
  omitidos: 0,
  ...over,
})

const descubrimiento = (over: Partial<Descubrimiento> = {}): Descubrimiento => ({
  respuestas: {
    que_vende: ['servicios'],
    a_quien: ['empresas'],
    ciclo: ['menos_7d'],
  },
  noSe: [],
  notas: '',
  version: 1,
  ...over,
})

const respuesta = (contenido: string) =>
  ({ choices: [{ message: { content: contenido, role: 'assistant' }, finish_reason: 'stop' }] }) as any

describe('parsearRedaccion · la salida del modelo se valida', () => {
  it('acepta JSON envuelto en cercas de markdown', () => {
    const texto = '```json\n{"motivos":{"catalogo":"Tu tarifa de servicios a mano, sin inventar precios en cada llamada."},"contradicciones":[]}\n```'

    const redaccion = parsearRedaccion(texto, ['catalogo', 'cotizaciones'])

    expect(redaccion?.motivos.catalogo).toBe(
      'Tu tarifa de servicios a mano, sin inventar precios en cada llamada.',
    )
    expect(redaccion?.fuente).toBe('ia')
  })

  it('ignora módulos que no están en la propuesta', () => {
    const texto = '{"motivos":{"inventado":"Un módulo que el motor nunca propuso en esta cuenta."},"contradicciones":[]}'

    expect(parsearRedaccion(texto, ['catalogo'])).toBeNull()
  })

  it('descarta motivos vacíos, con solo espacios o demasiado cortos', () => {
    const texto = '{"motivos":{"catalogo":"  ","cotizaciones":"Corto"},"contradicciones":[]}'

    expect(parsearRedaccion(texto, ['catalogo', 'cotizaciones'])).toBeNull()
  })

  it('no rompe con texto que no es JSON', () => {
    expect(parsearRedaccion('Lo siento, no puedo ayudarte con eso.', ['catalogo'])).toBeNull()
    expect(parsearRedaccion('{"motivos":', ['catalogo'])).toBeNull()
    expect(parsearRedaccion('[]', ['catalogo'])).toBeNull()
  })

  it('recorta a una línea y acota la longitud del motivo', () => {
    const largo = `Primera línea.\nSegunda línea ${'palabra '.repeat(80)}`
    const redaccion = parsearRedaccion(
      JSON.stringify({ motivos: { catalogo: largo }, contradicciones: [] }),
      ['catalogo'],
    )

    expect(redaccion?.motivos.catalogo).not.toContain('\n')
    expect(redaccion!.motivos.catalogo.length).toBeLessThanOrEqual(240)
  })

  it('se queda con tres contradicciones como mucho y sin repetirlas', () => {
    const redaccion = parsearRedaccion(
      JSON.stringify({
        motivos: { catalogo: 'Tu catálogo con tarifa, para cotizar sin inventar precios.' },
        contradicciones: ['Uno.', 'Dos.', 'uno.', 'Tres.', 'Cuatro.'],
      }),
      ['catalogo'],
    )

    expect(redaccion?.contradicciones).toEqual(['Uno.', 'Dos.', 'Tres.'])
  })

  it('si lo único que trae son contradicciones, las devuelve', () => {
    const redaccion = parsearRedaccion(
      JSON.stringify({ motivos: {}, contradicciones: ['Dices vender a empresas y cerrar en 3 días.'] }),
      ['catalogo'],
    )

    expect(redaccion?.motivos).toEqual({})
    expect(redaccion?.contradicciones).toHaveLength(1)
  })
})

describe('aplicarRedaccion · la propuesta no se muta', () => {
  it('cambia solo los motivos que trae la redacción', () => {
    const original = recomendacion()

    const propuesta = aplicarRedaccion(original, {
      motivos: { catalogo: 'Tu tarifa de servicios, para cotizar sin inventar precios.' },
      contradicciones: [],
      fuente: 'ia',
      generadoEn: '2026-11-02T10:00:00.000Z',
    })

    expect(propuesta.modulos[0].motivo).toBe('Tu tarifa de servicios, para cotizar sin inventar precios.')
    expect(propuesta.modulos[1].motivo).toBe(original.modulos[1].motivo)
    // El original sigue intacto: la recomendación guardada no se reescribe.
    expect(original.modulos[0].motivo).toBe(
      'Servicios con tarifa y alcance, para no inventar precio en cada llamada.',
    )
  })

  it('suma las contradicciones a los riesgos sin repetir las que ya estaban', () => {
    const propuesta = aplicarRedaccion(recomendacion(), {
      motivos: {},
      contradicciones: [
        'Vendes a empresas y cierras en menos de 7 días: El embudo puede quedarse corto.',
        'Dices que no usas nada y que vienes de otro CRM.',
      ],
      fuente: 'ia',
      generadoEn: null,
    })

    expect(propuesta.riesgos).toHaveLength(2)
    expect(propuesta.riesgos[1]).toBe('Dices que no usas nada y que vienes de otro CRM.')
  })

  it('sin redacción deja la propuesta como estaba', () => {
    const propuesta = aplicarRedaccion(recomendacion(), null)

    expect(propuesta.modulos[0].motivo).toBe(recomendacion().modulos[0].motivo)
    expect(propuesta.riesgos).toEqual(recomendacion().riesgos)
    expect(propuesta.redaccion).toEqual(REDACCION_VACIA)
  })

  it('olvida los motivos de módulos que ya no están en la propuesta', () => {
    const propuesta = aplicarRedaccion(recomendacion(), {
      motivos: { inventado: 'Un motivo guardado de una propuesta anterior que ya no aplica.' },
      contradicciones: [],
      fuente: 'ia',
      generadoEn: null,
    })

    expect(propuesta.modulos.map((m) => m.motivo)).toEqual(
      recomendacion().modulos.map((m) => m.motivo),
    )
  })
})

describe('redactarPropuesta · con el proveedor caído no se pierde nada', () => {
  it('si la llamada falla, devuelve la propuesta con los motivos plantilla', async () => {
    const llamar = vi.fn(async () => {
      throw new Error('Todos los modelos fallaron')
    })

    const propuesta = await redactarPropuesta(descubrimiento(), recomendacion(), { llamar: llamar as any })

    expect(propuesta.redaccion.fuente).toBe('plantilla')
    expect(propuesta.redaccion.motivos).toEqual({})
    expect(propuesta.modulos[0].motivo).toBe(recomendacion().modulos[0].motivo)
    expect(llamar).toHaveBeenCalledTimes(1)
  })

  it('si el modelo devuelve texto sin JSON, se queda el plantilla', async () => {
    const llamar = vi.fn(async () => respuesta('No puedo ayudarte con eso.'))

    const propuesta = await redactarPropuesta(descubrimiento(), recomendacion(), { llamar: llamar as any })

    expect(propuesta.redaccion.fuente).toBe('plantilla')
    expect(propuesta.modulos[0].motivo).toBe(recomendacion().modulos[0].motivo)
  })

  it('si el modelo devuelve una respuesta vacía, se queda el plantilla', async () => {
    const llamar = vi.fn(async () => respuesta('   '))

    const propuesta = await redactarPropuesta(descubrimiento(), recomendacion(), { llamar: llamar as any })

    expect(propuesta.redaccion.fuente).toBe('plantilla')
  })

  it('sin módulos propuestos no se llama al modelo', async () => {
    const llamar = vi.fn()

    const propuesta = await redactarPropuesta(descubrimiento(), recomendacion({ modulos: [] }), {
      llamar: llamar as any,
    })

    expect(llamar).not.toHaveBeenCalled()
    expect(propuesta.modulos).toEqual([])
  })

  it('usa los motivos del modelo cuando la salida es válida', async () => {
    const llamar = vi.fn(async () =>
      respuesta(
        JSON.stringify({
          motivos: {
            catalogo: 'Tu tarifa de servicios a mano, sin inventar precios en cada llamada.',
            cotizaciones: 'La propuesta sale con validez y condiciones, no con un PDF suelto.',
          },
          contradicciones: ['Dices vender a empresas y cerrar en menos de 7 días.'],
        }),
      ),
    )

    const propuesta = await redactarPropuesta(descubrimiento(), recomendacion(), {
      llamar: llamar as any,
      ahora: () => new Date('2026-11-02T10:00:00.000Z'),
    })

    expect(propuesta.redaccion.fuente).toBe('ia')
    expect(propuesta.redaccion.generadoEn).toBe('2026-11-02T10:00:00.000Z')
    expect(propuesta.modulos[0].motivo).toBe(
      'Tu tarifa de servicios a mano, sin inventar precios en cada llamada.',
    )
    expect(propuesta.riesgos).toContain('Dices vender a empresas y cerrar en menos de 7 días.')
  })

  it('manda solo opciones cerradas: las notas libres del cliente no salen del servidor', async () => {
    const llamar = vi.fn(async () => respuesta('{"motivos":{},"contradicciones":[]}'))

    await redactarPropuesta(
      descubrimiento({ notas: 'Llama a Marta, 600 123 123, y pregunta por la nave de Getafe.' }),
      recomendacion(),
      { llamar: llamar as any },
    )

    const mensajes = JSON.stringify(llamar.mock.calls[0][0])
    expect(mensajes).not.toContain('Marta')
    expect(mensajes).not.toContain('600 123 123')
    expect(mensajes).not.toContain('Getafe')
    // Lo que sí viaja: opciones del cuestionario y los módulos propuestos.
    expect(mensajes).toContain('Servicios')
    expect(mensajes).toContain('catalogo')
  })

  it('la llamada lleva un tiempo máximo: el alta no espera a un modelo colgado', async () => {
    const llamar = vi.fn(async () => respuesta('{"motivos":{},"contradicciones":[]}'))

    await redactarPropuesta(descubrimiento(), recomendacion(), { llamar: llamar as any })

    expect(llamar.mock.calls[0][1]).toBe(8000)
  })
})

describe('leerRedaccion · lo guardado se vuelve a validar al leerlo', () => {
  it('recupera motivos y contradicciones de la recomendación guardada', () => {
    const redaccion = leerRedaccion({
      modulos: [],
      redaccion: {
        motivos: { catalogo: 'Tu catálogo con tarifa, sin inventar precios.' },
        contradicciones: ['Dices vender a empresas y cerrar en 3 días.'],
        fuente: 'ia',
        generadoEn: '2026-11-02T10:00:00.000Z',
      },
    })

    expect(redaccion).toMatchObject({
      fuente: 'ia',
      generadoEn: '2026-11-02T10:00:00.000Z',
      motivos: { catalogo: 'Tu catálogo con tarifa, sin inventar precios.' },
    })
  })

  it('devuelve null si no hay redacción guardada o está vacía', () => {
    expect(leerRedaccion(null)).toBeNull()
    expect(leerRedaccion({ modulos: [] })).toBeNull()
    expect(leerRedaccion({ redaccion: { motivos: {}, contradicciones: [] } })).toBeNull()
    expect(leerRedaccion({ redaccion: 'texto' })).toBeNull()
  })
})
