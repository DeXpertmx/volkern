/**
 * Estado del alta guiada: en qué pantalla va el cliente y qué queda del
 * checklist de puesta en marcha.
 *
 * El estado se persiste por tenant (`ImplantacionTenant.estado`), así que si
 * el cliente abandona a mitad se retoma donde estaba y soporte puede verlo sin
 * preguntar. Puro: lo usan la ruta y la pantalla.
 */

import { MIN_INFORMES } from './entregables'

export const PASOS = [
  'descubrimiento',
  'propuesta',
  'seleccion',
  'personalizacion',
  'datos',
  'listo',
] as const

export type EstadoImplantacion = (typeof PASOS)[number]

export const ETIQUETAS_ESTADO: Record<EstadoImplantacion, string> = {
  descubrimiento: 'Cuéntanos tu negocio',
  propuesta: 'Lo que te sirve',
  seleccion: 'Elige módulos',
  personalizacion: 'Personalización',
  datos: 'Datos',
  listo: 'Listo',
}

export const ESTADO_INICIAL: EstadoImplantacion = 'descubrimiento'

export function esEstado(valor: unknown): valor is EstadoImplantacion {
  return typeof valor === 'string' && (PASOS as readonly string[]).includes(valor)
}

export function normalizarEstado(valor: unknown, porDefecto: EstadoImplantacion = ESTADO_INICIAL): EstadoImplantacion {
  return esEstado(valor) ? valor : porDefecto
}

export function indiceEstado(estado: EstadoImplantacion): number {
  return PASOS.indexOf(estado)
}

/**
 * Avanzar de uno en uno; volver atrás siempre se puede (el cliente corrige sus
 * respuestas y el estado no puede quedar por delante de lo que ha hecho).
 * Saltarse un paso sí se prohíbe: es la forma de que un alta quede «lista» sin
 * datos.
 */
export function puedeTransicionar(desde: EstadoImplantacion, hacia: EstadoImplantacion): boolean {
  const d = indiceEstado(desde)
  const h = indiceEstado(hacia)
  if (h <= d) return true
  return h - d === 1
}

export function siguienteEstado(actual: EstadoImplantacion): EstadoImplantacion {
  const siguiente = PASOS[indiceEstado(actual) + 1]
  return siguiente ?? 'listo'
}

// ─── Checklist de go-live ────────────────────────────────────────────────────

export interface TareaChecklist {
  id: string
  titulo: string
  detalle: string
  /** Tarea que tiene que estar cerrada antes; `null` si no depende de nada. */
  dependeDe: string | null
  completada: boolean
}

/** Firma del go-live: el criterio con el que se medirá y quién lo firmó. */
export interface FirmaGoLive {
  criterioExito: string
  /** El firmante confirma que revisó las plantillas con datos reales. */
  plantillasRevisadas: true
  firmadoEn: string
  /** Usuario que firmó; `null` si la firma vino de una credencial sin persona. */
  firmadoPor: string | null
}

export interface ContextoChecklist {
  estado: EstadoImplantacion
  aceptados: string[]
  tieneRecomendacion: boolean
  /**
   * Informes que el cliente **fijó** en su cuenta, no los que se le
   * propusieron. Omitido equivale a ninguno.
   */
  informesFijados?: number
  /** Cuándo se aplicó la selección; `null`/omitido = solo está propuesta. */
  entregablesAplicadosEn?: Date | string | null
  /**
   * Si el embudo del alta existe **en la cuenta**. Proponerlo no basta: la
   * ruta comprueba el embudo guardado antes de cerrar esta línea.
   */
  embudoAplicado?: boolean
  /** Roles que el cliente eligió crear en el alta. */
  rolesElegidos?: number
  /** De esos, cuántos existen **ahora** en la cuenta. */
  rolesEnCuenta?: number
  /** Impuestos activos en la cuenta, leídos de la base. */
  tasasActivas?: number
  /** Si hay un emisor fiscal principal: sin él no se puede facturar. */
  emisorPrincipal?: boolean
  /** Si el cliente confirmó la moneda al aplicar el alta. */
  monedaConfirmada?: boolean
  /**
   * Si la marca del alta está puesta **en la cuenta**: nombre comercial escrito
   * y color de marca guardado. Proponerla no escribe nada.
   */
  marcaAplicada?: boolean
  /** Canales que el cliente eligió en el alta. */
  canalesElegidos?: number
  /** De esos, cuántas tareas de puesta en marcha siguen en la cuenta. */
  canalesEnCuenta?: number
  /**
   * Importaciones confirmadas que escribieron registros en la cuenta. Las
   * previsualizaciones y los lotes deshechos no cuentan.
   */
  importacionesConfirmadas?: number
  /**
   * Registros que ya existen en la cuenta (leads, contactos y catálogo),
   * importados o creados a mano: quien empezó antes del alta también tiene
   * datos cargados.
   */
  registrosEnCuenta?: number
  /**
   * Firma del go-live. Omitida o `null` = sin firmar, y entonces «Plantillas
   * revisadas» y «Go-live firmado» siguen abiertas aunque el alta haya llegado
   * al último paso.
   */
  firmaGoLive?: FirmaGoLive | null
}

/**
 * El checklist que hasta ahora era un documento. Cada línea se cierra con un
 * hecho comprobable, no con un «hablado con el cliente».
 */
export function checklistDeAlta({
  estado,
  aceptados,
  tieneRecomendacion,
  informesFijados = 0,
  entregablesAplicadosEn = null,
  embudoAplicado = false,
  rolesElegidos = 0,
  rolesEnCuenta = 0,
  tasasActivas = 0,
  emisorPrincipal = false,
  monedaConfirmada = false,
  marcaAplicada = false,
  canalesElegidos = 0,
  canalesEnCuenta = 0,
  importacionesConfirmadas = 0,
  registrosEnCuenta = 0,
  firmaGoLive = null,
}: ContextoChecklist): TareaChecklist[] {
  const paso = indiceEstado(estado)
  const alMenos = (indice: number) => paso >= indice
  const entregablesAplicados = Boolean(entregablesAplicadosEn)
  // Sin elegir nada no hay nada que aplicar; y si se borró un rol a mano, la
  // línea vuelve a abrirse porque la cuenta ya no tiene lo que se aprobó.
  const rolesAplicados = rolesElegidos > 0 && rolesEnCuenta >= rolesElegidos

  // Facturar necesita las tres cosas: un impuesto con el que emitir, un emisor
  // con datos reales y una moneda que alguien haya confirmado (no la heredada).
  const fiscalListo = tasasActivas > 0 && emisorPrincipal && monedaConfirmada
  // Como el embudo, los roles y los informes: elegir canales no crea nada. Se
  // cierra cuando la marca está escrita **y** cada canal elegido tiene su tarea
  // de puesta en marcha en la cuenta.
  const canalesAplicados = canalesElegidos > 0 && canalesEnCuenta >= canalesElegidos
  const marcaYCanalesListos = marcaAplicada && canalesAplicados
  // Cargar datos tampoco se hace entrando en el paso: hay datos cuando una
  // importación confirmada escribió registros o cuando la cuenta ya los tenía
  // (a mano o de antes del alta). Si se deshace el último lote, vuelve a abrirse.
  const datosCargados = importacionesConfirmadas > 0 || registrosEnCuenta > 0
  // La firma es el único hecho que cierra el final del alta: quien firma deja
  // por escrito el criterio de éxito y confirma que revisó las plantillas con
  // datos reales. Llegar al último paso no tacha esas dos líneas, y un JSON
  // corrupto (sin criterio o sin la confirmación) tampoco vale como firma.
  const firmado =
    firmaGoLive != null &&
    firmaGoLive.plantillasRevisadas === true &&
    typeof firmaGoLive.criterioExito === 'string' &&
    firmaGoLive.criterioExito.trim().length > 0
  const faltaFiscal: string[] = []
  if (tasasActivas === 0) faltaFiscal.push('los impuestos')
  if (!emisorPrincipal) faltaFiscal.push('tu emisor fiscal (razón social y NIF)')
  if (!monedaConfirmada) faltaFiscal.push('confirmar la moneda')

  const tareas: TareaChecklist[] = [
    {
      id: 'descubrimiento',
      titulo: 'Descubrimiento contestado',
      detalle: 'Qué vende, a quién, qué le duele y con qué KPI se mide.',
      dependeDe: null,
      completada: alMenos(indiceEstado('propuesta')) && tieneRecomendacion,
    },
    {
      id: 'modulos',
      titulo: 'Módulos elegidos',
      detalle: 'Cada módulo aceptado o descartado a propósito, no por defecto.',
      dependeDe: 'descubrimiento',
      completada: alMenos(indiceEstado('seleccion')) && aceptados.length > 0,
    },
    {
      id: 'embudo',
      titulo: 'Embudo aprobado',
      // Como «Informes fijados»: aprobar el embudo en pantalla no crea nada.
      // Se cierra cuando el embudo existe en la cuenta, con sus etapas.
      detalle: embudoAplicado
        ? 'El embudo existe en tu cuenta con sus etapas y criterios de salida.'
        : 'Cada etapa con un criterio de salida observable; se crea al aplicar el plan, no al proponerlo.',
      dependeDe: 'modulos',
      completada: embudoAplicado,
    },
    {
      id: 'roles',
      titulo: 'Equipo y permisos',
      // Como el embudo y los informes: proponer roles no crea ninguno. Se cierra
      // cuando los roles elegidos existen en la cuenta, no al pasar de pantalla.
      detalle: rolesAplicados
        ? `${rolesEnCuenta} ${rolesEnCuenta === 1 ? 'rol' : 'roles'} en tu cuenta, con sus permisos.`
        : rolesElegidos > 0
          ? `Elegiste ${rolesElegidos} ${rolesElegidos === 1 ? 'rol' : 'roles'} y ${rolesEnCuenta} ${rolesEnCuenta === 1 ? 'existe' : 'existen'} en tu cuenta: falta aplicarlos.`
          : 'Un rol por cada trabajo de tu equipo; se crean al aplicar, no al proponerlos.',
      dependeDe: 'embudo',
      completada: rolesAplicados,
    },
    {
      id: 'fiscal',
      titulo: 'Fiscal listo para facturar',
      // No se cierra por haberlo propuesto ni por haberlo aplicado: se comprueba
      // que existan el impuesto, el emisor y una moneda confirmada.
      detalle: fiscalListo
        ? `${tasasActivas} ${tasasActivas === 1 ? 'impuesto activo' : 'impuestos activos'}, emisor completo y moneda confirmada.`
        : `Falta ${faltaFiscal.join(', ')}.`,
      dependeDe: 'roles',
      completada: fiscalListo,
    },
    {
      id: 'marca_canales',
      titulo: 'Marca y canales',
      // No se cierra por haber propuesto nombre, color y canales: se comprueba
      // que la marca esté escrita y que cada canal tenga su tarea en la cuenta.
      detalle: marcaYCanalesListos
        ? `Marca aplicada y ${canalesEnCuenta} ${canalesEnCuenta === 1 ? 'canal' : 'canales'} con su tarea de puesta en marcha.`
        : canalesElegidos > 0
          ? `Elegiste ${canalesElegidos} ${canalesElegidos === 1 ? 'canal' : 'canales'} y ${canalesEnCuenta} ${canalesEnCuenta === 1 ? 'tiene' : 'tienen'} tarea en tu cuenta: falta aplicarlo${marcaAplicada ? '' : ' con tu nombre y tu color'}.`
          : 'Tu nombre comercial, tu color y por dónde entran los clientes; se escribe al aplicar, no al proponerlo.',
      dependeDe: 'fiscal',
      completada: marcaYCanalesListos,
    },
    {
      id: 'datos',
      titulo: 'Datos cargados',
      detalle: importacionesConfirmadas > 0
        ? `${importacionesConfirmadas} ${importacionesConfirmadas === 1 ? 'importación confirmada' : 'importaciones confirmadas'} con su informe de calidad: los registros ya están en tu cuenta.`
        : registrosEnCuenta > 0
          ? `${registrosEnCuenta} ${registrosEnCuenta === 1 ? 'registro' : 'registros'} en tu cuenta, importados o creados a mano.`
          : 'Empresas, contactos y catálogo con el informe de calidad visto antes de escribir; se cierra cuando hay datos en la cuenta, no al llegar al paso.',
      dependeDe: 'marca_canales',
      completada: datosCargados,
    },
    {
      id: 'informes',
      titulo: 'Informes fijados',
      // No se cierra por avanzar de paso: hacen falta informes realmente
      // fijados en la cuenta, que es lo que el cliente va a ver al entrar.
      detalle: entregablesAplicados
        ? informesFijados >= MIN_INFORMES
          ? `${informesFijados} informes fijados: ya aparecen en tu panel.`
          : `Solo ${informesFijados} informe${informesFijados === 1 ? '' : 's'} fijado${informesFijados === 1 ? '' : 's'}: con menos de ${MIN_INFORMES} el panel se queda corto.`
        : 'Dos o tres informes que se miran el lunes siguiente; hay que fijarlos, no basta con proponerlos.',
      dependeDe: 'datos',
      completada: entregablesAplicados && informesFijados >= MIN_INFORMES,
    },
    {
      id: 'plantillas',
      titulo: 'Plantillas revisadas',
      detalle: firmado
        ? 'Revisadas con datos reales y confirmadas en la firma del go-live.'
        : 'Cotización y emails editados con datos reales antes de enviarlos; se confirman al firmar el go-live.',
      dependeDe: 'datos',
      completada: firmado,
    },
    {
      id: 'go_live',
      titulo: 'Go-live firmado',
      detalle: firmado
        ? 'Criterio de éxito escrito y revisión de los 14 días agendada.'
        : 'Revisión de los 14 días agendada con el criterio de éxito escrito; se cierra con la firma.',
      dependeDe: 'plantillas',
      completada: firmado,
    },
  ]

  return tareas
}

export function resumenChecklist(tareas: TareaChecklist[]): { completadas: number; total: number } {
  return { completadas: tareas.filter((t) => t.completada).length, total: tareas.length }
}
