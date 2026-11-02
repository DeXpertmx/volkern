// @vitest-environment node
/**
 * Casos dorados del motor de recomendación del alta guiada.
 *
 * El motor es determinista, así que estos doce perfiles son la red de
 * seguridad: si una regla cambia y recomienda un módulo que no toca, o deja de
 * recomendar el que resuelve el dolor que el cliente ha escrito, falla aquí y
 * no en la primera reunión del cliente.
 *
 * Lo que se comprueba en todos los casos (bloque «invariantes»):
 *   - Ningún módulo inventado: todos existen en `ALL_MODULES`.
 *   - Todo módulo propuesto explica motivo y requisito.
 *   - `incluidoEnPlan` coincide con el plan, y lo que queda fuera se avisa.
 *   - La misma entrada produce exactamente la misma propuesta.
 */

import { describe, it, expect } from 'vitest'
import { ALL_MODULES } from '@/lib/plans'
import {
  normalizarDescubrimiento,
  PREGUNTAS,
  hayMaterialSuficiente,
  type Descubrimiento,
} from '@/lib/implantacion/descubrimiento'
import { recomendar, type ContextoRecomendacion } from '@/lib/implantacion/recomendar'
import {
  checklistDeAlta,
  puedeTransicionar,
  siguienteEstado,
} from '@/lib/implantacion/estado'

const PLAN_BASE = [
  'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'mensajes', 'citas',
  'equipo', 'configuracion', 'conocimiento',
]

/** Contexto de un plan Profesional con casi todo el catálogo comercial. */
const ctx = (over: Partial<ContextoRecomendacion> = {}): ContextoRecomendacion => ({
  plan: 'profesional',
  modulosPlan: [
    ...PLAN_BASE,
    'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring', 'catalogo',
    'formularios', 'cms', 'campanas', 'email_marketing', 'social_manager', 'ads',
    'automatizaciones', 'telefonia', 'chatbot_whatsapp', 'estrategia', 'finanzas',
  ],
  limiteEmbudos: 3,
  limiteUsuarios: 10,
  ...over,
})

function d(
  respuestas: Record<string, string | string[]>,
  noSe: string[] = [],
): Descubrimiento {
  const { descubrimiento } = normalizarDescubrimiento({ respuestas, noSe })
  return descubrimiento
}

const ids = (r: ReturnType<typeof recomendar>) => r.modulos.map((m) => m.id)

const CASOS: { nombre: string; descubrimiento: Descubrimiento; contexto: ContextoRecomendacion }[] = [
  {
    nombre: 'B2B industrial, ciclo de 3 meses, dolor de previsión',
    descubrimiento: d({
      que_vende: 'ambos',
      a_quien: 'empresas',
      origen: ['ferias', 'referidos'],
      equipo: '2_5',
      ciclo: '1_3m',
      dolor: 'prevision',
      tras_propuesta: 'nada',
      coste_error: 'perder_cliente',
      herramienta: ['excel'],
      panel: ['prevision', 'embudo'],
      decision: 'a_quien_llamar',
      exito_90d: 'saber_antes',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Autónomo B2C, compra inmediata, se le enfrían los leads',
    descubrimiento: d({
      que_vende: 'servicios',
      a_quien: 'particulares',
      origen: ['referidos'],
      equipo: 'solo',
      ciclo: 'menos_7d',
      dolor: 'leads_frios',
      tras_propuesta: 'llamo_yo',
      coste_error: 'perder_cliente',
      herramienta: ['whatsapp'],
      panel: ['conversion'],
      decision: 'a_quien_llamar',
      exito_90d: 'no_perder',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Agencia que capta por web y redes',
    descubrimiento: d({
      que_vende: 'servicios',
      a_quien: 'empresas',
      origen: ['redes', 'web'],
      equipo: '2_5',
      ciclo: '2_4s',
      dolor: 'cotizaciones_lentas',
      tras_propuesta: 'nada',
      coste_error: 'perder_cliente',
      herramienta: ['excel'],
      panel: ['embudo', 'conversion'],
      decision: 'a_quien_llamar',
      exito_90d: 'cerrar_mas',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Asesoría con cartera propia y facturación que se retrasa',
    descubrimiento: d({
      que_vende: 'servicios',
      a_quien: 'empresas',
      origen: ['referidos'],
      equipo: '2_5',
      ciclo: '2_4s',
      dolor: 'facturo_tarde',
      tras_propuesta: 'llamo_yo',
      coste_error: 'factura',
      herramienta: ['excel', 'papel'],
      panel: ['cobros'],
      decision: 'que_precio',
      exito_90d: 'cobrar_antes',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Doce comerciales con plan Básico (1 embudo y 5 usuarios)',
    descubrimiento: d({
      que_vende: 'servicios',
      a_quien: 'empresas',
      origen: ['llamadas'],
      equipo: '6_20',
      ciclo: '2_4s',
      dolor: 'no_se_equipo',
      tras_propuesta: 'llamo_yo',
      coste_error: 'perder_cliente',
      herramienta: ['otro_crm'],
      panel: ['actividad'],
      decision: 'a_quien_llamar',
      exito_90d: 'saber_antes',
    }),
    contexto: ctx({ plan: 'basico', limiteEmbudos: 1, limiteUsuarios: 5 }),
  },
  {
    nombre: 'Hotel: alojamiento, reservas y tarifas',
    descubrimiento: d({
      que_vende: 'alojamiento',
      a_quien: 'particulares',
      origen: ['web', 'redes'],
      equipo: '2_5',
      ciclo: '2_4s',
      dolor: 'cotizaciones_lentas',
      tras_propuesta: 'nada',
      coste_error: 'precio',
      herramienta: ['excel'],
      panel: ['conversion'],
      decision: 'que_precio',
      exito_90d: 'cerrar_mas',
    }),
    contexto: ctx({ modulosPlan: [...PLAN_BASE, 'hospitality', 'catalogo', 'compras', 'cotizaciones'] }),
  },
  {
    nombre: 'Suscripción B2B con ciclo largo y cobros pendientes',
    descubrimiento: d({
      que_vende: 'suscripcion',
      a_quien: 'empresas',
      origen: ['partners'],
      equipo: '2_5',
      ciclo: 'mas_3m',
      dolor: 'pierdo_seguimiento',
      tras_propuesta: 'se_pierde',
      coste_error: 'no_cobrar',
      herramienta: ['otro_crm'],
      panel: ['prevision', 'cobros'],
      decision: 'cuando_contratar',
      exito_90d: 'no_perder',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Cliente que responde «no lo sé» a todo',
    descubrimiento: d({}, PREGUNTAS.map((p) => p.id)),
    contexto: ctx(),
  },
  {
    nombre: 'Solo referidos: no necesita captación',
    descubrimiento: d({
      que_vende: 'servicios',
      a_quien: 'particulares',
      origen: ['referidos'],
      equipo: 'solo',
      ciclo: 'menos_7d',
      dolor: 'leads_frios',
      tras_propuesta: 'llamo_yo',
      coste_error: 'perder_cliente',
      herramienta: ['papel'],
      panel: ['embudo'],
      decision: 'a_quien_llamar',
      exito_90d: 'no_perder',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Las propuestas tardan demasiado: cotizaciones primero',
    descubrimiento: d({
      que_vende: 'productos',
      a_quien: 'empresas',
      origen: ['referidos'],
      equipo: '2_5',
      ciclo: '2_4s',
      dolor: 'cotizaciones_lentas',
      tras_propuesta: 'nada',
      coste_error: 'precio',
      herramienta: ['excel'],
      panel: ['embudo'],
      decision: 'que_precio',
      exito_90d: 'cerrar_antes',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Error de factura y cobros pendientes',
    descubrimiento: d({
      que_vende: 'productos',
      a_quien: 'empresas',
      origen: ['ferias'],
      equipo: '2_5',
      ciclo: '1_3m',
      dolor: 'facturo_tarde',
      tras_propuesta: 'se_firma_papel',
      coste_error: 'factura',
      herramienta: ['excel'],
      panel: ['cobros'],
      decision: 'que_precio',
      exito_90d: 'cobrar_antes',
    }),
    contexto: ctx(),
  },
  {
    nombre: 'Seis comerciales que quieren actividad por comercial',
    descubrimiento: d({
      que_vende: 'servicios',
      a_quien: 'empresas',
      origen: ['llamadas'],
      equipo: '6_20',
      ciclo: '2_4s',
      dolor: 'no_se_equipo',
      tras_propuesta: 'llamo_yo',
      coste_error: 'perder_cliente',
      herramienta: ['excel'],
      panel: ['actividad'],
      decision: 'a_quien_llamar',
      exito_90d: 'saber_antes',
    }),
    contexto: ctx(),
  },
]

const porNombre = (nombre: string) => {
  const caso = CASOS.find((c) => c.nombre === nombre)
  if (!caso) throw new Error(`Caso dorado no encontrado: ${nombre}`)
  return caso
}

// ─── Los doce perfiles ───────────────────────────────────────────────────────

describe('recomendación — casos dorados', () => {
  it('1. B2B industrial: embudo largo, previsión y contrato', () => {
    const { descubrimiento, contexto } = porNombre('B2B industrial, ciclo de 3 meses, dolor de previsión')
    const r = recomendar(descubrimiento, contexto)

    expect(r.embudo.etapas).toHaveLength(6)
    expect(r.embudo.etapas.map((e) => e.nombre)).toContain('Calificación')
    expect(ids(r)).toEqual(expect.arrayContaining(['pronosticos', 'cotizaciones', 'contratos', 'scoring']))
    expect(ids(r)).not.toContain('hospitality')
    // Cada etapa declara cómo se sale de ella: sin criterio, la etapa es un adorno.
    for (const etapa of r.embudo.etapas) expect(etapa.criterio.length).toBeGreaterThan(10)
    expect(r.informes).toContain('prevision_trimestral')
  })

  it('2. B2C de compra inmediata: scoring y respuesta rápida, sin contratos', () => {
    const { descubrimiento, contexto } = porNombre('Autónomo B2C, compra inmediata, se le enfrían los leads')
    const r = recomendar(descubrimiento, contexto)

    expect(r.embudo.etapas).toHaveLength(4)
    expect(ids(r)).toContain('scoring')
    expect(ids(r)).toContain('chatbot_whatsapp')
    expect(ids(r)).not.toContain('contratos')
    expect(ids(r)).not.toContain('campanas')
    expect(r.informes).toEqual(expect.arrayContaining(['conversion_por_origen', 'oportunidades_sin_accion']))
  })

  it('3. Agencia: campañas, web, formularios y email los propone el origen', () => {
    const { descubrimiento, contexto } = porNombre('Agencia que capta por web y redes')
    const r = recomendar(descubrimiento, contexto)

    expect(ids(r)).toEqual(expect.arrayContaining(['campanas', 'cms', 'formularios', 'email_marketing']))
    expect(ids(r)).toContain('cotizaciones')
    expect(r.modulos.length).toBeLessThanOrEqual(8)
  })

  it('4. Asesoría: finanzas y órdenes de venta, no hospitality', () => {
    const { descubrimiento, contexto } = porNombre('Asesoría con cartera propia y facturación que se retrasa')
    const r = recomendar(descubrimiento, contexto)

    expect(ids(r)).toEqual(expect.arrayContaining(['finanzas', 'ordenes_venta', 'catalogo']))
    expect(ids(r)).not.toContain('hospitality')
    expect(r.informes).toContain('cobros_pendientes')
  })

  it('5. Doce comerciales con plan Básico: avisa de usuarios y de embudos', () => {
    const { descubrimiento, contexto } = porNombre('Doce comerciales con plan Básico (1 embudo y 5 usuarios)')
    const r = recomendar(descubrimiento, contexto)

    expect(ids(r)).toEqual(expect.arrayContaining(['estrategia', 'compliance_pro']))
    expect(r.limites).toEqual({ plan: 'basico', embudos: 1, usuarios: 5 })
    expect(r.riesgos.join(' ')).toMatch(/5 usuarios/)
    expect(r.riesgos.join(' ')).toMatch(/un embudo/)
    // compliance_pro no está en el plan del caso: tiene que marcarse, no esconderse.
    const compliance = r.modulos.find((m) => m.id === 'compliance_pro')
    expect(compliance?.incluidoEnPlan).toBe(false)
    expect(r.riesgos.join(' ')).toMatch(/addon/)
  })

  it('6. Hotel: hospitality primero y su límite declarado', () => {
    const { descubrimiento, contexto } = porNombre('Hotel: alojamiento, reservas y tarifas')
    const r = recomendar(descubrimiento, contexto)

    expect(r.modulos[0].id).toBe('hospitality')
    expect(r.modulos[0].incluidoEnPlan).toBe(true)
    expect(r.modulos[0].limite).toMatch(/canal/i)
    expect(r.embudo.etapas).toHaveLength(5)
  })

  it('7. Suscripción B2B: contrato, orden, finanzas y embudo de seis etapas', () => {
    const { descubrimiento, contexto } = porNombre('Suscripción B2B con ciclo largo y cobros pendientes')
    const r = recomendar(descubrimiento, contexto)

    expect(ids(r)).toEqual(expect.arrayContaining(['contratos', 'cotizaciones', 'ordenes_venta', 'finanzas']))
    expect(r.embudo.etapas.map((e) => e.nombre)).toEqual(
      expect.arrayContaining(['Calificación', 'Diagnóstico', 'Negociación']),
    )
  })

  it('8. «No lo sé» a todo: no inventa módulos y lo dice', () => {
    const { descubrimiento, contexto } = porNombre('Cliente que responde «no lo sé» a todo')
    const r = recomendar(descubrimiento, contexto)

    expect(hayMaterialSuficiente(descubrimiento)).toBe(false)
    expect(r.modulos).toEqual([])
    expect(r.riesgos.length).toBeGreaterThan(0)
    expect(r.riesgos.join(' ')).toMatch(/pocas respuestas/i)
    // El núcleo se da por hecho igualmente: la cuenta ya está creada.
    expect(r.nucleo.ids).toContain('pipeline')
  })

  it('9. Solo referidos: no propone captación que no necesita', () => {
    const { descubrimiento, contexto } = porNombre('Solo referidos: no necesita captación')
    const r = recomendar(descubrimiento, contexto)

    for (const campaña of ['campanas', 'cms', 'ads', 'formularios', 'email_marketing', 'social_manager']) {
      expect(ids(r)).not.toContain(campaña)
    }
    expect(ids(r)).toContain('scoring')
    expect(r.riesgos.join(' ')).toMatch(/papel|en la cabeza/i)
  })

  it('10. «Las propuestas tardan»: cotizaciones es la primera tarjeta', () => {
    const { descubrimiento, contexto } = porNombre('Las propuestas tardan demasiado: cotizaciones primero')
    const r = recomendar(descubrimiento, contexto)

    expect(r.modulos[0].id).toBe('cotizaciones')
    expect(r.modulos[0].motivo).toMatch(/propuesta|PDF/i)
    expect(ids(r)).toContain('catalogo')
    expect(r.plantillas).toContain('cotizacion')
  })

  it('11. Error de factura: finanzas y órdenes, con cobros en el panel', () => {
    const { descubrimiento, contexto } = porNombre('Error de factura y cobros pendientes')
    const r = recomendar(descubrimiento, contexto)

    expect(ids(r)).toEqual(expect.arrayContaining(['finanzas', 'ordenes_venta']))
    expect(r.informes).toContain('cobros_pendientes')
    expect(ids(r)).toContain('contratos') // firmaba en papel
  })

  it('12. Actividad por comercial: el informe y el módulo, sin duplicar el núcleo', () => {
    const { descubrimiento, contexto } = porNombre('Seis comerciales que quieren actividad por comercial')
    const r = recomendar(descubrimiento, contexto)

    expect(r.informes).toContain('actividad_por_comercial')
    expect(ids(r)).not.toContain('analytics')
    expect(ids(r)).not.toContain('leads')
    expect(r.nucleo.ids).toContain('analytics')
  })
})

// ─── Invariantes que valen para cualquier perfil ─────────────────────────────

describe('recomendación — invariantes', () => {
  const CATALOGO = new Set(ALL_MODULES.map((m) => m.id))

  it('ningún módulo inventado y todas las tarjetas se explican', () => {
    for (const caso of CASOS) {
      const r = recomendar(caso.descubrimiento, caso.contexto)
      for (const m of r.modulos) {
        expect(CATALOGO.has(m.id), `${m.id} no existe en ALL_MODULES (${caso.nombre})`).toBe(true)
        expect(m.motivo.length, `${m.id} sin motivo (${caso.nombre})`).toBeGreaterThan(15)
        expect(m.requisito.length, `${m.id} sin requisito (${caso.nombre})`).toBeGreaterThan(10)
        expect(m.peso).toBeGreaterThan(0)
        expect(m.peso).toBeLessThanOrEqual(1)
        expect(m.senales.length).toBeGreaterThan(0)
      }
    }
  })

  it('lo que no está en el plan se marca como fuera de plan, nunca se esconde', () => {
    for (const caso of CASOS) {
      const r = recomendar(caso.descubrimiento, caso.contexto)
      const delPlan = new Set([...(caso.contexto.modulosPlan ?? []), ...(caso.contexto.modulosActivos ?? [])])
      for (const m of r.modulos) {
        expect(m.incluidoEnPlan, `${m.id} mal marcado en ${caso.nombre}`).toBe(delPlan.has(m.id))
      }
      const fuera = r.modulos.filter((m) => !m.incluidoEnPlan)
      if (fuera.length > 0) {
        expect(r.riesgos.join(' ')).toMatch(/addon/)
      }
    }
  })

  it('la misma entrada devuelve exactamente la misma propuesta', () => {
    for (const caso of CASOS) {
      const a = recomendar(caso.descubrimiento, caso.contexto)
      const b = recomendar(caso.descubrimiento, caso.contexto)
      expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    }
  })

  it('el núcleo nunca aparece como tarjeta y no se pierde ninguna recomendación en silencio', () => {
    for (const caso of CASOS) {
      const r = recomendar(caso.descubrimiento, caso.contexto)
      const nucleo = new Set(r.nucleo.ids)
      for (const m of r.modulos) expect(nucleo.has(m.id)).toBe(false)
      expect(r.omitidos).toBeGreaterThanOrEqual(0)
      expect(r.modulos.length + r.omitidos).toBeLessThanOrEqual(16)
    }
  })

  it('los módulos propuestos devuelven informes y plantillas que existen', () => {
    for (const caso of CASOS) {
      const r = recomendar(caso.descubrimiento, caso.contexto)
      expect(r.informes.length).toBeGreaterThanOrEqual(2)
      expect(r.plantillas.length).toBeGreaterThan(0)
    }
  })
})

// ─── Normalización del cuestionario ──────────────────────────────────────────

describe('descubrimiento — normalización', () => {
  it('descarta opciones que no existen con un aviso, sin perder el resto', () => {
    const { descubrimiento, avisos } = normalizarDescubrimiento({
      respuestas: { que_vende: 'platano', a_quien: 'empresas' },
    })

    expect(descubrimiento.respuestas.que_vende).toBeUndefined()
    expect(descubrimiento.respuestas.a_quien).toEqual(['empresas'])
    expect(avisos).toHaveLength(1)
  })

  it('«no lo sé» gana a la respuesta: no se recomienda sobre una duda', () => {
    const { descubrimiento } = normalizarDescubrimiento({
      respuestas: { dolor: 'prevision' },
      noSe: ['dolor'],
    })

    expect(descubrimiento.respuestas.dolor).toBeUndefined()
    expect(descubrimiento.noSe).toContain('dolor')
  })

  it('respeta el tope de tres opciones del panel del lunes', () => {
    const { descubrimiento, avisos } = normalizarDescubrimiento({
      respuestas: { panel: ['embudo', 'prevision', 'actividad', 'conversion'] },
    })

    expect(descubrimiento.respuestas.panel).toHaveLength(3)
    expect(avisos.join(' ')).toMatch(/3 opciones/)
  })

  it('ignora preguntas y valores que no existen en el catálogo', () => {
    const { descubrimiento } = normalizarDescubrimiento({
      respuestas: { inventada: 'x' },
      noSe: ['tampoco_existe'],
    })

    expect(descubrimiento.respuestas).toEqual({})
    expect(descubrimiento.noSe).toEqual([])
  })
})

// ─── Estado del alta ─────────────────────────────────────────────────────────

describe('estado del alta', () => {
  it('avanza de uno en uno y permite volver atrás', () => {
    expect(puedeTransicionar('descubrimiento', 'propuesta')).toBe(true)
    expect(puedeTransicionar('descubrimiento', 'listo')).toBe(false)
    expect(puedeTransicionar('datos', 'propuesta')).toBe(true)
    expect(siguienteEstado('propuesta')).toBe('seleccion')
    expect(siguienteEstado('listo')).toBe('listo')
  })

  it('el checklist no da por cerrado nada que no lo esté', () => {
    const alPrincipio = checklistDeAlta({ estado: 'descubrimiento', aceptados: [], tieneRecomendacion: false })
    expect(alPrincipio.every((t) => !t.completada)).toBe(true)

    const conSeleccion = checklistDeAlta({
      estado: 'seleccion',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
    })
    expect(conSeleccion.find((t) => t.id === 'descubrimiento')?.completada).toBe(true)
    expect(conSeleccion.find((t) => t.id === 'modulos')?.completada).toBe(true)
    expect(conSeleccion.find((t) => t.id === 'datos')?.completada).toBe(false)
    expect(conSeleccion.find((t) => t.id === 'go_live')?.completada).toBe(false)
  })

  it('un alta sin módulos aceptados no cierra el paso de módulos', () => {
    const tareas = checklistDeAlta({ estado: 'seleccion', aceptados: [], tieneRecomendacion: true })
    expect(tareas.find((t) => t.id === 'modulos')?.completada).toBe(false)
  })

  it('«Embudo aprobado» no se cierra por avanzar de paso, solo si el embudo existe', () => {
    // Elegir módulos y llegar a datos no crea ningún embudo.
    const enDatos = checklistDeAlta({ estado: 'datos', aceptados: ['cotizaciones'], tieneRecomendacion: true })
    const sinAplicar = enDatos.find((t) => t.id === 'embudo')
    expect(sinAplicar?.completada).toBe(false)
    expect(sinAplicar?.detalle).toContain('al aplicar el plan')

    const aplicado = checklistDeAlta({
      estado: 'personalizacion',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      embudoAplicado: true,
    }).find((t) => t.id === 'embudo')
    expect(aplicado?.completada).toBe(true)
    expect(aplicado?.detalle).toContain('existe en tu cuenta')
  })

  it('«Equipo y permisos» no se cierra por avanzar de paso ni por proponer roles', () => {
    const enDatos = checklistDeAlta({ estado: 'datos', aceptados: ['cotizaciones'], tieneRecomendacion: true })
    const sinProponer = enDatos.find((t) => t.id === 'roles')
    expect(sinProponer?.completada).toBe(false)
    expect(sinProponer?.detalle).toContain('al aplicar')

    // Elegidos pero sin aplicar: la cuenta no los tiene todavía.
    const elegidosSinAplicar = checklistDeAlta({
      estado: 'personalizacion',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      rolesElegidos: 3,
      rolesEnCuenta: 0,
    }).find((t) => t.id === 'roles')
    expect(elegidosSinAplicar?.completada).toBe(false)
    expect(elegidosSinAplicar?.detalle).toContain('falta aplicarlos')

    // Aplicados: cerrado, y con el número real de roles.
    const aplicado = checklistDeAlta({
      estado: 'personalizacion',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      rolesElegidos: 3,
      rolesEnCuenta: 3,
    }).find((t) => t.id === 'roles')
    expect(aplicado?.completada).toBe(true)
    expect(aplicado?.detalle).toContain('3 roles')

    // Uno borrado a mano: la línea vuelve a abrirse, no se queda tachada.
    const parcial = checklistDeAlta({
      estado: 'personalizacion',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      rolesElegidos: 3,
      rolesEnCuenta: 2,
    }).find((t) => t.id === 'roles')
    expect(parcial?.completada).toBe(false)
  })

  it('el checklist encadena roles, fiscal y marca antes de datos: sin equipo, impuestos ni marca no se cargan datos', () => {
    const tareas = checklistDeAlta({ estado: 'personalizacion', aceptados: ['crm'], tieneRecomendacion: true })
    const roles = tareas.find((t) => t.id === 'roles')
    const fiscal = tareas.find((t) => t.id === 'fiscal')
    const marca = tareas.find((t) => t.id === 'marca_canales')
    const datos = tareas.find((t) => t.id === 'datos')

    expect(roles?.dependeDe).toBe('embudo')
    expect(fiscal?.dependeDe).toBe('roles')
    expect(marca?.dependeDe).toBe('fiscal')
    expect(datos?.dependeDe).toBe('marca_canales')
  })

  it('«Marca y canales» exige la marca escrita y una tarea por canal', () => {
    const base = { estado: 'personalizacion' as const, aceptados: ['crm'], tieneRecomendacion: true }

    const nada = checklistDeAlta(base).find((t) => t.id === 'marca_canales')
    expect(nada?.completada).toBe(false)
    expect(nada?.detalle).toContain('al aplicar')

    // Canales elegidos pero sin aplicar todavía: la cuenta no tiene las tareas.
    const elegidosSinAplicar = checklistDeAlta({
      ...base,
      canalesElegidos: 3,
      canalesEnCuenta: 0,
      marcaAplicada: true,
    }).find((t) => t.id === 'marca_canales')
    expect(elegidosSinAplicar?.completada).toBe(false)
    expect(elegidosSinAplicar?.detalle).toContain('falta aplicarlo')

    // Tareas creadas pero sin nombre ni color: sigue abierto y lo dice.
    const sinMarca = checklistDeAlta({
      ...base,
      canalesElegidos: 2,
      canalesEnCuenta: 2,
      marcaAplicada: false,
    }).find((t) => t.id === 'marca_canales')
    expect(sinMarca?.completada).toBe(false)
    expect(sinMarca?.detalle).toContain('con tu nombre y tu color')

    const listo = checklistDeAlta({
      ...base,
      canalesElegidos: 2,
      canalesEnCuenta: 2,
      marcaAplicada: true,
    }).find((t) => t.id === 'marca_canales')
    expect(listo?.completada).toBe(true)
    expect(listo?.detalle).toContain('2 canales')
  })

  it('«Fiscal listo para facturar» exige impuesto, emisor y moneda confirmada', () => {
    const base = { estado: 'personalizacion' as const, aceptados: ['crm'], tieneRecomendacion: true }

    const nada = checklistDeAlta(base).find((t) => t.id === 'fiscal')
    expect(nada?.completada).toBe(false)
    expect(nada?.detalle).toContain('los impuestos')
    expect(nada?.detalle).toContain('emisor fiscal')

    // Con impuesto y emisor pero sin moneda confirmada no se cierra: la del
    // tenant puede ser la heredada por defecto.
    const sinMoneda = checklistDeAlta({
      ...base,
      tasasActivas: 1,
      emisorPrincipal: true,
      monedaConfirmada: false,
    }).find((t) => t.id === 'fiscal')
    expect(sinMoneda?.completada).toBe(false)
    expect(sinMoneda?.detalle).toContain('confirmar la moneda')

    // Con impuestos pero sin emisor tampoco: sin NIF no hay factura.
    const sinEmisor = checklistDeAlta({
      ...base,
      tasasActivas: 2,
      emisorPrincipal: false,
      monedaConfirmada: true,
    }).find((t) => t.id === 'fiscal')
    expect(sinEmisor?.completada).toBe(false)

    const listo = checklistDeAlta({
      ...base,
      tasasActivas: 2,
      emisorPrincipal: true,
      monedaConfirmada: true,
    }).find((t) => t.id === 'fiscal')
    expect(listo?.completada).toBe(true)
    expect(listo?.detalle).toContain('2 impuestos activos')
  })

  it('«Informes fijados» no se cierra por avanzar de paso, solo con la selección aplicada', () => {
    // Llegar al paso de datos no fija nada: antes se cerraba solo por avanzar.
    const enDatos = checklistDeAlta({ estado: 'datos', aceptados: ['cotizaciones'], tieneRecomendacion: true })
    const sinAplicar = enDatos.find((t) => t.id === 'informes')
    expect(sinAplicar?.completada).toBe(false)
    expect(sinAplicar?.detalle).toContain('fijarlos')

    // Aplicado pero por debajo del mínimo: sigue abierto y lo dice.
    const corto = checklistDeAlta({
      estado: 'datos',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      informesFijados: 1,
      entregablesAplicadosEn: '2026-10-31T10:00:00.000Z',
    }).find((t) => t.id === 'informes')
    expect(corto?.completada).toBe(false)
    expect(corto?.detalle).toContain('menos de 2')

    // Aplicado y con los informes que pide el mínimo: cerrado.
    const aplicado = checklistDeAlta({
      estado: 'datos',
      aceptados: ['cotizaciones'],
      tieneRecomendacion: true,
      informesFijados: 3,
      entregablesAplicadosEn: new Date('2026-10-31T10:00:00.000Z'),
    }).find((t) => t.id === 'informes')
    expect(aplicado?.completada).toBe(true)
    expect(aplicado?.detalle).toContain('3 informes')
  })

  it('«Datos cargados» se cierra con datos en la cuenta, no por llegar al paso', () => {
    const base = { estado: 'datos' as const, aceptados: ['crm'], tieneRecomendacion: true }

    // En el paso pero sin datos: la línea sigue abierta y lo dice.
    const enPaso = checklistDeAlta(base).find((t) => t.id === 'datos')
    expect(enPaso?.completada).toBe(false)
    expect(enPaso?.detalle).toContain('no al llegar al paso')

    // Una importación confirmada la cierra, con el número real.
    const importado = checklistDeAlta({ ...base, importacionesConfirmadas: 2 }).find(
      (t) => t.id === 'datos',
    )
    expect(importado?.completada).toBe(true)
    expect(importado?.detalle).toContain('2 importaciones confirmadas')

    // Quien metió los datos a mano también los tiene cargados.
    const aMano = checklistDeAlta({ ...base, registrosEnCuenta: 12 }).find((t) => t.id === 'datos')
    expect(aMano?.completada).toBe(true)
    expect(aMano?.detalle).toContain('12 registros')
  })
})
