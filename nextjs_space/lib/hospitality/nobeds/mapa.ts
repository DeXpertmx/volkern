/**
 * Decisiones puras del adaptador de NOBEDS: estado, canal, ventana de sondeo y
 * mapeo habitación ↔ unidad. Sin red, sin base de datos, sin relojes ocultos.
 *
 * Estas cuatro funciones son el sitio donde el cambio de proveedor se juega de
 * verdad (§4 y §6 del plan): un `status` mal leído es una habitación vendida dos
 * veces, y un `room_id` mal mapeado es una reserva en la unidad equivocada.
 */

import type {
  CanalNormalizado,
  EstadoNormalizado,
  EstadoReserva,
  FamiliaEstado,
  ReservaNobeds,
} from './tipos';

// ─── Estado de la reserva ─────────────────────────────────────────────────

/**
 * Dos hechos medidos que ordenan esta tabla:
 *
 * - `status` **no distingue mayúsculas de forma fiable**: en el hotel demo
 *   conviven `Approved` (118) y `approved` (2). Se normaliza a minúsculas.
 * - Su documentación publica 16 estados que **mezclan reserva, cobro y
 *   limpieza**, y algunos se ponen a mano. Por eso `Paid`, `Cleaned`, `Debtor`…
 *   devuelven `estado: null`: no cambian el estado de la reserva ni, mucho menos,
 *   cierran o abren noches.
 *
 * Un valor desconocido **tampoco** se adivina: `estado: null`, `conocido: false`
 * y `requiereRevision: true`. El llamador debe conservar el estado que ya tenía
 * y dejar constancia, nunca inventar uno.
 */
const TABLA_ESTADOS: Record<
  string,
  { estado: EstadoReserva | null; familia: FamiliaEstado; requiereRevision: boolean }
> = {
  // Familia reserva — ciclo documentado y medido.
  new: { estado: 'pending', familia: 'reserva', requiereRevision: false },
  approved: { estado: 'confirmed', familia: 'reserva', requiereRevision: false },
  // `modified` es un estado de reposo que un operador tiene que limpiar: la
  // reserva sigue en pie, pero hay algo que mirar.
  modified: { estado: 'confirmed', familia: 'reserva', requiereRevision: true },
  checkin: { estado: 'checked_in', familia: 'reserva', requiereRevision: false },
  checkedin: { estado: 'checked_in', familia: 'reserva', requiereRevision: false },
  checkout: { estado: 'checked_out', familia: 'reserva', requiereRevision: false },
  checkedout: { estado: 'checked_out', familia: 'reserva', requiereRevision: false },
  completed: { estado: 'checked_out', familia: 'reserva', requiereRevision: false },
  noshow: { estado: 'no_show', familia: 'reserva', requiereRevision: false },
  cancelled: { estado: 'cancelled', familia: 'reserva', requiereRevision: false },
  canceled: { estado: 'cancelled', familia: 'reserva', requiereRevision: false },

  // Medido en sus datos y **ausente** de los 16 documentados: se acepta como
  // pendiente, pero se marca para que alguien confirme qué significa.
  registered: { estado: 'pending', familia: 'reserva', requiereRevision: true },

  // Familia cobro — no dice nada del estado de la reserva.
  paid: { estado: null, familia: 'cobro', requiereRevision: true },
  paidbank: { estado: null, familia: 'cobro', requiereRevision: true },
  paidcc: { estado: null, familia: 'cobro', requiereRevision: true },
  paidota: { estado: null, familia: 'cobro', requiereRevision: true },
  prepaid: { estado: null, familia: 'cobro', requiereRevision: true },
  debtor: { estado: null, familia: 'cobro', requiereRevision: true },
  invalidcc: { estado: null, familia: 'cobro', requiereRevision: true },

  // Familia operación — `Cleaned` es limpieza y **no afecta disponibilidad**.
  cleaned: { estado: null, familia: 'operacion', requiereRevision: false },

  // Marcado como problemático: la reserva existe, pero el estado hay que mirarlo.
  problematic: { estado: null, familia: 'reserva', requiereRevision: true },
};

/** Minúsculas, sin espacios ni guiones: `Checked-In` y `checked_in` son lo mismo. */
function claveEstado(crudo: string): string {
  return crudo
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function normalizarEstadoReserva(crudo: string | null | undefined): EstadoNormalizado {
  const texto = (crudo ?? '').trim();
  const fila = TABLA_ESTADOS[claveEstado(texto)];
  if (!fila) {
    return {
      estado: null,
      familia: 'desconocido',
      requiereRevision: true,
      conocido: false,
      crudo: texto,
    };
  }
  return { ...fila, conocido: true, crudo: texto };
}

// ─── Canal ────────────────────────────────────────────────────────────────

/**
 * `referral` es texto libre. Los valores de abajo son los medidos en el demo y
 * los que documentan; su lista **cerrada** sigue pedida (pregunta 31 del plan),
 * así que un valor fuera de aquí se conserva tal cual, en minúsculas, marcado
 * como no conocido.
 *
 * `nobeds.app` se mantiene **distinto** de `direct`: es su motor de reservas
 * propio (48 reservas en el demo). Si no se desactiva por hotel, es un segundo
 * camino de venta directa y hay que poder verlo separado del nuestro.
 */
const TABLA_CANALES: Record<string, string> = {
  direct: 'direct',
  directengine: 'direct',
  directstep: 'direct',
  onepage: 'direct',
  'nobeds.app': 'nobeds.app',
  booking: 'booking.com',
  'booking.com': 'booking.com',
  airbnb: 'airbnb',
  expedia: 'expedia',
  agoda: 'agoda.com',
  'agoda.com': 'agoda.com',
  hostelworld: 'hostelworld',
  trip: 'trip.com',
  'trip.com': 'trip.com',
  manual: 'manual',
};

function claveCanal(crudo: string): string {
  // Sin espacios: el demo trae `Direct Engine` y `Direct step`, que son el mismo
  // canal con dos nombres de interfaz distintos.
  return crudo.trim().toLowerCase().replace(/\s+/g, '');
}

export function canalDeReferral(crudo: string | null | undefined): CanalNormalizado {
  const texto = (crudo ?? '').trim();
  const clave = claveCanal(texto);
  if (!clave) return { canal: 'desconocido', conocido: false, crudo: texto };

  const conocido = TABLA_CANALES[clave];
  if (conocido) return { canal: conocido, conocido: true, crudo: texto };

  // Valor fuera de la lista: se guarda en minúsculas para no partir el mismo
  // canal en dos por una mayúscula, pero se marca para revisarlo.
  return { canal: clave, conocido: false, crudo: texto };
}

// ─── Ventana de sondeo ────────────────────────────────────────────────────

/** Horizonte de venta de la casa (`DIAS_HORIZONTE_VENTA`). */
export const HORIZONTE_VENTA_DIAS = 730;

function isoDeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha.getTime());
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

/**
 * Ventana de sondeo por **fecha de check-in**, que es como filtra su API
 * (medido: una reserva creada el 6-feb para el 18-feb aparece en la ventana del
 * 15–20 y no en la del 1–10).
 *
 * Consecuencia de diseño: para ver a los huéspedes que están **dentro** hay que
 * retroceder al menos la estancia más larga que permitan los planes, no la
 * antigüedad de la reserva. Ese retroceso entra por parámetro; no se inventa aquí.
 */
export function ventanaPorCheckIn(entrada: {
  hoy: Date;
  /** Días hacia atrás. Debe cubrir la estancia más larga vendible (+ margen). */
  diasRetraso: number;
  /** Días hacia delante. Por defecto el horizonte de venta de la casa. */
  diasHorizonte?: number;
}): { desde: string; hasta: string } {
  const { hoy, diasRetraso } = entrada;
  const diasHorizonte = entrada.diasHorizonte ?? HORIZONTE_VENTA_DIAS;
  if (!Number.isFinite(diasRetraso) || diasRetraso < 0) {
    throw new Error('diasRetraso debe ser un número de días >= 0');
  }
  if (!Number.isFinite(diasHorizonte) || diasHorizonte < 0) {
    throw new Error('diasHorizonte debe ser un número de días >= 0');
  }
  const base = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  );
  return {
    desde: isoDeFecha(sumarDias(base, -diasRetraso)),
    hasta: isoDeFecha(sumarDias(base, diasHorizonte)),
  };
}

// ─── Mapeo habitación ↔ unidad ────────────────────────────────────────────

export interface HabitacionDelCanal {
  roomId: number;
  titulo?: string;
  activo?: boolean;
}

export interface VinculoDeUnidad {
  unitId: string;
  /** `ConnectivityMapping.externalUnitCode`; se compara como texto. */
  externalUnitCode: string;
}

export interface MapeoHabitaciones {
  vinculadas: Array<{ roomId: number; unitId: string; titulo: string | null }>;
  /** Habitaciones del canal sin unidad nuestra: no se inventa una, es incidencia. */
  sinVinculo: HabitacionDelCanal[];
  /** Vínculos que apuntan a un `room_id` que ya no está en el catálogo. */
  huerfanos: VinculoDeUnidad[];
  /** Dos unidades nuestras apuntando a la misma habitación: sobreventa segura. */
  conflictos: Array<{ roomId: number; unitIds: string[] }>;
  /** Valores `room_id` repetidos en el catálogo (no debería ocurrir). */
  duplicados: number[];
}

/**
 * Cruza el catálogo del canal (`GET /api/Rentals`) con los vínculos guardados.
 *
 * No decide, no escribe y no crea unidades: clasifica. Un `room_id` sin vínculo
 * y un vínculo sin `room_id` son **incidencias visibles**, que es exactamente lo
 * que el plan pide para las 58 reservas huérfanas que ya vimos en su demo.
 */
export function mapearHabitaciones(
  habitaciones: HabitacionDelCanal[],
  vinculos: VinculoDeUnidad[]
): MapeoHabitaciones {
  const porCodigo = new Map<string, VinculoDeUnidad[]>();
  for (const vinculo of vinculos) {
    const codigo = String(vinculo.externalUnitCode ?? '').trim();
    if (!codigo) continue;
    const lista = porCodigo.get(codigo) ?? [];
    lista.push(vinculo);
    porCodigo.set(codigo, lista);
  }

  const vistas = new Set<number>();
  const duplicados: number[] = [];
  const vinculadas: MapeoHabitaciones['vinculadas'] = [];
  const sinVinculo: HabitacionDelCanal[] = [];
  const conflictos: MapeoHabitaciones['conflictos'] = [];
  const codigosCubiertos = new Set<string>();

  for (const habitacion of habitaciones) {
    if (vistas.has(habitacion.roomId)) {
      duplicados.push(habitacion.roomId);
      continue;
    }
    vistas.add(habitacion.roomId);

    const codigo = String(habitacion.roomId);
    const candidatos = porCodigo.get(codigo) ?? [];
    codigosCubiertos.add(codigo);

    if (candidatos.length === 0) {
      sinVinculo.push(habitacion);
      continue;
    }
    if (candidatos.length > 1) {
      conflictos.push({
        roomId: habitacion.roomId,
        unitIds: candidatos.map((c) => c.unitId),
      });
      continue;
    }
    vinculadas.push({
      roomId: habitacion.roomId,
      unitId: candidatos[0].unitId,
      titulo: habitacion.titulo ?? null,
    });
  }

  const huerfanos = vinculos.filter(
    (v) => !codigosCubiertos.has(String(v.externalUnitCode ?? '').trim())
  );

  return { vinculadas, sinVinculo, huerfanos, conflictos, duplicados };
}

// ─── Huella para el diferencial ───────────────────────────────────────────

/**
 * Clave de comparación entre ciclos. Se apoya en `updated`, que en su demo
 * cambia en 276 de 305 filas respecto de `created`, y en la marca de
 * cancelación. `status` entra para detectar un cambio de estado que no mueva
 * `updated`.
 */
export function huellaReserva(reserva: ReservaNobeds): string {
  return [reserva.actualizadaEn ?? '', reserva.estadoCrudo, reserva.canceladaEn ?? ''].join('|');
}

/** Una reserva está cancelada si lo dice el estado **o** si trae `canceled`. */
export function estaCancelada(reserva: ReservaNobeds): boolean {
  return reserva.estado === 'cancelled' || Boolean(reserva.canceladaEn);
}
