/**
 * Segunda pieza de personalización del alta: el equipo y sus permisos.
 *
 * Un embudo con etapas no sirve de nada si todo el mundo entra con el mismo rol.
 * Los roles que la plataforma crea por defecto —Admin, Sales Agent— son de
 * catálogo: no dicen quién hace qué en *esta* empresa. Aquí se proponen los
 * roles del descubrimiento, con el motivo por el que encajan, y el cliente
 * decide quiénes se crean.
 *
 * Tres decisiones que este fichero hace cumplir:
 *
 * 1. **El perfil decide, no el nombre.** Cada rol se propone por una respuesta
 *    concreta (cuántos venden, qué duele, qué error ha costado dinero) y esa
 *    señal se guarda en `senales` para poder explicarlo y depurarlo.
 * 2. **Un rol que no encaja se enseña igual**, con lo que haría falta para que
 *    encajara (`paraEncajar`). Esconderlo obligaría al cliente a adivinar por qué
 *    no está; enseñarlo sin motivo lo animaría a crear roles que no va a usar.
 * 3. **La última palabra es del cliente.** Todo lo propuesto se puede quitar y
 *    todo lo no propuesto se puede añadir: la propuesta ordena, no encierra.
 *
 * Puro: sin Prisma, sin red, sin fechas. Lo importan la ruta y la pantalla.
 */

import { respuestasDe, type Descubrimiento, type RespuestaId } from './descubrimiento'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RolEquipoId = 'direccion' | 'responsable' | 'comercial' | 'preventa' | 'administracion'

/** Módulo → acción → concedida. Es la forma que guarda `Role.permisos`. */
export type PermisosRol = Record<string, Record<string, boolean>>

export interface DefinicionRolEquipo {
  id: RolEquipoId
  /** El nombre con el que el rol nace en la cuenta. */
  nombre: string
  /** Qué es este rol, en una frase, sin jerga de producto. */
  descripcion: string
  /** Qué hace exactamente, en bullets cortos para la tarjeta. */
  hace: readonly string[]
  permisos: PermisosRol
  /** Por defecto ve todo el embudo de la cuenta o solo lo suyo. */
  veTodo: boolean
}

/**
 * El alcance del pipeline es una llave aparte (`leads.ver_todos`, ver
 * `permissions-core.ts`). Se declara aquí para no escribirla en cinco sitios y
 * para que la pantalla sepa exactamente qué cambia al desmarcar «ve todo».
 */
export const PERMISO_VER_TODO = { modulo: 'leads', accion: 'ver_todos' } as const

/** El catálogo, en el orden en que lo lee la pantalla: de arriba abajo. */
export const ROLES_EQUIPO: readonly DefinicionRolEquipo[] = [
  {
    id: 'direccion',
    nombre: 'Dirección',
    descripcion:
      'Quien responde por la cuenta: ve todo el embudo, exporta los números y puede invitar a su equipo.',
    hace: [
      'Ve el embudo entero y todas las oportunidades',
      'Exporta informes',
      'Invita a personas y ve el equipo',
    ],
    permisos: {
      leads: { ver: true, ver_todos: true, crear: true, editar: true, asignar: true, exportar: true },
      citas: { ver: true },
      analytics: { ver: true, exportar: true },
      mensajes: { ver: true },
      configuracion: { ver: true },
      equipo: { ver: true, invitar: true },
    },
    veTodo: true,
  },
  {
    id: 'responsable',
    nombre: 'Responsable de ventas',
    descripcion:
      'Reparte el trabajo y lo supervisa: ve el embudo entero, reasigna oportunidades y no configura la cuenta.',
    hace: [
      'Ve y reasigna las oportunidades de todo el equipo',
      'Edita y exporta sin tocar la configuración',
      'Ve la conversación de cada comercial',
    ],
    permisos: {
      leads: { ver: true, ver_todos: true, crear: true, editar: true, asignar: true, exportar: true },
      citas: { ver: true, crear: true, editar: true, asignar: true },
      analytics: { ver: true },
      mensajes: { ver: true, enviar: true, responder: true },
      equipo: { ver: true },
    },
    veTodo: true,
  },
  {
    id: 'comercial',
    nombre: 'Comercial',
    descripcion:
      'Trabaja su cartera: crea y mueve sus oportunidades y habla con sus clientes. No ve lo de los demás ni exporta.',
    hace: [
      'Crea y edita sus oportunidades',
      'Ve solo su cartera, no el embudo de la cuenta',
      'Escribe a sus clientes desde la plataforma',
    ],
    permisos: {
      leads: { ver: true, crear: true, editar: true },
      citas: { ver: true, crear: true, editar: true },
      analytics: { ver: true },
      mensajes: { ver: true, enviar: true, responder: true },
    },
    veTodo: false,
  },
  {
    id: 'preventa',
    nombre: 'Preventa',
    descripcion:
      'Coge los leads el primer día y los pasa ya cualificados. No lleva la negociación ni el cierre.',
    hace: [
      'Recibe y trabaja los leads entrantes',
      'Agenda y edita citas',
      'Pasa la oportunidad al comercial cuando está lista',
    ],
    permisos: {
      leads: { ver: true, crear: true, editar: true },
      citas: { ver: true, crear: true },
      mensajes: { ver: true, enviar: true, responder: true },
    },
    veTodo: false,
  },
  {
    id: 'administracion',
    nombre: 'Administración',
    descripcion:
      'Entra a facturar y a cobrar, y a ver lo que hay que documentar. No mueve oportunidades ni decide precios.',
    hace: [
      'Ve las oportunidades para poder facturarlas',
      'Exporta los informes de cobro',
      'No crea, mueve ni cierra oportunidades',
    ],
    permisos: {
      leads: { ver: true, ver_todos: true },
      citas: { ver: true },
      analytics: { ver: true, exportar: true },
      mensajes: { ver: true },
      configuracion: { ver: true },
    },
    veTodo: true,
  },
] as const

export const ROL_EQUIPO_POR_ID: Record<RolEquipoId, DefinicionRolEquipo> = Object.fromEntries(
  ROLES_EQUIPO.map((rol) => [rol.id, rol]),
) as Record<RolEquipoId, DefinicionRolEquipo>

export function esRolEquipoId(valor: unknown): valor is RolEquipoId {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(ROL_EQUIPO_POR_ID, valor)
}

// ─── Permisos de una selección ───────────────────────────────────────────────

/**
 * Los permisos a aplicar para un rol, con el alcance que haya elegido el
 * cliente. Se compone desde la definición (no al revés) para que no exista una
 * segunda lista de permisos que pueda divergir del catálogo.
 *
 * `veTodo` solo añade o quita la llave de alcance: dejar que recorte el resto
 * sería una puerta por la que un clic mal dado quita permisos sin decirlo.
 */
export function permisosDeRol(id: RolEquipoId, veTodo?: boolean): PermisosRol {
  const definicion = ROL_EQUIPO_POR_ID[id]
  if (!definicion) return {}

  const permisos: PermisosRol = Object.fromEntries(
    Object.entries(definicion.permisos).map(([modulo, acciones]) => [modulo, { ...acciones }]),
  )

  const alcance = veTodo ?? definicion.veTodo
  const leads = { ...(permisos[PERMISO_VER_TODO.modulo] ?? {}) }

  if (alcance) leads[PERMISO_VER_TODO.accion] = true
  else delete leads[PERMISO_VER_TODO.accion]

  if (Object.keys(leads).length > 0) permisos[PERMISO_VER_TODO.modulo] = leads
  else delete permisos[PERMISO_VER_TODO.modulo]

  return permisos
}

// ─── Propuesta según el perfil ───────────────────────────────────────────────

export interface ContextoRolesEquipo {
  /** Tope de personas del plan, si se conoce. */
  limiteUsuarios?: number | null
}

export interface RolPropuesto {
  id: RolEquipoId
  nombre: string
  descripcion: string
  hace: string[]
  propuesto: boolean
  /** Por qué encaja con lo que contestó, en sus palabras. */
  motivo: string
  /** Reglas que lo han propuesto; sirve para explicar y depurar. */
  senales: string[]
  /** Qué haría falta para que encajara, cuando no se propone. */
  paraEncajar: string | null
  permisos: PermisosRol
  veTodo: boolean
}

export interface PropuestaRoles {
  roles: RolPropuesto[]
  /**
   * Cuántas personas como mínimo implica su respuesta de equipo. `null` cuando
   * no lo contestó: no se inventa una cifra para compararla con el plan.
   */
  equipoEstimado: number | null
  avisos: string[]
}

/** Mínimo de personas que implica cada respuesta de «¿cuántas personas venden?». */
const PERSONAS_POR_RESPUESTA: Record<string, number> = {
  solo: 1,
  '2_5': 2,
  '6_20': 6,
  mas_20: 21,
}

/** Umbral a partir del cual hace falta alguien que reparta y supervise. */
const EQUIPO_QUE_PIDE_RESPONSABLE = new Set(['6_20', 'mas_20'])

export function equipoEstimado(d: Descubrimiento): number | null {
  const respuesta = respuestasDe(d, 'equipo')[0]
  if (!respuesta) return null
  return PERSONAS_POR_RESPUESTA[respuesta] ?? null
}

function tiene(d: Descubrimiento, id: RespuestaId, ...valores: string[]): boolean {
  const respuestas = respuestasDe(d, id)
  return valores.some((v) => respuestas.includes(v))
}

/** «Se propone cuando…» para un rol que hoy no encaja. */
const PARA_ENCAJAR: Record<RolEquipoId, string> = {
  direccion: 'Siempre hay alguien que responde por la cuenta.',
  responsable:
    'Se propone cuando sois más de cinco vendiendo o cuando no sabes qué hace tu equipo.',
  comercial: 'Se propone cuando vende más de una persona.',
  preventa: 'Se propone cuando los leads se te enfrían y hay más de una persona para atenderlos.',
  administracion:
    'Se propone cuando hay facturas de por medio: facturar tarde, un error de precio o trabajo hecho sin cobrar.',
}

export function proponerRoles(d: Descubrimiento, ctx: ContextoRolesEquipo = {}): PropuestaRoles {
  const avisos: string[] = []
  const equipo = equipoEstimado(d)
  const equipoContestado = respuestasDe(d, 'equipo').length > 0
  const solo = tiene(d, 'equipo', 'solo')
  const equipoGrande = tiene(d, 'equipo', ...EQUIPO_QUE_PIDE_RESPONSABLE)
  const equipoMulti = solo ? false : tiene(d, 'equipo', '2_5', '6_20', 'mas_20')

  const propuestos = new Map<RolEquipoId, { motivo: string; senales: string[] }>()

  // 1. Alguien responde por la cuenta. Sin esto no hay a quién dar el resto.
  propuestos.set('direccion', {
    motivo: 'Alguien tiene que ver la cuenta entera, exportar los números y dar de alta al resto.',
    senales: ['siempre'],
  })

  // 2. Capa de supervisión: por tamaño del equipo o porque pide ver qué hace.
  if (equipoGrande || tiene(d, 'dolor', 'no_se_equipo')) {
    const senales: string[] = []
    if (equipoGrande) senales.push('equipo_grande')
    if (tiene(d, 'dolor', 'no_se_equipo')) senales.push('dolor_sin_visibilidad')

    propuestos.set('responsable', {
      motivo: equipoGrande
        ? 'Sois seis o más vendiendo: hace falta quien reparta la cartera y vea cómo va cada uno.'
        : 'Dijiste que no sabes qué hace tu equipo: este rol ve el embudo entero y puede reasignar.',
      senales,
    })
  }

  // 3. Comerciales: cuando vende más de una persona.
  if (equipoMulti) {
    propuestos.set('comercial', {
      motivo: 'Cada comercial con su cartera: trabaja sus oportunidades sin ver las de los demás.',
      senales: ['equipo_multi'],
    })
  }

  // 4. Preventa: el dolor de los leads que se enfrían, con quien atenderlos.
  if (equipoMulti && tiene(d, 'dolor', 'leads_frios')) {
    propuestos.set('preventa', {
      motivo: 'Se te enfrían los leads: alguien los coge el primer día y los pasa ya cualificados.',
      senales: ['dolor_leads_frios'],
    })
  }

  // 5. Administración: entra por dinero, no por tamaño de equipo.
  const senalesAdmin: string[] = []
  if (tiene(d, 'dolor', 'facturo_tarde')) senalesAdmin.push('dolor_facturacion')
  if (tiene(d, 'coste_error', 'factura', 'no_cobrar', 'precio')) senalesAdmin.push('coste_error')
  if (tiene(d, 'tras_propuesta', 'se_firma_papel')) senalesAdmin.push('firma_en_papel')

  if (senalesAdmin.length > 0) {
    const motivo =
      tiene(d, 'dolor', 'facturo_tarde')
        ? 'Facturar tarde es tu dolor: este rol entra a facturar y cobrar sin tocar el embudo comercial.'
        : tiene(d, 'coste_error', 'no_cobrar')
          ? 'Te ha costado dinero trabajo hecho sin cobrar: este rol lo persigue sin mover oportunidades.'
          : tiene(d, 'coste_error', 'factura', 'precio')
            ? 'Un error de factura o de precio ya te costó dinero: este rol ordena esa parte sin decidir precios.'
            : 'Firmas en papel: este rol ve y documenta lo que se cierra, sin negociarlo.'

    propuestos.set('administracion', { motivo, senales: senalesAdmin })
  }

  const roles: RolPropuesto[] = ROLES_EQUIPO.map((definicion) => {
    const propuesto = propuestos.get(definicion.id)
    return {
      id: definicion.id,
      nombre: definicion.nombre,
      descripcion: definicion.descripcion,
      hace: [...definicion.hace],
      propuesto: Boolean(propuesto),
      motivo: propuesto?.motivo ?? PARA_ENCAJAR[definicion.id],
      senales: propuesto?.senales ?? [],
      paraEncajar: propuesto ? null : PARA_ENCAJAR[definicion.id],
      permisos: permisosDeRol(definicion.id),
      veTodo: definicion.veTodo,
    }
  })

  // Sin saber cuántos venden, la propuesta se queda en lo que no depende del
  // tamaño: decir «propongo un comercial» sin saber si hay equipo es adivinar.
  if (!equipoContestado) {
    avisos.push(
      'No nos has dicho cuántas personas venden: solo se propone el rol de Dirección. Añade los demás a mano si ya tienes equipo.',
    )
  }

  // El plan sí tiene un tope de personas: si su equipo no cabe, se dice ahora y
  // no cuando la tercera persona no pueda entrar.
  if (equipo !== null && ctx.limiteUsuarios && equipo > ctx.limiteUsuarios) {
    avisos.push(
      `Seréis al menos ${equipo} personas y tu plan da para ${ctx.limiteUsuarios}. Los roles se pueden crear igual, pero no todos cabrán hasta que amplíes el plan.`,
    )
  }

  return { roles, equipoEstimado: equipo, avisos }
}

// ─── Selección del cliente ───────────────────────────────────────────────────

export interface SeleccionRol {
  id: RolEquipoId
  /** Si el rol ve todo el embudo de la cuenta o solo su cartera. */
  veTodo: boolean
}

export interface NormalizacionSeleccion {
  seleccion: SeleccionRol[]
  avisos: string[]
}

/**
 * Convierte lo que envía la pantalla en una selección aplicable. Un id que no
 * existe se descarta con aviso en vez de tumbar el envío entero; `veTodo`
 * ausente toma el valor del catálogo, que es lo que el cliente vio marcado.
 */
export function normalizarSeleccion(valor: unknown): NormalizacionSeleccion {
  const avisos: string[] = []
  const lista = Array.isArray(valor) ? valor : []
  const seleccion: SeleccionRol[] = []
  const vistos = new Set<RolEquipoId>()

  for (const entrada of lista) {
    // Se acepta tanto `'comercial'` como `{ id, veTodo }`: la pantalla manda el
    // objeto, pero una integración puede mandar solo el id.
    const id = typeof entrada === 'string' ? entrada : (entrada as { id?: unknown })?.id
    if (!esRolEquipoId(id)) {
      avisos.push('Se ha ignorado un rol que no existe en el catálogo.')
      continue
    }
    if (vistos.has(id)) {
      avisos.push(`「${ROL_EQUIPO_POR_ID[id].nombre}」 venía repetido: se ha quedado una sola vez.`)
      continue
    }
    vistos.add(id)

    const bruto = typeof entrada === 'object' && entrada !== null ? (entrada as { veTodo?: unknown }).veTodo : undefined
    const veTodo = typeof bruto === 'boolean' ? bruto : ROL_EQUIPO_POR_ID[id].veTodo
    seleccion.push({ id, veTodo })
  }

  // El orden del catálogo, no el que llegue: la pantalla y la auditoría deben
  // leer igual aunque el cliente marque las casillas en otro orden.
  seleccion.sort(
    (a, b) => ROLES_EQUIPO.findIndex((r) => r.id === a.id) - ROLES_EQUIPO.findIndex((r) => r.id === b.id),
  )

  if (seleccion.length === 0) {
    avisos.push('Elige al menos un rol: sin roles no hay a quién dar acceso.')
  }

  return { seleccion, avisos }
}

export interface ResumenRoles {
  roles: number
  conEmbudoCompleto: number
  /** Nombres de los roles elegidos, para mensajes y checklist. */
  nombres: string[]
  texto: string
}

export function resumenRoles(seleccion: SeleccionRol[]): ResumenRoles {
  const nombres = seleccion.map((s) => ROL_EQUIPO_POR_ID[s.id]?.nombre ?? s.id)
  const conEmbudoCompleto = seleccion.filter((s) => s.veTodo).length

  return {
    roles: seleccion.length,
    conEmbudoCompleto,
    nombres,
    texto:
      seleccion.length === 0
        ? 'Ningún rol elegido.'
        : `${seleccion.length} ${seleccion.length === 1 ? 'rol' : 'roles'}: ${nombres.join(', ')}.`,
  }
}
