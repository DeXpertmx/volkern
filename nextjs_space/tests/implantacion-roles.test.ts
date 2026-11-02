// @vitest-environment node
/**
 * Personalización del alta: los roles sugeridos.
 *
 * Lo que se prueba aquí es la promesa que se le hace al cliente: el rol que se
 * le propone sale de una respuesta suya, el que no encaja se le enseña igual
 * con lo que haría falta, y el alcance (`ve todo` / `solo su cartera`) es un
 * permiso de verdad, no una etiqueta.
 */

import { describe, it, expect } from 'vitest'

import type { Descubrimiento } from '@/lib/implantacion/descubrimiento'
import {
  PERMISO_VER_TODO,
  ROLES_EQUIPO,
  normalizarSeleccion,
  permisosDeRol,
  proponerRoles,
  resumenRoles,
} from '@/lib/implantacion/roles'

function descubrimiento(
  respuestas: Record<string, string | string[]>,
  noSe: string[] = [],
): Descubrimiento {
  return {
    respuestas: Object.fromEntries(
      Object.entries(respuestas).map(([id, valor]) => [id, Array.isArray(valor) ? valor : [valor]]),
    ) as Descubrimiento['respuestas'],
    noSe: noSe as Descubrimiento['noSe'],
    notas: '',
    version: 1,
  }
}

const propuestos = (d: Descubrimiento) =>
  proponerRoles(d)
    .roles.filter((rol) => rol.propuesto)
    .map((rol) => rol.id)

describe('proponerRoles — el perfil decide', () => {
  it('quien vende solo no recibe roles de equipo que no existe', () => {
    const d = descubrimiento({ equipo: 'solo', dolor: 'prevision', que_vende: 'servicios' })
    expect(propuestos(d)).toEqual(['direccion'])

    // Y lo que no encaja se explica, no se esconde.
    const comercial = proponerRoles(d).roles.find((rol) => rol.id === 'comercial')
    expect(comercial?.propuesto).toBe(false)
    expect(comercial?.paraEncajar).toContain('más de una persona')
  })

  it('con dos o cinco vendiendo propone comerciales, pero no un responsable todavía', () => {
    const d = descubrimiento({ equipo: '2_5' })
    const ids = propuestos(d)

    expect(ids).toContain('comercial')
    expect(ids).not.toContain('responsable')
  })

  it('con seis o más propone la capa que reparte y supervisa', () => {
    const d = descubrimiento({ equipo: '6_20' })
    const responsable = proponerRoles(d).roles.find((rol) => rol.id === 'responsable')

    expect(responsable?.propuesto).toBe(true)
    expect(responsable?.senales).toContain('equipo_grande')
    expect(responsable?.motivo).toContain('seis o más')
  })

  it('«no sé qué hace mi equipo» basta para proponer un responsable, aunque sea uno solo', () => {
    const d = descubrimiento({ equipo: 'solo', dolor: 'no_se_equipo' })
    const responsable = proponerRoles(d).roles.find((rol) => rol.id === 'responsable')

    expect(responsable?.propuesto).toBe(true)
    expect(responsable?.senales).toContain('dolor_sin_visibilidad')
    expect(propuestos(d)).not.toContain('comercial')
  })

  it('los leads que se enfrían piden preventa, pero solo si hay más de una persona', () => {
    const conEquipo = descubrimiento({ equipo: '2_5', dolor: 'leads_frios' })
    expect(propuestos(conEquipo)).toContain('preventa')

    const solo = descubrimiento({ equipo: 'solo', dolor: 'leads_frios' })
    const preventa = proponerRoles(solo).roles.find((rol) => rol.id === 'preventa')
    expect(preventa?.propuesto).toBe(false)
    expect(preventa?.paraEncajar).toContain('más de una persona')
  })

  it('administración entra por dinero: facturar tarde, un error de factura o firmar en papel', () => {
    for (const respuestas of [
      { dolor: 'facturo_tarde' },
      { coste_error: 'no_cobrar' },
      { coste_error: 'factura' },
      { tras_propuesta: 'se_firma_papel' },
    ]) {
      const d = descubrimiento({ equipo: '2_5', ...respuestas })
      expect(propuestos(d), JSON.stringify(respuestas)).toContain('administracion')
    }

    const sinDinero = descubrimiento({ equipo: '2_5', dolor: 'prevision' })
    expect(propuestos(sinDinero)).not.toContain('administracion')
  })

  it('sin decir cuántos venden no inventa equipo: propone Dirección y lo avisa', () => {
    const d = descubrimiento({ que_vende: 'productos' })
    const propuesta = proponerRoles(d)

    expect(propuesta.roles.filter((rol) => rol.propuesto).map((rol) => rol.id)).toEqual(['direccion'])
    expect(propuesta.equipoEstimado).toBeNull()
    expect(propuesta.avisos.join(' ')).toContain('cuántas personas venden')
  })

  it('avisa cuando el equipo no cabe en el plan, antes de que no quepan', () => {
    const d = descubrimiento({ equipo: 'mas_20' })
    const propuesta = proponerRoles(d, { limiteUsuarios: 5 })

    expect(propuesta.equipoEstimado).toBe(21)
    expect(propuesta.avisos.join(' ')).toContain('21')
    expect(propuesta.avisos.join(' ')).toContain('5')
  })

  it('es determinista: el mismo perfil da la misma propuesta', () => {
    const d = descubrimiento({ equipo: '6_20', dolor: 'leads_frios', coste_error: 'factura' })
    expect(JSON.stringify(proponerRoles(d))).toBe(JSON.stringify(proponerRoles(d)))
  })

  it('cada rol del catálogo aparece siempre, propuesto o no', () => {
    const d = descubrimiento({ equipo: 'solo' })
    const ids = proponerRoles(d).roles.map((rol) => rol.id)
    expect(ids).toEqual(ROLES_EQUIPO.map((rol) => rol.id))
  })
})

describe('permisosDeRol — el alcance es un permiso, no una etiqueta', () => {
  it('el comercial no ve el embudo de la cuenta; el responsable sí', () => {
    const comercial = permisosDeRol('comercial')
    const responsable = permisosDeRol('responsable')

    expect(comercial.leads[PERMISO_VER_TODO.accion]).toBeUndefined()
    expect(comercial.leads.ver).toBe(true)
    expect(responsable.leads[PERMISO_VER_TODO.accion]).toBe(true)
  })

  it('desmarcar «ve todo» quita el alcance y deja el resto intacto', () => {
    const conTodo = permisosDeRol('administracion', true)
    const soloSuyo = permisosDeRol('administracion', false)

    expect(conTodo.leads[PERMISO_VER_TODO.accion]).toBe(true)
    expect(soloSuyo.leads[PERMISO_VER_TODO.accion]).toBeUndefined()
    expect(soloSuyo.leads.ver).toBe(true)
    expect(soloSuyo.analytics).toEqual(conTodo.analytics)
  })

  it('administración entra a ver y exportar, no a mover oportunidades', () => {
    const permisos = permisosDeRol('administracion')

    expect(permisos.leads).toEqual({ ver: true, ver_todos: true })
    expect(permisos.analytics.exportar).toBe(true)
  })

  it('ningún rol del catálogo concede la cuenta entera con un wildcard', () => {
    for (const rol of ROLES_EQUIPO) {
      const permisos = permisosDeRol(rol.id)
      expect(permisos.all, rol.nombre).toBeUndefined()
      expect(permisos.configuracion?.gestionar, rol.nombre).toBeUndefined()
    }
  })
})

describe('normalizarSeleccion', () => {
  it('acepta ids sueltos y objetos con alcance', () => {
    const { seleccion, avisos } = normalizarSeleccion(['comercial', { id: 'direccion', veTodo: false }])

    expect(avisos).toEqual([])
    // Orden del catálogo, no el de llegada.
    expect(seleccion).toEqual([
      { id: 'direccion', veTodo: false },
      { id: 'comercial', veTodo: false },
    ])
  })

  it('descarta lo que no existe y quita repetidos, sin perder el resto', () => {
    const { seleccion, avisos } = normalizarSeleccion(['inventado', 'comercial', 'comercial'])

    expect(seleccion).toEqual([{ id: 'comercial', veTodo: false }])
    expect(avisos.join(' ')).toContain('no existe')
    expect(avisos.join(' ')).toContain('repetido')
  })

  it('sin nada elegido lo dice en vez de aplicar una selección vacía en silencio', () => {
    expect(normalizarSeleccion([]).seleccion).toEqual([])
    expect(normalizarSeleccion(null).avisos.join(' ')).toContain('al menos un rol')
  })

  it('un `veTodo` que no es booleano toma el valor del catálogo', () => {
    const { seleccion } = normalizarSeleccion([{ id: 'comercial', veTodo: 'sí' }])
    expect(seleccion[0].veTodo).toBe(false)
  })
})

describe('resumenRoles', () => {
  it('nombra los roles para que el checklist y la auditoría se lean igual', () => {
    const resumen = resumenRoles([
      { id: 'direccion', veTodo: true },
      { id: 'comercial', veTodo: false },
    ])

    expect(resumen.roles).toBe(2)
    expect(resumen.conEmbudoCompleto).toBe(1)
    expect(resumen.nombres).toEqual(['Dirección', 'Comercial'])
    expect(resumen.texto).toContain('Dirección, Comercial')
  })

  it('con la selección vacía no presume de nada', () => {
    expect(resumenRoles([]).texto).toContain('Ningún rol')
  })
})
