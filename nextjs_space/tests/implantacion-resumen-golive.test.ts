// El resumen del go-live no decide nada: junta lo que el checklist ya comprobó
// contra la cuenta. Lo que hay que proteger es que no se cierre por tener las
// cuatro piezas «propuestas» ni por haber avanzado de pantalla.

import { describe, it, expect } from 'vitest'
import {
  PIEZAS_PERSONALIZACION,
  pasosHastaDatos,
  resumirGoLive,
  type PiezaPersonalizacion,
} from '@/lib/implantacion/resumen-golive'
import type { TareaChecklist } from '@/lib/implantacion/estado'

const PIEZA = (id: PiezaPersonalizacion, completada: boolean, detalle = `${id} listo`): TareaChecklist => ({
  id,
  titulo:
    id === 'embudo'
      ? 'Embudo aprobado'
      : id === 'roles'
        ? 'Equipo y permisos'
        : id === 'fiscal'
          ? 'Fiscal listo para facturar'
          : 'Marca y canales',
  detalle,
  dependeDe: null,
  completada,
})

const OTRAS: TareaChecklist[] = [
  { id: 'descubrimiento', titulo: 'Descubrimiento contestado', detalle: '…', dependeDe: null, completada: true },
  { id: 'modulos', titulo: 'Módulos elegidos', detalle: '…', dependeDe: 'descubrimiento', completada: true },
  { id: 'datos', titulo: 'Datos cargados', detalle: '…', dependeDe: 'marca_canales', completada: false },
  { id: 'informes', titulo: 'Informes fijados', detalle: '…', dependeDe: 'datos', completada: false },
]

const CON_LAS_CUATRO = (estado: boolean[]) => [
  ...OTRAS.slice(0, 2),
  ...PIEZAS_PERSONALIZACION.map((id, i) => PIEZA(id, estado[i])),
  ...OTRAS.slice(2),
]

describe('resumirGoLive', () => {
  it('con las cuatro aplicadas el alta queda listo para datos', () => {
    const resumen = resumirGoLive(CON_LAS_CUATRO([true, true, true, true]))

    expect(resumen.aplicadas).toBe(4)
    expect(resumen.total).toBe(4)
    expect(resumen.listo).toBe(true)
    expect(resumen.pendientes).toEqual([])
    expect(resumen.texto).toBe('Las cuatro piezas están en tu cuenta: puedes cargar tus datos.')
    // Las que no son personalización siguen contando para el go-live.
    expect(resumen.lineas).toEqual({ completadas: 6, total: 8 })
  })

  it('una pieza pendiente nombra lo que falta en vez de decir «listo»', () => {
    const resumen = resumirGoLive(CON_LAS_CUATRO([true, true, false, true]))

    expect(resumen.listo).toBe(false)
    expect(resumen.aplicadas).toBe(3)
    expect(resumen.pendientes).toEqual(['Fiscal listo para facturar'])
    expect(resumen.texto).toBe('Falta 1 de 4: Fiscal listo para facturar.')
  })

  it('dos pendientes se enumeran en el orden del checklist', () => {
    const resumen = resumirGoLive(CON_LAS_CUATRO([false, true, false, true]))

    expect(resumen.aplicadas).toBe(2)
    expect(resumen.texto).toBe('Faltan 2 de 4: Embudo aprobado, Fiscal listo para facturar.')
  })

  it('sin las cuatro líneas no se cierra aunque las que hay estén aplicadas', () => {
    // Un checklist recortado (o de otra versión) no puede dar el paso por bueno:
    // faltaría una pieza entera por aplicar.
    const resumen = resumirGoLive([PIEZA('embudo', true), PIEZA('roles', true), PIEZA('fiscal', true)])

    expect(resumen.total).toBe(3)
    expect(resumen.aplicadas).toBe(3)
    expect(resumen.listo).toBe(false)
    expect(resumen.pendientes).toEqual([])
  })

  it('respeta el detalle que trae el checklist, que es lo comprobado en la cuenta', () => {
    const resumen = resumirGoLive(
      CON_LAS_CUATRO([true, true, true, false]).map((tarea) =>
        tarea.id === 'marca_canales'
          ? { ...tarea, detalle: 'Elegiste 3 canales y 1 tiene tarea en tu cuenta: falta aplicarlo.' }
          : tarea,
      ),
    )

    expect(resumen.piezas.find((pieza) => pieza.id === 'marca_canales')?.detalle).toBe(
      'Elegiste 3 canales y 1 tiene tarea en tu cuenta: falta aplicarlo.',
    )
  })
})

describe('pasosHastaDatos', () => {
  it('desde personalización se pide un único paso', () => {
    expect(pasosHastaDatos('personalizacion')).toEqual(['datos'])
  })

  it('desde la elección se avanza de uno en uno, sin saltarse pasos', () => {
    // La API devolvería 400 si se pidiera «datos» desde «seleccion».
    expect(pasosHastaDatos('seleccion')).toEqual(['personalizacion', 'datos'])
  })

  it('quien ya está en datos o listo no necesita pasar por nada', () => {
    expect(pasosHastaDatos('datos')).toEqual([])
    expect(pasosHastaDatos('listo')).toEqual([])
  })

  it('siempre termina en datos', () => {
    const pasos = pasosHastaDatos('descubrimiento')

    expect(pasos).toEqual(['propuesta', 'seleccion', 'personalizacion', 'datos'])
    expect(pasos[pasos.length - 1]).toBe('datos')
  })
})
