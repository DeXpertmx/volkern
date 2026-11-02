// El cierre del alta es lo único que no se puede comprobar contra la cuenta:
// lo firma una persona. Lo que sí se puede proteger es que la firma signifique
// algo —criterio medible, plantillas revisadas— y que no tape un pendiente.

import { describe, it, expect } from 'vitest'
import {
  DIAS_REVISION,
  MAX_CRITERIO,
  MIN_CRITERIO,
  fechaRevision,
  leerFirma,
  normalizarFirma,
  puedeFirmar,
} from '@/lib/implantacion/cierre'
import {
  checklistDeAlta,
  type FirmaGoLive,
  type TareaChecklist,
} from '@/lib/implantacion/estado'

const AHORA = new Date('2026-11-01T09:00:00.000Z')
const CRITERIO = 'Veinte oportunidades creadas y la primera cotización enviada con la plantilla'

const FIRMA: FirmaGoLive = {
  criterioExito: CRITERIO,
  plantillasRevisadas: true,
  firmadoEn: AHORA.toISOString(),
  firmadoPor: 'u1',
}

const tarea = (id: string, completada: boolean): TareaChecklist => ({
  id,
  titulo: `Título ${id}`,
  detalle: '',
  dependeDe: null,
  completada,
})

describe('normalizarFirma', () => {
  it('guarda el criterio, la fecha y quién firma', () => {
    const { firma, errores } = normalizarFirma(
      { criterioExito: CRITERIO, plantillasRevisadas: true },
      AHORA,
      'u1',
    )

    expect(errores).toEqual([])
    expect(firma).toEqual({
      criterioExito: CRITERIO,
      plantillasRevisadas: true,
      firmadoEn: AHORA.toISOString(),
      firmadoPor: 'u1',
    })
  })

  it('limpia los espacios y los saltos de línea del criterio', () => {
    const { firma } = normalizarFirma(
      { criterioExito: `  Veinte oportunidades\n creadas   y la primera cotización enviada  `, plantillasRevisadas: true },
      AHORA,
      null,
    )

    expect(firma?.criterioExito).toBe('Veinte oportunidades creadas y la primera cotización enviada')
  })

  it('no firma sin criterio', () => {
    const { firma, errores } = normalizarFirma({ plantillasRevisadas: true }, AHORA, 'u1')

    expect(firma).toBeNull()
    expect(errores[0]).toContain('Escribe el criterio de éxito')
  })

  it('no firma con un criterio que no se puede medir', () => {
    // «Mejorar» no es un criterio: en 14 días no se sabría si se cumplió.
    const { firma, errores } = normalizarFirma(
      { criterioExito: 'vender más', plantillasRevisadas: true },
      AHORA,
      'u1',
    )

    expect(firma).toBeNull()
    expect(errores[0]).toContain(`${MIN_CRITERIO} caracteres`)
  })

  it('no firma sin confirmar que las plantillas se revisaron', () => {
    const { firma, errores } = normalizarFirma({ criterioExito: CRITERIO }, AHORA, 'u1')

    expect(firma).toBeNull()
    expect(errores.join(' ')).toContain('plantillas')
  })

  it('un criterio interminable se recorta en vez de perderse', () => {
    const { firma } = normalizarFirma(
      { criterioExito: 'a'.repeat(MAX_CRITERIO + 50), plantillasRevisadas: true },
      AHORA,
      null,
    )

    expect(firma?.criterioExito).toHaveLength(MAX_CRITERIO)
  })
})

describe('leerFirma', () => {
  it('lee una firma completa guardada en la base', () => {
    expect(leerFirma(FIRMA)).toEqual(FIRMA)
  })

  it('sin la confirmación de plantillas no hay firma', () => {
    expect(leerFirma({ ...FIRMA, plantillasRevisadas: false })).toBeNull()
  })

  it('una fecha que no existe no vale como firma', () => {
    expect(leerFirma({ ...FIRMA, firmadoEn: 'ayer' })).toBeNull()
  })

  it('un JSON corrupto no se interpreta como firmado', () => {
    // Si esto devolviera algo, el checklist daría el alta por cerrada sin firma.
    expect(leerFirma(null)).toBeNull()
    expect(leerFirma('firmado')).toBeNull()
    expect(leerFirma({})).toBeNull()
    expect(leerFirma([])).toBeNull()
  })
})

describe('fechaRevision', () => {
  it('cae exactamente DIAS_REVISION días después de firmar', () => {
    const revision = fechaRevision(FIRMA)

    expect(revision?.toISOString()).toBe('2026-11-15T09:00:00.000Z')
    expect(revision?.getTime()).toBe(AHORA.getTime() + DIAS_REVISION * 24 * 60 * 60 * 1000)
  })

  it('una fecha inválida no inventa una revisión', () => {
    expect(fechaRevision({ ...FIRMA, firmadoEn: 'no-es-fecha' })).toBeNull()
  })
})

describe('puedeFirmar', () => {
  it('no deja firmar con datos o informes abiertos, y los nombra', () => {
    const gate = puedeFirmar([
      tarea('embudo', true),
      tarea('datos', false),
      tarea('informes', false),
      tarea('plantillas', false),
      tarea('go_live', false),
    ])

    expect(gate.listo).toBe(false)
    expect(gate.pendientes).toEqual(['Título datos', 'Título informes'])
  })

  it('las dos líneas que cierra la firma no bloquean la firma', () => {
    // Sería circular: no se puede exigir la firma para poder firmar.
    const gate = puedeFirmar([
      tarea('datos', true),
      tarea('informes', true),
      tarea('plantillas', false),
      tarea('go_live', false),
    ])

    expect(gate.listo).toBe(true)
    expect(gate.pendientes).toEqual([])
  })

  it('sin checklist no hay firma', () => {
    expect(puedeFirmar([])).toEqual({ listo: false, pendientes: [] })
  })
})

describe('checklist del cierre', () => {
  const conTodo = (firmaGoLive: FirmaGoLive | null) =>
    checklistDeAlta({
      estado: 'listo',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      informesFijados: 2,
      entregablesAplicadosEn: new Date('2026-10-31T10:00:00.000Z'),
      embudoAplicado: true,
      rolesElegidos: 1,
      rolesEnCuenta: 1,
      tasasActivas: 1,
      emisorPrincipal: true,
      monedaConfirmada: true,
      marcaAplicada: true,
      canalesElegidos: 1,
      canalesEnCuenta: 1,
      importacionesConfirmadas: 1,
      firmaGoLive,
    })

  it('llegar al último paso no cierra plantillas ni go-live sin firma', () => {
    const tareas = conTodo(null)

    expect(tareas.find((t) => t.id === 'plantillas')?.completada).toBe(false)
    expect(tareas.find((t) => t.id === 'go_live')?.completada).toBe(false)
    // Todo lo demás sí está: lo único que falta es la firma.
    expect(tareas.filter((t) => !t.completada).map((t) => t.id)).toEqual(['plantillas', 'go_live'])
  })

  it('con la firma el checklist queda completo', () => {
    const tareas = conTodo(FIRMA)

    expect(tareas.every((t) => t.completada)).toBe(true)
    expect(tareas.find((t) => t.id === 'go_live')?.detalle).toContain('Criterio de éxito')
  })

  it('una firma guardada corrupta no cierra el alta', () => {
    // El tipo dice FirmaGoLive, pero lo que llega de la base puede ser basura.
    const tareas = conTodo({ ...FIRMA, plantillasRevisadas: false } as unknown as FirmaGoLive)

    expect(tareas.find((t) => t.id === 'go_live')?.completada).toBe(false)
  })
})
