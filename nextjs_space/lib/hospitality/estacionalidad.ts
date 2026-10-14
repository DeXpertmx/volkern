/**
 * Estacionalidad (FASE de pricing — capa 1 del pricing dinámico).
 *
 * Qué es: el precio por noche de un rate plan ya no es un número plano, es una
 * **tarifa base** con dos capas opcionales:
 *
 * - `temporadas`: rangos de fechas con su propia tarifa (julio 150, agosto 180).
 * - `temporadas[].minNoches` / `.maxNoches`: estancia mínima y máxima para las
 *   LLEGADAS dentro del rango (julio, de 3 a 7 noches).
 * - `temporadas[].checkInDias` / `.checkOutDias`: días 0-6 en los que se puede
 *   entrar o salir (julio, solo entradas de sábado).
 * - `finDeSemana`: recargo porcentual para noches de días concretos (vie/sáb +20%).
 *
 * Las reglas de venta de una temporada (mínimo, máximo, días de entrada y de
 * salida) se deciden por la **fecha de llegada**: un check-in dentro del rango
 * se juzga entero con la regla de esa temporada — no una noche con una y otra
 * con otra. Es el estándar hotelero y es exactamente lo que el contrato de
 * canales sabe expresar por fecha (`minimumStayArrival`, `maximumStayArrival`,
 * `closeOnArrival`/`closeOnDeparture`), así que la misma regla vale para la web
 * de reservas, la reserva y el push — un solo motor, ninguna discrepancia.
 *
 * La temporada **reemplaza campo a campo** lo que diga el plan: si define
 * mínimo, máximo o días, son los suyos (igual que su tarifa es absoluta y no un
 * ajuste); lo que no defina lo pone el plan, y sin plan quedan los valores
 * neutros (mínimo 1, sin máximo, sin días cerrados).
 *
 * La regla central que decide el diseño: **el precio se aplica POR NOCHE** —
 * la noche del 15 de julio cuesta tarifa de julio aunque el check-in fuera en
 * junio. Es el modelo estándar de hotel, es el que el canal ya entiende (el
 * push de tarifas viaja por fechas) y es el único que no permite que un rango
 * de temporada "absorba" noches que no le tocan.
 *
 * Módulo PURO: sin base de datos, sin HTTP, sin dependencias de Prisma. Las
 * mismas reglas atienden el booking engine (cotizarEstancia) y la expansión
 * del push de tarifas (buildRateUpdates). Dos motores de precio distintos
 * sería exactamente la discrepancia página-vs-reserva que este sistema evita.
 *
 * La configuración vive en `HospitalityRatePlan.temporadas` / `.finDeSemana`
 * (Json?). JSON y no tablas propias a propósito: es configuración del plan que
 * se lee entera y se escribe entera junto al resto de sus campos (la API de
 * rate plans ya actualiza el plan en bloque), y nunca se consulta por pieza.
 */

import { startOfDay, toIsoDate } from './calendar';

// ─── Tipos de configuración ──────────────────────────────────────────────

/** Rango de temporada dentro de un rate plan. */
export interface TemporadaTarifa {
  /** Fecha ISO local (YYYY-MM-DD) del primer día que cuesta esta tarifa. */
  desde: string;
  /** Fecha ISO local (YYYY-MM-DD) del último día que cuesta esta tarifa. */
  hasta: string;
  /** Precio por noche dentro del rango. 0 o negativo = rango inválido (se ignora). */
  tarifa: number;
  /**
   * Estancia mínima en noches para las LLEGADAS dentro del rango, evaluada por
   * la fecha de entrada (semántica de `minimumStayArrival` en el contrato).
   * Ausente = la temporada no impone mínimo propio y manda el del plan.
   */
  minNoches?: number;
  /**
   * Estancia máxima en noches para las LLEGADAS dentro del rango
   * (`maximumStayArrival`). Ausente = manda el máximo del plan (o ninguno).
   */
  maxNoches?: number;
  /** Días 0-6 en los que se permite entrar; ausente = los del plan. */
  checkInDias?: number[];
  /** Días 0-6 en los que se permite salir; ausente = los del plan. */
  checkOutDias?: number[];
  /** Etiqueta opcional para el UI ("Verano", "Puente de diciembre"). */
  nombre?: string;
}

/** Recargo de fin de semana por días de la semana (0=domingo … 6=sábado). */
export interface FinDeSemanaTarifa {
  /** Días de la semana a los que aplica el recargo. Vacío o nulo = sin recargo. */
  dias: number[];
  /** Recargo porcentual sobre la tarifa de la noche (0-…). 0 = sin recargo. */
  porcentaje: number;
}

/** Configuración de precio por fecha de un rate plan (tal como vive en el Json). */
export interface ConfigEstacionalidad {
  temporadas?: TemporadaTarifa[] | null;
  finDeSemana?: FinDeSemanaTarifa | null;
}

// ─── Normalización: el Json de la base no es confiable, la configuración sí ──

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Techo de las noches de una temporada (mínimo y máximo). No es una regla de
 * negocio sino un tope de cordura: una estancia de más de un año no es una
 * estancia, y sin límite un dedazo ("3650") dejaría la temporada invendible sin
 * que nada lo dijera. Se exporta para que la API y el UI expliquen el mismo
 * número.
 */
export const NOCHES_TEMPORADA_MAX = 365;

function esDiaValido(d: unknown): d is number {
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6;
}

function fechaIsoValida(valor: unknown): valor is string {
  return typeof valor === 'string' && ISO_DATE.test(valor) && !Number.isNaN(new Date(`${valor}T00:00:00`).getTime());
}

function tarifaValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

/**
 * Lee un límite de noches de una temporada (mínimo o máximo): entero 1-365;
 * cualquier otra cosa (vacío, texto que no es número, decimal, 0, negativos) es
 * «sin regla», no un error que descarte la temporada — perder una tarifa de
 * temporada por un mínimo mal escrito sería un precio que el hotel sí
 * configuró.
 */
function leerNoches(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= NOCHES_TEMPORADA_MAX ? n : null;
}

/**
 * Lee los días de la semana permitidos de una temporada: enteros 0-6
 * (0=domingo), sin duplicados y ordenados. Ausente o vacío = «sin regla» (manda
 * lo que diga el plan). Un día inválido se descarta pieza a pieza, nunca la
 * temporada: quedarse sin la tarifa de julio por un dedazo en un día sería
 * perder un precio que el hotel sí configuró.
 */
function leerDiasDeSemana(valor: unknown): number[] | null {
  if (!Array.isArray(valor)) return null;
  const dias = valor
    .map((d) => (typeof d === 'number' ? d : typeof d === 'string' && d.trim() !== '' ? Number(d) : NaN))
    .filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
  const unicos = [...new Set(dias)].sort((a, b) => a - b);
  return unicos.length ? unicos : null;
}

/**
 * Normaliza la configuración cruda que venga de la base (o de un body de API).
 * Acepta `unknown`: el Json de Postgres puede contener cualquier cosa y un
 * rango malformado no puede tumbar una cotización — se descarta la pieza mala,
 * nunca se lanza. Devuelve null cuando no queda nada utilizable (sin
 * temporadas y sin fin de semana), para que el llamador caiga a la tarifa plana.
 */
export function normalizarEstacionalidad(valor: unknown): ConfigEstacionalidad | null {
  if (!valor || typeof valor !== 'object') return null;
  // La columna `temporadas` guarda la LISTA directamente ([{desde,hasta,
  // tarifa,…}]) y `finDeSemana` el objeto {dias, porcentaje}: aceptar ambos
  // formatos en la raíz es lo que permite pasar el Json crudo de la fila sin
  // envoltorios (plan.temporadas ?? plan.finDeSemana).
  if (Array.isArray(valor)) return normalizarEstacionalidad({ temporadas: valor });
  const crudo = valor as Record<string, unknown>;
  // Y la config de fin de semana también puede llegar directa ({dias,
  // porcentaje}) — misma razón que la lista de temporadas.
  if ('dias' in crudo || 'porcentaje' in crudo) return normalizarEstacionalidad({ finDeSemana: valor });

  let temporadas: TemporadaTarifa[] | null = null;
  if (Array.isArray(crudo.temporadas)) {
    const limpias: TemporadaTarifa[] = [];
    for (const fila of crudo.temporadas) {
      if (!fila || typeof fila !== 'object' || Array.isArray(fila)) continue;
      const f = fila as Record<string, unknown>;
      // Números que llegan como string del UI ("150") se aceptan; lo que no
      // sea un precio positivo descarta el rango entero (mitad de una tarifa
      // no es una tarifa).
      const tarifa = typeof f.tarifa === 'number' ? f.tarifa : typeof f.tarifa === 'string' ? Number(f.tarifa) : NaN;
      if (!fechaIsoValida(f.desde) || !fechaIsoValida(f.hasta) || !tarifaValida(tarifa)) continue;
      if (new Date(`${f.hasta}T00:00:00`).getTime() < new Date(`${f.desde}T00:00:00`).getTime()) continue;
      const minNoches = leerNoches(f.minNoches);
      const maxNochesCrudo = leerNoches(f.maxNoches);
      // Un máximo por debajo del mínimo es una temporada invendible: se descarta
      // el máximo (la pieza que contradice), nunca la temporada — el precio y el
      // mínimo del hotel se conservan. La API responde 400 si el hotel acaba de
      // enviar esa contradicción, así que este camino es el del Json ya guardado.
      const maxNoches =
        maxNochesCrudo != null && minNoches != null && maxNochesCrudo < minNoches
          ? null
          : maxNochesCrudo;
      const checkInDias = leerDiasDeSemana(f.checkInDias);
      const checkOutDias = leerDiasDeSemana(f.checkOutDias);
      limpias.push({
        desde: f.desde,
        hasta: f.hasta,
        tarifa: Math.round(tarifa * 100) / 100,
        ...(minNoches != null ? { minNoches } : {}),
        ...(maxNoches != null ? { maxNoches } : {}),
        ...(checkInDias ? { checkInDias } : {}),
        ...(checkOutDias ? { checkOutDias } : {}),
        ...(typeof f.nombre === 'string' && f.nombre.trim() ? { nombre: f.nombre.trim().slice(0, 60) } : {}),
      });
    }
    if (limpias.length) temporadas = limpias;
  }

  let finDeSemana: FinDeSemanaTarifa | null = null;
  if (crudo.finDeSemana && typeof crudo.finDeSemana === 'object' && !Array.isArray(crudo.finDeSemana)) {
    const f = crudo.finDeSemana as Record<string, unknown>;
    const diasCrudos = Array.isArray(f.dias) ? f.dias : [];
    const dias = [...new Set(diasCrudos.filter(esDiaValido))].sort((a, b) => a - b);
    const porcentaje = typeof f.porcentaje === 'number' ? f.porcentaje : typeof f.porcentaje === 'string' ? Number(f.porcentaje) : NaN;
    if (dias.length > 0 && Number.isFinite(porcentaje) && porcentaje > 0) {
      finDeSemana = { dias, porcentaje: Math.min(porcentaje, 500) };
    }
  }

  if (!temporadas && !finDeSemana) return null;
  return { temporadas: temporadas ?? null, finDeSemana };
}

/**
 * La tabla de temporadas ya normalizada se reordena por fecha de inicio. Se
 * exporta para que la API pueda persistirla canónica (determinista para el
 * push y para el diff visual del UI).
 */
export function ordenarTemporadas(temporadas: TemporadaTarifa[]): TemporadaTarifa[] {
  return [...temporadas].sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
}

/**
 * Primer problema de las temporadas que se acaban de enviar, o null.
 *
 * El normalizador descarta en silencio la pieza mala a propósito: el Json de la
 * base puede venir de cualquier época y un dato raro no puede tumbar una
 * cotización. Pero cuando el hotel acaba de enviarlo, descartarlo sin decir
 * nada sería una restricción que cree tener puesta y no existe — justo la clase
 * de fallo silencioso que este sistema no admite en conectividad. Las rutas de
 * escritura usan esto para responder 400 con el motivo exacto.
 *
 * Un campo ausente, `null` o cadena vacía NO es un problema: es «sin regla».
 */
export function problemaEnTemporadas(valor: unknown): string | null {
  if (!Array.isArray(valor)) return null;
  for (const fila of valor) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) continue;
    const f = fila as Record<string, unknown>;
    const pedido = (campo: unknown) => campo != null && campo !== '';

    const minNoches = pedido(f.minNoches) ? leerNoches(f.minNoches) : null;
    if (pedido(f.minNoches) && minNoches === null) {
      return `El mínimo de noches de una temporada debe ser un número entero entre 1 y ${NOCHES_TEMPORADA_MAX}`;
    }
    const maxNoches = pedido(f.maxNoches) ? leerNoches(f.maxNoches) : null;
    if (pedido(f.maxNoches) && maxNoches === null) {
      return `El máximo de noches de una temporada debe ser un número entero entre 1 y ${NOCHES_TEMPORADA_MAX}`;
    }
    if (minNoches != null && maxNoches != null && maxNoches < minNoches) {
      return 'El máximo de noches de una temporada no puede ser menor que su mínimo';
    }

    for (const [campo, etiqueta] of [['checkInDias', 'entrada'], ['checkOutDias', 'salida']] as const) {
      const dias = f[campo];
      if (dias == null) continue;
      if (!Array.isArray(dias)) {
        return `Los días de ${etiqueta} de una temporada deben ser una lista de días 0 (domingo) a 6 (sábado)`;
      }
      const fuera = dias.some((d) => {
        const n = typeof d === 'number' ? d : typeof d === 'string' && d.trim() !== '' ? Number(d) : NaN;
        return !Number.isInteger(n) || n < 0 || n > 6;
      });
      if (fuera) {
        return `Los días de ${etiqueta} de una temporada deben estar entre 0 (domingo) y 6 (sábado)`;
      }
    }
  }
  return null;
}

/** ¿El plan tiene alguna capa de estacionalidad utilizable? */
export function tieneEstacionalidad(valor: unknown): boolean {
  return normalizarEstacionalidad(valor) !== null;
}

// ─── Cálculo: el precio de una NOCHE ─────────────────────────────────────

/**
 * Temporada que contiene una fecha (la noche), o null.
 *
 * Es la ÚNICA forma de decidir a qué temporada pertenece un día: la comparten
 * el precio (`tarifaPorNoche`) y las reglas de venta
 * (`reglasDeVentaDeLlegada`), para que no existan dos comparaciones de rango
 * que puedan desincronizarse (una noche de temporada sin sus reglas sería un
 * precio y unas condiciones que no se corresponden).
 */
export function temporadaDeFecha(
  config: ConfigEstacionalidad | null,
  fecha: Date
): TemporadaTarifa | null {
  if (!config?.temporadas?.length) return null;
  return (
    config.temporadas.find(
      (t) =>
        fecha.getTime() >= new Date(`${t.desde}T00:00:00`).getTime() &&
        fecha.getTime() <= new Date(`${t.hasta}T00:00:00`).getTime()
    ) ?? null
  );
}

/**
 * Precio por noche de una fecha concreta bajo un plan.
 *
 * Precedencia: temporada que contenga la fecha → tarifa del plan → tarifa base.
 * La tarifa de temporada es ABSOLUTA (no un multiplicador): "julio 150" es 150,
 * venga de donde venga la tarifa base. Un recargo de fin de semana solo aplica
 * a noches SIN temporada (las temporadas ya definen su precio completo; un
 * +20% encima de un precio ya fijado a mano sería un precio que nadie
 * configuró).
 *
 * `diaSemana` opcional: día 0-6 de la noche (se calcula de la fecha si falta).
 * Devuelve null si no hay ninguna tarifa utilizable (no se puede vender).
 */
export function tarifaPorNoche(params: {
  fecha: Date;
  tarifaBase: number | null | undefined;
  plan?: { tarifa?: number | null; estacionalidad?: unknown } | null;
  /** Día 0-6 de la noche; se calcula de la fecha si falta. */
  diaSemana?: number;
}): number | null {
  const config = normalizarEstacionalidad(params.plan?.estacionalidad);

  const dentro = temporadaDeFecha(config, params.fecha);
  if (dentro) {
    return tarifaValida(dentro.tarifa) ? dentro.tarifa : null;
  }

  // Sin temporada: tarifa del plan, o la base de la unidad como respaldo.
  const tarifa =
    typeof params.plan?.tarifa === 'number' && Number.isFinite(params.plan.tarifa) && params.plan.tarifa > 0
      ? params.plan.tarifa
      : typeof params.tarifaBase === 'number' && Number.isFinite(params.tarifaBase) && params.tarifaBase > 0
        ? params.tarifaBase
        : null;
  if (tarifa === null) return null;

  const fw = config?.finDeSemana;
  if (fw && fw.dias.length > 0 && fw.porcentaje > 0) {
    const dia = Number.isInteger(params.diaSemana) ? (params.diaSemana as number) : startOfDay(params.fecha).getDay();
    if (fw.dias.includes(dia)) {
      return Math.round(tarifa * (1 + fw.porcentaje / 100) * 100) / 100;
    }
  }
  return tarifa;
}

/** Reglas de venta de una estancia, ya resueltas para su fecha de llegada. */
export interface ReglasDeVenta {
  /** Estancia mínima en noches. Siempre ≥ 1 (1 = sin mínimo real). */
  minNoches: number;
  /** Estancia máxima en noches; null = sin máximo. */
  maxNoches: number | null;
  /** Días 0-6 en los que se permite entrar; null = sin restricción. */
  checkInDias: number[] | null;
  /** Días 0-6 en los que se permite salir; null = sin restricción. */
  checkOutDias: number[] | null;
}

/**
 * Reglas de venta que aplican a una LLEGADA.
 *
 * Manda la temporada que contiene la fecha de entrada, **campo a campo**: su
 * mínimo, su máximo y sus días de entrada y salida reemplazan a los del plan
 * (igual que su tarifa es absoluta y no un ajuste). Lo que la temporada no
 * defina lo pone el plan, y sin plan quedan los valores neutros (mínimo 1, sin
 * máximo, sin días cerrados).
 *
 * Todo sale de la MISMA temporada —la de la llegada, no la de cada fecha por
 * separado—: una estancia se juzga entera con la regla de donde empieza, que es
 * lo que el canal sabe expresar por fecha (`minimumStayArrival`,
 * `maximumStayArrival`, `closeOnArrival`/`closeOnDeparture`). Es el número que
 * validan la web de reservas, la reserva directa y el push: una sola regla para
 * los tres, y por eso el cálculo vive aquí y no en cada llamador.
 */
export function reglasDeVentaDeLlegada(params: {
  /** Fecha de LLEGADA de la estancia. */
  fecha: Date;
  /** Estacionalidad del plan (Json crudo: `temporadas`). */
  estacionalidad?: unknown;
  /** Restricciones generales del plan (fila de Prisma: Json crudo incluido). */
  plan?: {
    minNoches?: number | null;
    maxNoches?: number | null;
    checkInDias?: unknown;
    checkOutDias?: unknown;
  } | null;
}): ReglasDeVenta {
  const planMin =
    typeof params.plan?.minNoches === 'number' &&
    Number.isInteger(params.plan.minNoches) &&
    params.plan.minNoches >= 1
      ? params.plan.minNoches
      : 1;
  const planMax =
    typeof params.plan?.maxNoches === 'number' &&
    Number.isInteger(params.plan.maxNoches) &&
    params.plan.maxNoches >= 1
      ? params.plan.maxNoches
      : null;
  const planCheckIn = leerDiasDeSemana(params.plan?.checkInDias);
  const planCheckOut = leerDiasDeSemana(params.plan?.checkOutDias);

  const temporada = temporadaDeFecha(
    normalizarEstacionalidad(params.estacionalidad),
    params.fecha
  );

  return {
    minNoches: temporada?.minNoches ?? planMin,
    maxNoches: temporada?.maxNoches ?? planMax,
    checkInDias: temporada?.checkInDias ?? planCheckIn,
    checkOutDias: temporada?.checkOutDias ?? planCheckOut,
  };
}

/** El plan activo de una unidad o la tarifa base: ¿hay precio con que vender? */
export function hayPrecioPlan(params: {
  plan?: { tarifa?: number | null } | null;
  tarifaBase?: number | null | undefined;
}): boolean {
  if (typeof params.plan?.tarifa === 'number' && Number.isFinite(params.plan.tarifa) && params.plan.tarifa > 0) return true;
  return typeof params.tarifaBase === 'number' && Number.isFinite(params.tarifaBase) && params.tarifaBase > 0;
}

// ─── Series y totales: lo que consumen el engine y el push ───────────────

/**
 * Serie día a día de precios para un rango de NOCHES ([checkIn, checkOut)):
 * el índice 0 es el precio de la noche del check-in. Para el rango total del
 * push, `nochesEntre` con el fin exclusivo del contrato.
 */
export function serieDeTarifas(params: {
  desde: Date;
  hasta: Date; // EXCLUSIVO
  tarifaBase: number | null | undefined;
  plan?: { tarifa?: number | null; estacionalidad?: unknown } | null;
}): Array<{ fecha: string; tarifa: number | null }> {
  const serie: Array<{ fecha: string; tarifa: number | null }> = [];
  for (let cursor = startOfDay(params.desde); cursor.getTime() < startOfDay(params.hasta).getTime(); cursor.setDate(cursor.getDate() + 1)) {
    serie.push({
      fecha: toIsoDate(cursor),
      tarifa: tarifaPorNoche({ fecha: cursor, tarifaBase: params.tarifaBase, plan: params.plan }),
    });
  }
  return serie;
}

/** Suma de una serie ignorando noches sin precio (esas se auditan aparte). */
export function totalDeSerie(serie: Array<{ tarifa: number | null }>): number | null {
  let total = 0;
  let alguna = false;
  for (const fila of serie) {
    if (fila.tarifa === null) continue;
    alguna = true;
    total += fila.tarifa;
  }
  return alguna ? Math.round(total * 100) / 100 : null;
}

/** Suma de la serie del rango: el precio total de la estancia. */
export function precioEstancia(params: {
  checkIn: Date;
  checkOut: Date; // EXCLUSIVO
  tarifaBase: number | null | undefined;
  plan?: { tarifa?: number | null; estacionalidad?: unknown } | null;
}): number | null {
  return totalDeSerie(
    serieDeTarifas({
      desde: params.checkIn,
      hasta: params.checkOut,
      tarifaBase: params.tarifaBase,
      plan: params.plan,
    })
  );
}
