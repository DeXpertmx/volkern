/**
 * Ajustes de precio por plan (capa 2 del pricing dinámico).
 *
 * La capa 1 (`./estacionalidad`) responde «cuánto cuesta esta noche»: temporada
 * por fecha y recargo de fin de semana. La capa 2 responde «cuánto cuesta esta
 * noche **para esta estancia y este momento**»: tres reglas clásicas de revenue
 * management que modifican porcentualmente la tarifa que ya resolvió la capa 1.
 *
 * - **antelación**: días entre el momento de la reserva y la llegada (last
 *   minute sube, reservar con meses de antelación baja).
 * - **ocupacion**: demanda de esa noche — el % de unidades vendibles que ya
 *   están ocupadas (pocas libres = sube).
 * - **duracion**: largo de la estancia en noches (una noche suelta sube, una
 *   semana seguida baja).
 *
 * Reglas del módulo:
 *
 * - **Un tramo por regla, el más específico**: dentro de cada regla se aplica
 *   COMO MUCHO un tramo —el de `desde…` mayor que encaje—, no todos los que
 *   encajen. Aplicarlos en cascada multiplicaría descuentos que nadie sumó.
 * - **Sin dato, la regla no aplica**: si no se conoce la antelación o la
 *   ocupación, ese tramo no entra. Nunca se inventa un valor para poder cobrar.
 * - **El Json de la base no es confiable**: se normaliza antes de usarse y una
 *   pieza malformada se **descarta** (nunca lanza, nunca deja vender a 0).
 * - **El factor tiene suelo y techo** (10 %–500 %): un ajuste de configuración
 *   no puede regalar la noche —«nunca vende a 0» es regla del sistema— ni
 *   multiplicarla por veinte.
 * - **Cambia multiplicando, no sumando**: dos tramos de −10 % dan −19 %, no
 *   −20 %. Es lo que espera quien escribe «−10 % de descuento» dos veces, y
 *   mantiene las reglas independientes entre sí.
 *
 * Alcance (decisión explícita): estas reglas son de la **reserva directa**.
 * Un calendario de tarifas por fecha —lo que viaja al canal— no puede expresar
 * «si se reserva con 30 días de antelación» ni «si la estancia es de 7 noches»,
 * así que el push sigue empujando la tarifa publicada de la capa 1. Inventar un
 * calendario distinto para el canal sería un precio que el hotel no configuró.
 */

// ─── Tipos de configuración ──────────────────────────────────────────────

/** Regla de antelación: días entre la reserva y la llegada. */
export interface TramoAntelacion {
  /** Antelación mínima (en días, incluida) para que el tramo aplique. */
  desdeDias: number;
  /** Antelación máxima (incluida). null = sin techo. */
  hastaDias: number | null;
  /** % sobre la tarifa de cada noche. Negativo = descuento, positivo = recargo. */
  porcentaje: number;
  /** Etiqueta para el operador («Early bird», «Última hora»). */
  nombre?: string;
}

/** Regla de ocupación: % de unidades vendibles ya ocupadas esa noche. */
export interface TramoOcupacion {
  /** Ocupación mínima (en %, incluida) para que el tramo aplique. */
  desdePorcentaje: number;
  porcentaje: number;
  nombre?: string;
}

/** Regla de duración: noches de la estancia. */
export interface TramoDuracion {
  /** Estancia mínima (en noches, incluida) para que el tramo aplique. */
  desdeNoches: number;
  porcentaje: number;
  nombre?: string;
}

/** Configuración de ajustes de un plan (tal como vive en el Json). */
export interface ConfigAjustes {
  antelacion: TramoAntelacion[] | null;
  ocupacion: TramoOcupacion[] | null;
  duracion: TramoDuracion[] | null;
}

export type TipoAjuste = 'antelacion' | 'ocupacion' | 'duracion';

/** Ajuste que ha tocado el precio, con lo justo para explicarlo en pantalla. */
export interface AjusteAplicado {
  tipo: TipoAjuste;
  porcentaje: number;
  nombre?: string;
}

// ─── Límites del módulo (guarda contra configuración absurda) ────────────

/** Un tramo suelto no puede descontar más del 90 % (la noche nunca es gratis). */
const PORCENTAJE_MIN = -90;
/** Ni recargar más del 500 % (un dedazo en la casilla de porcentaje). */
const PORCENTAJE_MAX = 500;
/** El factor combinado de todos los tramos vive en [0,1 , 5]. */
export const FACTOR_MINIMO = 0.1;
export const FACTOR_MAXIMO = 5;
/** Etiqueta de tramo: la misma longitud máxima que el nombre de una temporada. */
const LARGO_NOMBRE = 60;

// ─── Normalización: el Json de la base no es confiable, la configuración sí ──

function aNumero(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim()) return Number(valor);
  return NaN;
}

/** Entero ≥ 0, o null si el valor no sirve. */
function enteroNoNegativo(valor: unknown): number | null {
  const n = aNumero(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Porcentaje utilizable: ≠ 0, dentro de los límites del módulo. */
function porcentajeValido(valor: unknown): number | null {
  const n = aNumero(valor);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n < PORCENTAJE_MIN || n > PORCENTAJE_MAX) return null;
  return Math.round(n * 100) / 100;
}

function nombreDe(valor: unknown): { nombre?: string } {
  if (typeof valor !== 'string') return {};
  const limpio = valor.trim().slice(0, LARGO_NOMBRE);
  return limpio ? { nombre: limpio } : {};
}

/**
 * Normaliza la configuración cruda de ajustes. Acepta `unknown`: cualquier cosa
 * que venga del Json. Devuelve null cuando no queda ninguna regla utilizable,
 * para que el llamador sepa que el plan cotiza como siempre.
 */
export function normalizarAjustes(valor: unknown): ConfigAjustes | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const crudo = valor as Record<string, unknown>;

  const antelacion = normalizarAntelacion(crudo.antelacion);
  const ocupacion = normalizarOcupacion(crudo.ocupacion);
  const duracion = normalizarDuracion(crudo.duracion);

  if (!antelacion && !ocupacion && !duracion) return null;
  return { antelacion, ocupacion, duracion };
}

/** Tramos de antelación canónicos: del más específico (más días exigidos) al más general. */
export function normalizarAntelacion(valor: unknown): TramoAntelacion[] | null {
  if (!Array.isArray(valor)) return null;
  const limpias: TramoAntelacion[] = [];
  for (const fila of valor) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) continue;
    const f = fila as Record<string, unknown>;
    const desdeDias = enteroNoNegativo(f.desdeDias);
    if (desdeDias === null) continue;
    const hastaDias = f.hastaDias == null ? null : enteroNoNegativo(f.hastaDias);
    // Un tramo con techo inservible o invertido (hasta < desde) no es un tramo.
    if (f.hastaDias != null && hastaDias === null) continue;
    if (hastaDias !== null && hastaDias < desdeDias) continue;
    const porcentaje = porcentajeValido(f.porcentaje);
    if (porcentaje === null) continue;
    limpias.push({ desdeDias, hastaDias, porcentaje, ...nombreDe(f.nombre) });
  }
  if (!limpias.length) return null;
  return limpias.sort((a, b) => b.desdeDias - a.desdeDias);
}

/** Tramos de ocupación canónicos: del más exigente (más ocupación) al menos. */
export function normalizarOcupacion(valor: unknown): TramoOcupacion[] | null {
  if (!Array.isArray(valor)) return null;
  const limpias: TramoOcupacion[] = [];
  for (const fila of valor) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) continue;
    const f = fila as Record<string, unknown>;
    const desde = aNumero(f.desdePorcentaje);
    if (!Number.isFinite(desde) || desde < 0 || desde > 100) continue;
    const porcentaje = porcentajeValido(f.porcentaje);
    if (porcentaje === null) continue;
    limpias.push({
      desdePorcentaje: Math.round(desde * 10) / 10,
      porcentaje,
      ...nombreDe(f.nombre),
    });
  }
  if (!limpias.length) return null;
  return limpias.sort((a, b) => b.desdePorcentaje - a.desdePorcentaje);
}

/** Tramos de duración canónicos: de la estancia más larga a la más corta. */
export function normalizarDuracion(valor: unknown): TramoDuracion[] | null {
  if (!Array.isArray(valor)) return null;
  const limpias: TramoDuracion[] = [];
  for (const fila of valor) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) continue;
    const f = fila as Record<string, unknown>;
    const desdeNoches = enteroNoNegativo(f.desdeNoches);
    if (desdeNoches === null || desdeNoches < 1) continue;
    const porcentaje = porcentajeValido(f.porcentaje);
    if (porcentaje === null) continue;
    limpias.push({ desdeNoches, porcentaje, ...nombreDe(f.nombre) });
  }
  if (!limpias.length) return null;
  return limpias.sort((a, b) => b.desdeNoches - a.desdeNoches);
}

/** ¿El plan tiene alguna regla de capa 2 utilizable? */
export function tieneAjustes(valor: unknown): boolean {
  return normalizarAjustes(valor) !== null;
}

/**
 * ¿Quien llama PIDE reglas? (trae al menos una lista con tramos).
 *
 * Distingue «no mando ajustes» de «mando ajustes y no me queda ninguno
 * válido»: lo primero es un plan sin capa 2, lo segundo es un error del cliente
 * que la API contesta con 400 en lugar de guardar en silencio un plan que no
 * hace nada.
 */
export function pidenAjustes(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const crudo = valor as Record<string, unknown>;
  return (['antelacion', 'ocupacion', 'duracion'] as const).some(
    (clave) => Array.isArray(crudo[clave]) && (crudo[clave] as unknown[]).length > 0
  );
}

// ─── Aplicación: qué toca esta estancia (y esta noche) ───────────────────

/**
 * Ajustes que modifican el precio de UNA noche.
 *
 * La antelación y la duración son hechos de la estancia (valen para todas sus
 * noches); la ocupación es un hecho de la noche concreta, así que el llamador la
 * pasa por noche y una noche sin dato de ocupación se queda sin ese tramo.
 */
export function ajustesDeEstancia(params: {
  config: ConfigAjustes | null;
  noches: number;
  /** Días entre hoy y la llegada. null = sin dato → la regla no aplica. */
  diasAntelacion?: number | null;
  /** Ocupación (%) de esta noche. null = sin dato → la regla no aplica. */
  ocupacionPorcentaje?: number | null;
}): AjusteAplicado[] {
  const { config } = params;
  if (!config) return [];
  const aplicados: AjusteAplicado[] = [];

  const dias = params.diasAntelacion;
  if (config.antelacion && typeof dias === 'number' && Number.isFinite(dias)) {
    const antelacion = Math.max(0, Math.trunc(dias));
    const tramo = config.antelacion.find(
      (t) => antelacion >= t.desdeDias && (t.hastaDias === null || antelacion <= t.hastaDias)
    );
    if (tramo) aplicados.push({ tipo: 'antelacion', porcentaje: tramo.porcentaje, ...nombreDe(tramo.nombre) });
  }

  const ocupacion = params.ocupacionPorcentaje;
  if (config.ocupacion && typeof ocupacion === 'number' && Number.isFinite(ocupacion)) {
    const tramo = config.ocupacion.find((t) => ocupacion >= t.desdePorcentaje);
    if (tramo) aplicados.push({ tipo: 'ocupacion', porcentaje: tramo.porcentaje, ...nombreDe(tramo.nombre) });
  }

  if (config.duracion) {
    const noches = Math.max(1, Math.trunc(params.noches) || 1);
    const tramo = config.duracion.find((t) => noches >= t.desdeNoches);
    if (tramo) aplicados.push({ tipo: 'duracion', porcentaje: tramo.porcentaje, ...nombreDe(tramo.nombre) });
  }

  return aplicados;
}

/**
 * Factor multiplicativo de un conjunto de ajustes, con el suelo y el techo del
 * módulo. Sin ajustes devuelve 1 (la tarifa de la capa 1, intacta).
 */
export function factorDeAjustes(ajustes: readonly AjusteAplicado[]): number {
  const factor = ajustes.reduce((acc, a) => acc * (1 + a.porcentaje / 100), 1);
  return Math.min(FACTOR_MAXIMO, Math.max(FACTOR_MINIMO, factor));
}

/** Efecto total de los ajustes, en % (para etiquetas: −19 % son dos −10 %). */
export function porcentajeTotalDeAjustes(ajustes: readonly AjusteAplicado[]): number {
  return Math.round((factorDeAjustes(ajustes) - 1) * 1000) / 10;
}
