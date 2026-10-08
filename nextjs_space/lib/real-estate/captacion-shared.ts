/**
 * Volkern Real Estate — Piezas de captación compartidas por servidor y cliente.
 *
 * `captacion-helpers.ts` es la puerta de entrada al modelo `Captacion` y necesita
 * Prisma; este módulo no toca la base de datos a propósito. Los tipos, las
 * etiquetas de la interfaz y el cálculo de la comisión viven aquí para que una
 * pantalla del panel pueda importarlos sin arrastrar el cliente de base de datos
 * al bundle del navegador. `captacion-helpers.ts` los reexporta, así que el
 * contrato público del servidor no cambia.
 *
 * Una captación es el acuerdo entre el propietario de un inmueble y la agencia
 * para comercializarlo; la exclusividad y la comisión son las dos cláusulas que
 * sostienen ese acuerdo.
 */

export type CaptacionTipo = 'exclusiva' | 'compartida' | 'mandato';
export type CaptacionEstado = 'borrador' | 'activa' | 'vencida' | 'cancelada' | 'cerrada';

export interface CaptacionTipoInfo {
  value: CaptacionTipo;
  label: string;
  descripcion: string;
}

export interface CaptacionEstadoInfo {
  value: CaptacionEstado;
  label: string;
  descripcion: string;
  /** Clases del badge en la interfaz. */
  badge: string;
}

/**
 * Tipos de captación, con el significado que ve el usuario.
 *
 * El orden no es alfabético: primero lo que la agencia firma de verdad
 * (exclusividad), después las variantes.
 */
export const CAPTACION_TIPOS: readonly CaptacionTipoInfo[] = [
  {
    value: 'exclusiva',
    label: 'Exclusiva',
    descripcion: 'Solo la agencia comercializa el inmueble durante el contrato',
  },
  {
    value: 'compartida',
    label: 'Compartida',
    descripcion: 'La agencia comparte la comercialización con otros agentes',
  },
  {
    value: 'mandato',
    label: 'Mandato',
    descripcion: 'Encargo de comercialización sin exclusividad',
  },
];

/**
 * Estados del ciclo de vida del contrato, tal y como los define el modelo.
 *
 * El badge trae su color porque un estado sin color obliga a cada pantalla a
 * inventarse la paleta.
 */
export const CAPTACION_ESTADOS: readonly CaptacionEstadoInfo[] = [
  {
    value: 'borrador',
    label: 'Borrador',
    descripcion: 'En edición, sin firmar',
    badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200',
  },
  {
    value: 'activa',
    label: 'Activa',
    descripcion: 'Contrato vigente, propiedad en comercialización',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
  },
  {
    value: 'vencida',
    label: 'Vencida',
    descripcion: 'Se cumplió la fecha de fin sin venderse',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  },
  {
    value: 'cancelada',
    label: 'Cancelada',
    descripcion: 'Se rescindió el contrato antes del vencimiento',
    badge: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300',
  },
  {
    value: 'cerrada',
    label: 'Cerrada',
    descripcion: 'Se vendió o alquiló la propiedad durante la vigencia',
    badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  },
];

/** Ficha del tipo de captación, o `undefined` si el valor no se reconoce. */
export function infoTipoCaptacion(tipo: string | null | undefined): CaptacionTipoInfo | undefined {
  return CAPTACION_TIPOS.find((t) => t.value === tipo);
}

/** Ficha del estado de captación, o `undefined` si el valor no se reconoce. */
export function infoEstadoCaptacion(
  estado: string | null | undefined
): CaptacionEstadoInfo | undefined {
  return CAPTACION_ESTADOS.find((e) => e.value === estado);
}

/** Etiqueta humana del tipo: «Exclusiva». Cae al valor crudo si no se reconoce. */
export function etiquetaTipoCaptacion(tipo: string | null | undefined): string {
  return infoTipoCaptacion(tipo)?.label || tipo || '—';
}

/** Etiqueta humana del estado: «Activa». Cae al valor crudo si no se reconoce. */
export function etiquetaEstadoCaptacion(estado: string | null | undefined): string {
  return infoEstadoCaptacion(estado)?.label || estado || '—';
}

/**
 * Calcula el monto de comisión de captación.
 *
 * El porcentaje manda sobre el importe fijo: es la cláusula que se firma por
 * defecto, y el fijo solo existe como alternativa cuando no hay porcentaje.
 */
export function calcularComisionCaptacion(
  precioOferta: number,
  porcentaje?: number | null,
  montoFijo?: number | null
): number {
  if (porcentaje && porcentaje > 0) {
    return precioOferta * (porcentaje / 100);
  }
  return montoFijo || 0;
}

/**
 * Determina si una captación está vigente según sus fechas.
 *
 * Vigente es algo más que `estado === 'activa'`: el contrato tiene que estar
 * dentro de su ventana de fechas. Una captación activa con la fecha de fin
 * pasada ya no lo está aunque nadie la haya marcado como vencida.
 *
 * El momento de referencia se inyecta —igual que en `diasRestantesCaptacion`—
 * en vez de leerlo del reloj: sin eso, el resultado de un test cambia según el
 * día en que se ejecute y acaba afirmando cosas distintas de las que escribió
 * quien lo escribió.
 */
export function isCaptacionVigente(
  captacion: { fechaInicio: Date | string; fechaFin: Date | string; estado: string },
  ahora: Date = new Date()
): boolean {
  if (captacion.estado !== 'activa') return false;
  return ahora >= new Date(captacion.fechaInicio) && ahora <= new Date(captacion.fechaFin);
}

// ─── Forma de los datos en el hilo cliente ↔ API ────────────────────────────
//
// Es la forma que viaja por JSON: las fechas llegan como cadena ISO, no como
// `Date`. Declararla aquí evita que la pantalla mienta sobre el tipo —usar el
// tipo del modelo con `fechaInicio: Date` haría que `new Date(...)` pareciera
// redundante— y deja el detalle y el listado hablando del mismo contrato.

export interface CaptacionInmuebleResumen {
  id: string;
  nombre: string;
  precioBase: number | null;
  moneda: string | null;
  media: unknown;
}

export interface CaptacionPropietarioResumen {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
}

export interface CaptacionCreadorResumen {
  id: string;
  name: string | null;
  email: string;
}

export interface CaptacionWire {
  id: string;
  tipoCaptacion: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string;
  fechaFirma: string | null;
  fechaVencimiento: string | null;
  esExclusiva: boolean;
  clausulasExclusividad: string | null;
  precioOferta: number | null;
  precioMinimo: number | null;
  comisionPorcentaje: number | null;
  comisionFija: number | null;
  comisionMoneda: string | null;
  comisionCondiciones: string | null;
  comisionNotas: string | null;
  condicionesPago: string | null;
  documentoUrl: string | null;
  documentoHash: string | null;
  notasCliente: string | null;
  notasInternas: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
  propiedad: CaptacionInmuebleResumen | null;
  contactoPropietario: CaptacionPropietarioResumen | null;
  creador: CaptacionCreadorResumen | null;
}

export interface CaptacionStatsWire {
  total: number;
  activas: number;
  borrador: number;
  vencidas: number;
  canceladas: number;
  cerradas: number;
  exclusivas: number;
  comisionPromedio: number;
  valorPromedio: number;
}

/**
 * Primera imagen de un inmueble, sea una URL suelta o un objeto `{ url }`.
 *
 * El campo `media` del catálogo ha tenido las dos formas, y una pantalla que
 * asume una sola se queda sin foto sin avisar.
 */
export function primeraImagenInmueble(media: unknown): string | null {
  if (!Array.isArray(media) || media.length === 0) return null;
  const primera = media[0];
  if (typeof primera === 'string') return primera;
  if (primera && typeof primera === 'object' && 'url' in primera) {
    const url = (primera as { url?: unknown }).url;
    return typeof url === 'string' ? url : null;
  }
  return null;
}

/**
 * Días que quedan de contrato, contados desde hoy.
 *
 * Negativo cuando ya venció. Se calcula en días naturales y no en milisegundos
 * crudos para que «quedan 0 días» signifique el último día de vigencia y no una
 * fracción de jornada.
 */
export function diasRestantesCaptacion(
  captacion: { fechaFin: Date | string },
  ahora: Date = new Date()
): number {
  const fin = new Date(captacion.fechaFin);
  const inicioDelDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const finDelDia = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
  return Math.round((finDelDia.getTime() - inicioDelDia.getTime()) / 86_400_000);
}
