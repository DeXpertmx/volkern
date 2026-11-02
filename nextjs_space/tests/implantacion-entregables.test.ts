// @vitest-environment node
/**
 * Selección de informes y plantillas del alta (contrato de R3).
 *
 * Lo que se cubre aquí es lo que puede romper la promesa «no aterrices en un
 * panel vacío»: que una selección inválida no se cuele, que los mínimos se
 * completen sin inventar, y que un informe sin datos se comporte como estado
 * vacío guiado y no como un cero con aspecto de dato.
 */

import { describe, it, expect } from 'vitest'
import {
  INFORMES_ENTREGABLES,
  MAX_INFORMES,
  MAX_PLANTILLAS,
  MIN_INFORMES,
  MIN_PLANTILLAS,
  normalizarEntregables,
  resumenSeleccion,
  seleccionRecomendada,
} from '@/lib/implantacion/entregables'
import { calcularInformes, type DatosInformes } from '@/lib/implantacion/informes-datos'

const RECOMENDADA = {
  informes: ['embudo_etapas', 'prevision_trimestral', 'oportunidades_sin_accion'],
  plantillas: ['email_primer_contacto', 'email_seguimiento', 'briefing_manana'],
}

const HOY = new Date('2026-10-31T10:00:00Z')

function datosVacios(): DatosInformes {
  return { moneda: 'EUR', deals: [], actividades: [], facturas: [], catalogo: [], hoy: HOY }
}

function deal(parcial: Partial<DatosInformes['deals'][number]>) {
  return {
    valor: 1000,
    valorReal: null,
    probabilidad: 50,
    etapa: 'Propuesta',
    estado: 'activo',
    fechaCreacion: new Date('2026-10-01T00:00:00Z'),
    fechaCierre: null,
    fechaEstimadaCierre: null,
    fechaUltimaActividad: new Date('2026-10-30T00:00:00Z'),
    origen: null,
    catalogoItemId: null,
    ...parcial,
  }
}

describe('seleccionRecomendada', () => {
  it('parte de la propuesta del motor, sin ids raros y dentro de topes', () => {
    const seleccion = seleccionRecomendada({
      informes: ['embudo_etapas', 'inventado', 'embudo_etapas', ...INFORMES_ENTREGABLES.map((i) => i.id)],
      plantillas: ['email_primer_contacto', 'no_existe'],
    })

    expect(seleccion.informes.length).toBeLessThanOrEqual(MAX_INFORMES)
    expect(seleccion.informes).not.toContain('inventado')
    expect(new Set(seleccion.informes).size).toBe(seleccion.informes.length)
    expect(seleccion.plantillas).toEqual(['email_primer_contacto'])
  })

  it('sin recomendación no inventa nada', () => {
    expect(seleccionRecomendada(null)).toEqual({ informes: [], plantillas: [] })
  })
})

describe('normalizarEntregables', () => {
  it('acepta una elección válida sin tocar nada', () => {
    const { seleccion, avisos } = normalizarEntregables(
      { informes: ['embudo_etapas', 'cobros_pendientes'], plantillas: ['email_primer_contacto'] },
      RECOMENDADA,
    )
    expect(seleccion).toEqual({
      informes: ['embudo_etapas', 'cobros_pendientes'],
      plantillas: ['email_primer_contacto'],
    })
    expect(avisos).toEqual([])
  })

  it('ignora ids fuera del catálogo y lo dice', () => {
    const { seleccion, avisos } = normalizarEntregables(
      { informes: ['embudo_etapas', 'informe_falso', 'cobros_pendientes'], plantillas: ['plantilla_falsa'] },
      RECOMENDADA,
    )
    expect(seleccion.informes).toEqual(['embudo_etapas', 'cobros_pendientes'])
    expect(seleccion.plantillas).toEqual(['email_primer_contacto']) // mínimo rellenado
    expect(avisos.join(' ')).toContain('informe_falso')
    expect(avisos.join(' ')).toContain('plantilla_falsa')
  })

  it('recorta por encima del tope de informes', () => {
    const cinco = ['embudo_etapas', 'prevision_trimestral', 'actividad_por_comercial', 'conversion_por_origen', 'tiempo_de_cierre']
    const { seleccion, avisos } = normalizarEntregables({ informes: cinco, plantillas: RECOMENDADA.plantillas }, RECOMENDADA)
    expect(seleccion.informes).toHaveLength(MAX_INFORMES)
    expect(seleccion.informes).not.toContain('tiempo_de_cierre')
    expect(avisos.some((a) => a.includes('Solo caben'))).toBe(true)
  })

  it('completa el mínimo desde la propuesta y avisa de que lo hace', () => {
    const { seleccion, avisos } = normalizarEntregables(
      { informes: ['cobros_pendientes'], plantillas: [] },
      RECOMENDADA,
    )
    expect(seleccion.informes).toHaveLength(MIN_INFORMES)
    expect(seleccion.informes[0]).toBe('cobros_pendientes')
    expect(seleccion.informes.slice(1)).toEqual(RECOMENDADA.informes.slice(0, MIN_INFORMES - 1))
    expect(seleccion.plantillas).toHaveLength(MIN_PLANTILLAS)
    expect(avisos.some((a) => a.includes('panel se queda vacío'))).toBe(true)
  })

  it('sin propuesta de la que tirar, avisa en vez de inventar', () => {
    const { seleccion, avisos } = normalizarEntregables(
      { informes: [], plantillas: [] },
      { informes: [], plantillas: [] },
    )
    expect(seleccion.informes).toEqual([])
    expect(seleccion.plantillas).toEqual([])
    expect(avisos.some((a) => a.includes('por debajo del mínimo'))).toBe(true)
  })

  it('no deja pasar más plantillas que el tope', () => {
    const { seleccion } = normalizarEntregables(
      { informes: RECOMENDADA.informes, plantillas: ['cotizacion', 'contrato_desde_cotizacion', 'email_primer_contacto', 'email_seguimiento', 'briefing_manana'] },
      RECOMENDADA,
    )
    expect(seleccion.plantillas).toHaveLength(MAX_PLANTILLAS)
  })
})

describe('resumenSeleccion', () => {
  it('distingue las plantillas que se crean solas de las manuales', () => {
    const resumen = resumenSeleccion({
      informes: ['embudo_etapas', 'prevision_trimestral'],
      plantillas: ['email_primer_contacto', 'contrato_desde_cotizacion', 'cotizacion'],
    })
    expect(resumen).toMatchObject({ informes: 2, plantillas: 3, seCreanSolas: 2, manuales: 1, completa: true })
  })

  it('no está completa por debajo de los mínimos', () => {
    expect(resumenSeleccion({ informes: ['embudo_etapas'], plantillas: [] }).completa).toBe(false)
  })
})

describe('calcularInformes', () => {
  it('sin datos, todos son estado vacío con primer paso (nunca un cero disfrazado)', () => {
    const informes = calcularInformes(
      ['embudo_etapas', 'prevision_trimestral', 'cobros_pendientes', 'tiempo_de_cierre', 'margen_por_linea', 'oportunidades_sin_accion'],
      datosVacios(),
    )

    expect(informes).toHaveLength(6)
    for (const informe of informes) {
      expect(informe.vacio).toBe(true)
      expect(informe.valor).toBe('—')
      expect(informe.primerPaso.length).toBeGreaterThan(10)
      expect(informe.enlace.startsWith('/dashboard')).toBe(true)
    }
  })

  it('ignora ids que ya no están en el catálogo', () => {
    expect(calcularInformes(['no_existe'], datosVacios())).toEqual([])
  })

  it('embudo: cuenta abiertas por etapa y dinero en juego', () => {
    const [embudo] = calcularInformes(
      ['embudo_etapas'],
      {
        ...datosVacios(),
        deals: [
          deal({ etapa: 'Propuesta', valor: 1000 }),
          deal({ etapa: 'Propuesta', valor: 500 }),
          deal({ etapa: 'Negociación', valor: 2000 }),
          deal({ etapa: 'Propuesta', valor: 9000, estado: 'ganado' }), // cerrada: no cuenta
        ],
      },
    )
    expect(embudo.vacio).toBe(false)
    expect(embudo.valor).toBe('3 abiertas')
    expect(embudo.detalle).toContain('Propuesta (2)')
    expect(embudo.detalle).toContain('3500')
  })

  it('previsión: solo oportunidades con fecha dentro del trimestre, ponderadas', () => {
    const [prevision] = calcularInformes(
      ['prevision_trimestral'],
      {
        ...datosVacios(),
        deals: [
          deal({ valor: 1000, probabilidad: 50, fechaEstimadaCierre: new Date('2026-11-15T00:00:00Z') }),
          deal({ valor: 1000, probabilidad: 100, fechaEstimadaCierre: new Date('2026-12-20T00:00:00Z') }),
          deal({ valor: 5000, probabilidad: 80, fechaEstimadaCierre: new Date('2027-02-10T00:00:00Z') }), // otro trimestre
          deal({ valor: 800, probabilidad: 90, fechaEstimadaCierre: null }),
        ],
      },
    )
    expect(prevision.vacio).toBe(false)
    expect(prevision.detalle).toContain('2 oportunidad')
    expect(prevision.valor).toMatch(/^1500\s€$/u)
  })

  it('cobros pendientes: suma y marca vencidas', () => {
    const [cobros] = calcularInformes(
      ['cobros_pendientes'],
      {
        ...datosVacios(),
        facturas: [
          { monto: 1000, fechaVencimiento: new Date('2026-10-01T00:00:00Z') },
          { monto: 500, fechaVencimiento: new Date('2026-12-01T00:00:00Z') },
          { monto: 250, fechaVencimiento: null },
        ],
      },
    )
    expect(cobros.vacio).toBe(false)
    expect(cobros.valor).toMatch(/^1750\s€$/u)
    expect(cobros.detalle).toContain('3 factura')
    expect(cobros.detalle).toContain('1 vencida')
  })

  it('oportunidades sin acción: más de 14 días sin actividad o sin fecha', () => {
    const [sinAccion] = calcularInformes(
      ['oportunidades_sin_accion'],
      {
        ...datosVacios(),
        deals: [
          deal({ fechaUltimaActividad: new Date('2026-10-30T00:00:00Z') }),
          deal({ fechaUltimaActividad: new Date('2026-10-01T00:00:00Z') }),
          deal({ fechaUltimaActividad: null }),
          deal({ estado: 'ganado', fechaUltimaActividad: null }),
        ],
      },
    )
    expect(sinAccion.valor).toBe('2 paradas')
    expect(sinAccion.detalle).toContain('3 abiertas')
  })

  it('tiempo de cierre: media de las ganadas con fecha', () => {
    const [ciclo] = calcularInformes(
      ['tiempo_de_cierre'],
      {
        ...datosVacios(),
        deals: [
          deal({ estado: 'ganado', fechaCreacion: new Date('2026-10-01T00:00:00Z'), fechaCierre: new Date('2026-10-11T00:00:00Z') }),
          deal({ estado: 'ganado', fechaCreacion: new Date('2026-10-01T00:00:00Z'), fechaCierre: new Date('2026-10-21T00:00:00Z') }),
        ],
      },
    )
    expect(ciclo.valor).toBe('15 días')
  })

  it('margen: sin coste en el catálogo lo dice en vez de inventar un porcentaje', () => {
    const [sinCoste] = calcularInformes(
      ['margen_por_linea'],
      {
        ...datosVacios(),
        deals: [deal({ estado: 'ganado', catalogoItemId: 'i-1', valor: 1000 })],
        catalogo: [{ id: 'i-1', nombre: 'Servicio', costOfAcquisition: 0 }],
      },
    )
    expect(sinCoste.vacio).toBe(true)
    expect(sinCoste.detalle).toContain('Falta el coste en 1')
  })

  it('margen: calcula la media sobre las ventas con coste registrado', () => {
    const [margen] = calcularInformes(
      ['margen_por_linea'],
      {
        ...datosVacios(),
        deals: [
          deal({ estado: 'ganado', catalogoItemId: 'i-1', valor: 1000, valorReal: 1000 }),
          deal({ estado: 'ganado', catalogoItemId: 'i-2', valor: 1000 }),
          deal({ estado: 'ganado', catalogoItemId: null, valor: 5000 }),
        ],
        catalogo: [
          { id: 'i-1', nombre: 'A', costOfAcquisition: 300 },
          { id: 'i-2', nombre: 'B', costOfAcquisition: 500 },
        ],
      },
    )
    expect(margen.vacio).toBe(false)
    expect(margen.valor).toBe('60%') // (70% + 50%) / 2
    expect(margen.detalle).toContain('2 venta')
  })

  it('conversión: elige el origen con más ganadas', () => {
    const [conversion] = calcularInformes(
      ['conversion_por_origen'],
      {
        ...datosVacios(),
        deals: [
          deal({ origen: 'web', estado: 'ganado' }),
          deal({ origen: 'web', estado: 'ganado' }),
          deal({ origen: 'web', estado: 'perdido' }),
          deal({ origen: 'feria', estado: 'perdido' }),
        ],
      },
    )
    expect(conversion.valor).toBe('67%')
    expect(conversion.detalle).toContain('Mejor origen: web')
  })

  it('mantiene el orden pedido y el número de informes', () => {
    const ids = ['cobros_pendientes', 'embudo_etapas']
    expect(calcularInformes(ids, datosVacios()).map((i) => i.id)).toEqual(ids)
  })
})
