/**
 * Tipos del contrato de NOBEDS y del dominio normalizado.
 *
 * Todo lo que aquí se modela está **medido** contra `https://api.nobeds.com`
 * con el token público de demostración (26-oct-2026) o leído en su swagger real
 * (`/swagger/v2/swagger.json`, 52 operaciones). El detalle y las preguntas
 * abiertas viven en `docs/hospitality-nobeds-conectividad.md`; las decisiones de
 * este módulo salen de su §4 y §5.
 *
 * Regla de la casa que atraviesa estos tipos: **el nombre del proveedor no
 * aparece en UI, correos ni PDFs**; este módulo es material interno.
 *
 * Dos trampas del cable que están modeladas a propósito:
 *
 * 1. Su API **no es homogénea**: `GET /api/Status` responde en camelCase
 *    (`roomId`, `title`) y `GET /api/Rentals` en snake_case (`room_id`,
 *    `active: 1`, booleano en el otro). Por eso hay un tipo por recurso y no uno
 *    genérico de «habitación».
 * 2. `status` de una reserva es **texto libre** que mezcla estado de reserva con
 *    cobro y limpieza. El tipo normalizado separa esas familias y deja `estado`
 *    en `null` cuando el valor no dice nada del estado de la reserva
 *    (`Paid`, `Cleaned`…). Ver `mapa.ts`.
 */

/** Estados de reserva que entiende Volkern (`HospitalityReservation.estado`). */
export type EstadoReserva =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'checked_in'
  | 'checked_out'
  | 'no_show';

/** Familia de un valor de `status` del proveedor. */
export type FamiliaEstado = 'reserva' | 'cobro' | 'operacion' | 'desconocido';

/** Resultado de interpretar un `status` crudo. */
export interface EstadoNormalizado {
  /** Estado de reserva, o `null` si el valor no habla de la reserva. */
  estado: EstadoReserva | null;
  familia: FamiliaEstado;
  /** El valor existe en su documentación o en sus datos, pero requiere que alguien lo mire. */
  requiereRevision: boolean;
  /** `false` para un valor que no está ni en los 16 documentados ni en los 14 medidos. */
  conocido: boolean;
  crudo: string;
}

/** Un canal de distribución, normalizado a partir de `referral`. */
export interface CanalNormalizado {
  /** Código interno (`booking.com`, `airbnb`, `direct`…). Nunca vacío. */
  canal: string;
  /** `false` para un valor de `referral` fuera de la lista cerrada que pedimos. */
  conocido: boolean;
  crudo: string;
}

// ─── GET /api/Status ──────────────────────────────────────────────────────
// camelCase. `rentalsCount` es un contador, no la longitud del array.

export interface RentalEstadoNobeds {
  roomId: number;
  titulo: string;
  activo: boolean;
  /** Estado por canal: `Connected` / `Disconnected` / … tal cual lo manda. */
  integraciones: Record<string, string>;
}

export interface EstadoHotelNobeds {
  hotel: string | null;
  /** `subscriptionTill`: en el hotel demo está vencido y la API sigue respondiendo. */
  suscripcionHasta: string | null;
  activo: boolean;
  horaServidor: string | null;
  rentalsCount: number | null;
  rentals: RentalEstadoNobeds[];
}

// ─── GET /api/Rentals ─────────────────────────────────────────────────────
// snake_case, y `active` viene como 1/0 (en `Status`, booleano).

export interface RentalNobeds {
  roomId: number;
  titulo: string;
  activo: boolean;
  tipo: string | null;
  subtipo: string | null;
  estrellas: number | null;
  adultos: number;
  ninos: number;
  moneda: string | null;
  horaCheckIn: number | null;
  horaCheckOut: number | null;
  imagenes: string[];
  /**
   * Ids por canal tal como los publica (`booking_room_id`, `airbnb_listing_id`…).
   * Es el mapeo OTA legible y **no** se usa como clave interna: la clave es
   * `roomId` (ver `ConnectivityMapping.externalUnitCode`).
   */
  idsCanal: Record<string, string>;
}

// ─── GET /api/Availability ────────────────────────────────────────────────
// Parámetros medidos: `room_id`, `fromdate`, `todate` (en snake_case; con
// `from_date`/`to_date` los ignora y devuelve desde hoy).

export interface NocheNobeds {
  rid: number;
  roomId: number;
  /** `YYYY-MM-DD`. */
  fecha: string;
  precio: number | null;
  /** Unidades disponibles. `0` = cerrado. */
  cantidad: number | null;
  cerrado: boolean;
  /** Cerrado a la llegada / a la salida. */
  coa: boolean;
  cod: boolean;
  minStay: number | null;
  maxStay: number | null;
  /** `mah` en la fila; la antelación mínima en horas que documentan es otra (`advance_notice_hours`). */
  antelacionMinima: number | null;
  actualizado: string | null;
  /**
   * Histórico de cambios por noche (`"Availability modal SET quantity: 1…"`).
   * Es la única superficie de auditoría que responde: `GET /api/Logs` solo
   * devuelve latidos del demo. No se parsea: se conserva como texto.
   */
  comentario: string | null;
}

// ─── GET /api/Bookings ────────────────────────────────────────────────────
// `fromdate`/`todate` filtran por fecha de **CHECK-IN** (medido), no de
// reserva: es la semántica contrario al proveedor anterior.

export interface ReservaNobeds {
  /** `order_id`. Clave estable de la reserva en su PMS. */
  orderId: string;
  roomId: number | null;
  /** Código de canal normalizado. */
  canal: string;
  canalCrudo: string;
  /** `referral_order_id`: el id de la OTA. */
  referenciaCanal: string | null;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`. */
  checkOut: string;
  noches: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  adultos: number;
  ninos: number;
  bebes: number;
  precioNoche: number | null;
  /** `total` tal cual lo manda: no se recalcula. */
  total: number | null;
  estadoCrudo: string;
  /** `null` cuando el `status` no habla de la reserva (cobro, limpieza, desconocido). */
  estado: EstadoReserva | null;
  familiaEstado: FamiliaEstado;
  requiereRevision: boolean;
  descripcionEstado: string;
  /** `canceled`: en su PMS las canceladas **siguen en la lista** con esta marca. */
  canceladaEn: string | null;
  creadaEn: string | null;
  actualizadaEn: string | null;
  comentario: string | null;
}

// ─── Cliente ──────────────────────────────────────────────────────────────

export interface RangoFechasNobeds {
  /** `YYYY-MM-DD`. */
  desde: string;
  /** `YYYY-MM-DD`. */
  hasta: string;
}

/**
 * Cómo viaja el token al proveedor.
 *
 * `cabecera` es `Authorization: Bearer <token>`, que es lo que recomienda su
 * spec —«passing credentials in headers is recommended to prevent private keys
 * from appearing in URLs, web server access logs, and browser history»—;
 * `ruta` es la forma heredada `/api/{Recurso}/{token}`, que su spec marca como
 * *legacy / backward-compatible* y que **sigue respondiendo** (medido el
 * 27-oct-2026: las dos dan 200 con el mismo cuerpo).
 */
export type ModoAutenticacionNobeds = 'cabecera' | 'ruta';

export interface OpcionesClienteNobeds {
  /** Token **de la propiedad** (los suyos son por hotel). Obligatorio. */
  token: string;
  /** Por defecto `https://api.nobeds.com`. */
  baseUrl?: string;
  /** Inyectable en pruebas; por defecto el `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Por defecto 15 s. */
  timeoutMs?: number;
  /** Por defecto `cabecera`. `ruta` es la vuelta atrás sin cambiar código. */
  autenticacion?: ModoAutenticacionNobeds;
}
