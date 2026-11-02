/**
 * Personalización del alta: marca y canales de captación (módulo puro).
 *
 * Lo que se prueba es lo que puede creerse el cliente al leer la pantalla: que
 * los canales propuestos salen de sus respuestas y no de una lista fija, que
 * sin respuesta no se inventa un canal, que el nombre comercial que ya firma no
 * se pisa, y que un color o un canal inválidos no llegan a la cuenta.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import type { Descubrimiento } from '@/lib/implantacion/descubrimiento'
import {
  CANALES_CAPTACION,
  MAX_NOMBRE_MARCA,
  normalizarColor,
  normalizarSeleccionMarcaCanales,
  proponerCanales,
  proponerMarca,
  resumenMarcaCanales,
  type ContextoMarca,
  type PropuestaMarca,
} from '@/lib/implantacion/marca-canales'

function desc(respuestas: Record<string, string[]>, noSe: string[] = []): Descubrimiento {
  return { respuestas, noSe: noSe as Descubrimiento['noSe'], notas: '', version: 1 }
}

const MARCA_VACIA: ContextoMarca = {
  nombreCuenta: 'Estudio Norte',
  nombreComercial: null,
  colorActual: null,
  tieneLogo: false,
}

describe('canales de captación — la propuesta sale del perfil', () => {
  it('propone los canales que el cliente ya reconoce como fuente de trabajo', () => {
    const { canales, origenDeclarado } = proponerCanales(
      desc({ origen: ['referidos', 'web', 'llamadas'] }),
    )

    expect(origenDeclarado).toEqual(['referidos', 'web', 'llamadas'])
    expect(canales.find((c) => c.id === 'referido')?.propuesto).toBe(true)
    expect(canales.find((c) => c.id === 'web')?.propuesto).toBe(true)
    expect(canales.find((c) => c.id === 'telefono')?.propuesto).toBe(true)
    expect(canales.find((c) => c.id === 'evento')?.propuesto).toBe(false)
    // Lo que no se propone dice qué haría falta para encajarlo.
    expect(canales.find((c) => c.id === 'evento')?.paraEncajar).toBeTruthy()
  })

  it('un partner se registra en el canal referido y su nombre va en «fuente»', () => {
    const referido = proponerCanales(desc({ origen: ['partners'] })).canales.find(
      (c) => c.id === 'referido',
    )

    expect(referido?.propuesto).toBe(true)
    expect(referido?.motivo).toContain('fuente')
  })

  it('sin respuesta de origen no se adivina un canal: propone los dos universales y lo dice', () => {
    const { canales, avisos } = proponerCanales(desc({ que_vende: ['servicios'] }))

    expect(canales.filter((c) => c.propuesto).map((c) => c.id)).toEqual(['referido', 'web'])
    expect(avisos.join(' ')).toContain('no de tu respuesta')
  })

  it('«no lo sé» en el origen también se avisa, con sus palabras', () => {
    const { avisos } = proponerCanales(desc({}, ['origen']))
    expect(avisos.join(' ')).toContain('no lo sé')
  })

  it('los leads que ya existen en la cuenta cuentan como canal en uso', () => {
    const canales = proponerCanales(desc({ origen: ['web'] }), {
      leadsPorCanal: { evento: 4, web: 12 },
    }).canales

    const evento = canales.find((c) => c.id === 'evento')
    expect(evento?.propuesto).toBe(true)
    expect(evento?.leads).toBe(4)
    expect(evento?.motivo).toContain('Ya tienes leads')
  })

  it('el dolor por leads fríos pone el formulario aunque no lo haya marcado', () => {
    const web = proponerCanales(desc({ origen: ['referidos'], dolor: ['leads_frios'] })).canales.find(
      (c) => c.id === 'web',
    )

    expect(web?.propuesto).toBe(true)
    expect(web?.motivo).toContain('enfrían')
  })

  it('si hoy gestiona clientes por WhatsApp, se propone conectarlo', () => {
    const whatsapp = proponerCanales(
      desc({ origen: ['referidos'], herramienta: ['whatsapp'] }),
    ).canales.find((c) => c.id === 'whatsapp')

    expect(whatsapp?.propuesto).toBe(true)
    expect(whatsapp?.motivo).toContain('histórico')
  })

  it('LinkedIn solo cuando vende a empresas con ciclo largo', () => {
    const largo = proponerCanales(desc({ origen: ['web'], a_quien: ['empresas'], ciclo: ['1_3m'] }))
    expect(largo.canales.find((c) => c.id === 'linkedin')?.propuesto).toBe(true)

    const corto = proponerCanales(desc({ origen: ['web'], a_quien: ['particulares'], ciclo: ['menos_7d'] }))
    expect(corto.canales.find((c) => c.id === 'linkedin')?.propuesto).toBe(false)
  })

  it('avisa de que la conversión por origen necesita más de un canal', () => {
    const { avisos } = proponerCanales(desc({ origen: ['web'], panel: ['conversion'] }))
    expect(avisos.join(' ')).toContain('conversión por origen')
  })

  it('todas las propuestas explican el motivo y todas las no propuestas dicen qué haría falta', () => {
    const canales = proponerCanales(desc({ origen: ['referidos', 'redes'] })).canales
    for (const canal of canales) {
      if (canal.propuesto) {
        expect(canal.motivo.length, `${canal.id} sin motivo`).toBeGreaterThan(0)
        expect(canal.paraEncajar).toBeNull()
      } else {
        expect(canal.paraEncajar, `${canal.id} sin salida`).toBeTruthy()
      }
    }
  })
})

describe('canales de captación — el catálogo es el que usa el alta de leads', () => {
  it('cada canal del alta existe en el desplegable de canal de origen', () => {
    // Guardia de divergencia: `Lead.canal` se escribe desde ese desplegable. Un
    // canal propuesto que no esté allí nace huérfano y no se puede atribuir.
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '..', 'components', 'leads-content.tsx'),
      'utf8',
    )

    for (const canal of CANALES_CAPTACION) {
      expect(fuente, `el alta propone «${canal.id}» y el alta de leads no lo ofrece`).toContain(
        `value="${canal.id}"`,
      )
    }
  })
})

describe('marca — el nombre y el color que se proponen', () => {
  it('sin nombre comercial propone el de la cuenta y dice qué le falta', () => {
    const propuesta = proponerMarca(desc({ que_vende: ['servicios'] }), MARCA_VACIA)

    expect(propuesta.nombre.propuesto).toBe('Estudio Norte')
    expect(propuesta.nombre.cambia).toBe(true)
    expect(propuesta.falta.join(' ')).toContain('Nombre comercial')
    expect(propuesta.falta.join(' ')).toContain('Logo')
  })

  it('el nombre comercial que ya firma no se pisa', () => {
    const propuesta = proponerMarca(desc({ que_vende: ['servicios'] }), {
      ...MARCA_VACIA,
      nombreComercial: 'Norte Legal',
      tieneLogo: true,
    })

    expect(propuesta.nombre.propuesto).toBe('Norte Legal')
    expect(propuesta.nombre.cambia).toBe(false)
    expect(propuesta.nombre.motivo).toContain('se mantiene')
    expect(propuesta.falta).toEqual([])
  })

  it('el color de partida depende de lo que vende y se puede cambiar', () => {
    expect(proponerMarca(desc({ que_vende: ['alojamiento'] }), MARCA_VACIA).color.propuesto).toBe('#0f766e')
    expect(proponerMarca(desc({ que_vende: ['servicios'] }), MARCA_VACIA).color.propuesto).toBe('#1d4ed8')

    const sinPerfil = proponerMarca(desc({}), MARCA_VACIA)
    expect(sinPerfil.color.propuesto).toBe('#3b82f6')
    expect(sinPerfil.color.motivo).toContain('se puede cambiar')
  })

  it('un color ya puesto manda, y la paleta no repite el elegido', () => {
    const propuesta = proponerMarca(desc({ que_vende: ['productos'] }), {
      ...MARCA_VACIA,
      colorActual: '#112233',
    })

    expect(propuesta.color.propuesto).toBe('#112233')
    expect(propuesta.color.motivo).toContain('se mantiene')
    // La paleta sigue empezando por el color del sector, para que cambiar de
    // idea sea un clic y no un hexadecimal inventado.
    expect(propuesta.paleta[0].hex).toBe('#b45309')
  })

  it('normaliza colores: cortos, sin almohadilla y basura', () => {
    expect(normalizarColor('#ABC')).toBe('#aabbcc')
    expect(normalizarColor('ff8800')).toBe('#ff8800')
    expect(normalizarColor('  #FF8800 ')).toBe('#ff8800')
    expect(normalizarColor('rojo')).toBeNull()
    expect(normalizarColor(null)).toBeNull()
  })
})

describe('selección de marca y canales — lo inválido no llega a la cuenta', () => {
  const propuesta: PropuestaMarca = proponerMarca(desc({ que_vende: ['servicios'] }), MARCA_VACIA)
  const canales = proponerCanales(desc({ origen: ['web', 'referidos'] })).canales

  it('descarta canales que no están en el catálogo y avisa', () => {
    const { seleccion, avisos } = normalizarSeleccionMarcaCanales(
      { nombre: 'Norte', color: '#1d4ed8', canales: ['web', 'tiktok'] },
      propuesta,
      canales,
    )

    expect(seleccion.canales).toEqual(['web'])
    expect(avisos.join(' ')).toContain('tiktok')
  })

  it('quita duplicados y respeta el orden del catálogo', () => {
    const { seleccion } = normalizarSeleccionMarcaCanales(
      { canales: ['evento', 'web', 'evento', 'referido'] },
      propuesta,
      canales,
    )

    expect(seleccion.canales).toEqual(['referido', 'web', 'evento'])
  })

  it('un color inválido no se escribe y se queda el propuesto', () => {
    const { seleccion, avisos } = normalizarSeleccionMarcaCanales(
      { color: 'azul marino' },
      propuesta,
      canales,
    )

    expect(seleccion.color).toBe(propuesta.color.propuesto)
    expect(avisos.join(' ')).toContain('no es un color válido')
  })

  it('un nombre vacío no deja los documentos sin firma', () => {
    const { seleccion, avisos } = normalizarSeleccionMarcaCanales({ nombre: '   ' }, propuesta, canales)

    expect(seleccion.nombre).toBe(propuesta.nombre.propuesto)
    expect(avisos.join(' ')).toContain('no puede ir vacío')
  })

  it('un nombre larguísimo se recorta al tope', () => {
    const largo = 'A'.repeat(MAX_NOMBRE_MARCA + 20)
    const { seleccion, avisos } = normalizarSeleccionMarcaCanales({ nombre: largo }, propuesta, canales)

    expect(seleccion.nombre).toHaveLength(MAX_NOMBRE_MARCA)
    expect(avisos.join(' ')).toContain('recortado')
  })

  it('sin ningún canal avisa de que no hay de dónde entren leads', () => {
    const { avisos } = normalizarSeleccionMarcaCanales({ canales: [] }, propuesta, canales)
    expect(avisos.join(' ')).toContain('Sin ningún canal')
  })
})

describe('resumen de la pieza', () => {
  const propuesta: PropuestaMarca = proponerMarca(desc({ que_vende: ['servicios'] }), MARCA_VACIA)

  it('dice qué cambia y con cuántos canales', () => {
    const resumen = resumenMarcaCanales(
      { nombre: 'Norte Legal', color: '#1d4ed8', canales: ['web', 'referido'] },
      propuesta,
    )

    expect(resumen.canales).toBe(2)
    expect(resumen.nombreCambia).toBe(true)
    expect(resumen.texto).toContain('2 canales de captación')
  })

  it('no finge cambios cuando la marca ya está como el cliente la quiere', () => {
    const conMarca = proponerMarca(desc({ que_vende: ['servicios'] }), {
      ...MARCA_VACIA,
      nombreComercial: 'Norte Legal',
      colorActual: '#1d4ed8',
    })
    const resumen = resumenMarcaCanales({ nombre: 'Norte Legal', color: '#1d4ed8', canales: [] }, conMarca)

    expect(resumen.nombreCambia).toBe(false)
    expect(resumen.texto).toContain('ya está como la tienes')
  })
})
