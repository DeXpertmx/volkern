/**
 * Ventana del barrido de reservas del proveedor (Fetch Reservations).
 *
 * ── Qué filtran `startDate`/`endDate` (medido, no supuesto) ────────────────
 * El proveedor NO filtra por fechas de estancia: filtra por la FECHA DE
 * RESERVA (`bookedOn`). Medido contra el servicio real el 9 oct 2026 con una
 * reserva hecha el 8 oct para el 9-11 oct (hotel `75fdbbce2e`, habitación `2b`):
 *
 *   2026-10-08 → 2026-10-08   → la devuelve
 *   2026-10-08 → 2026-11-08   → la devuelve
 *   2026-10-09 → 2026-11-08   → []   (ese día no se reservó nada)
 *   2026-10-09 → 2026-10-09   → []
 *
 * Con la lectura contraria —la ventana de estancia— la primera fila no tendría
 * sentido (el rango no toca la estancia) y la reserva del 8 oct habría salido
 * en la ventana «hoy → +30». No salió.
 *
 * ── Hasta dónde hay que mirar hacia atrás (medido el 14 oct 2026) ──────────
 * La primera versión miraba 30 días atrás. Es una ventana cómoda pero
 * ESTRUCTURALMENTE incompleta: el hotel real tenía dos reservas vivas que
 * llevaban meses sin entrar al ERP —`booking.com 6713291480` (estancia 7-9 ago
 * 2027, reservada el **18 ago 2026**) y `booking.com 5151446790` (estancia
 * 30 jul-3 ago 2027, reservada el **10 abr 2026**)— porque su fecha de reserva
 * quedó fuera de esos 30 días: ninguna ventana futura las iba a recuperar
 * nunca, y las noches vendidas seguían abiertas aquí (sobreventa silenciosa).
 * El mismo sondeo de solo lectura con la ventana a 365 / 730 / 1825 / 3650 días
 * devolvió las CINCO reservas del hotel, en 335-602 ms y sin coste creciente:
 * el proveedor no penaliza pedir la historia completa.
 *
 * Por eso el barrido pide el **horizonte de venta** de los canales
 * (`DIAS_HORIZONTE_VENTA`): una reserva que todavía puede afectar a la
 * operación (llegadas, estancias en curso, noches futuras por vender) tuvo que
 * reservarse dentro de ese plazo, que es lo más que las OTAs dejan abrir
 * calendario. Lo que se reserve antes de eso solo puede ser una estancia ya
 * terminada, y eso no entra al ERP por el barrido: lo decide
 * `estanciaImportable()` (ver abajo).
 *
 * Es a propósito un módulo puro y sin dependencias (ni prisma ni fetch): la
 * regla se prueba sola, y ningún test que mockee el adapter tiene que saber de
 * ella para poder ejecutar lo que la usa.
 */

/**
 * Horizonte de venta de los canales, en días: lo máximo que una OTA deja
 * reservar por adelantado (y, por tanto, lo máximo que puede llevar reservada
 * una estancia que aún no ha terminado).
 */
export const DIAS_HORIZONTE_VENTA = 730;

/**
 * Días hacia atrás que mira el barrido. Es el horizonte de venta: con menos,
 * una reserva viva cuyo push se perdió hace meses queda fuera para siempre
 * (medido: pasó con dos reservas reales, ver cabecera).
 */
export const DIAS_BARRIDO_RESERVAS_ATRAS = DIAS_HORIZONTE_VENTA;

/**
 * Margen hacia adelante del barrido. Con esta semántica no hay reservas
 * futuras que traer, así que solo sirve de colchón ante desajustes de reloj o
 * de zona horaria entre el proveedor y nosotros.
 */
export const DIAS_BARRIDO_RESERVAS_ADELANTE = 30;

/**
 * Cuánto puede llevar terminada una estancia y seguir entrando al ERP por el
 * barrido.
 *
 * El barrido ya no distingue «reserva reciente» de «reserva vieja» por su
 * fecha de reserva —mira dos años atrás—, así que la distinción que importa es
 * la de la ESTANCIA: una que terminó hace semanas sigue teniendo valor (la
 * factura, el parte de viajeros, la conciliación del mes); una que terminó hace
 * medio año es historia del hotel, y volcarla entera al ERP inventaría ingresos
 * en periodos cerrados y dispararía comunicaciones que ya no tocan.
 */
export const DIAS_ESTANCIA_IMPORTABLE = 30;

export interface VentanaReservas {
  startDate: string;
  endDate: string;
}

/** Fecha local en `YYYY-MM-DD` (nunca UTC: la reserva es del día del hotel). */
export function toIsoFechaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Medianoche local del día de `d` (para contar días, no milisegundos). */
function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Días completos transcurridos entre `base` y `hoy` (nunca negativo). */
export function diasDesde(base: Date, hoy: Date = new Date()): number {
  const ms = inicioDelDia(hoy).getTime() - inicioDelDia(base).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * Ventana del barrido: `diasAtras` días hacia atrás y `diasAdelante` hacia
 * adelante desde `hoy`, en fechas locales `YYYY-MM-DD`.
 *
 * Se resta restando días del calendario (`setDate`), no milisegundos: en un
 * cambio de horario de verano 30×24 h no son 30 días de calendario.
 */
export function ventanaFetchReservas(
  diasAtras: number = DIAS_BARRIDO_RESERVAS_ATRAS,
  diasAdelante: number = DIAS_BARRIDO_RESERVAS_ADELANTE,
  hoy: Date = new Date()
): VentanaReservas {
  const desde = inicioDelDia(hoy);
  desde.setDate(desde.getDate() - Math.max(0, diasAtras));
  const hasta = inicioDelDia(hoy);
  hasta.setDate(hasta.getDate() + Math.max(0, diasAdelante));
  return { startDate: toIsoFechaLocal(desde), endDate: toIsoFechaLocal(hasta) };
}

/**
 * ¿Merece la pena traer al ERP una reserva del canal, por sus fechas de
 * estancia?
 *
 * Sí cuando la estancia no ha terminado todavía (futura o en curso) o terminó
 * hace menos de `DIAS_ESTANCIA_IMPORTABLE` días; no cuando terminó antes de
 * eso: es historia del hotel y el barrido no es la vía para reconstruirla.
 *
 * Se compara el `checkout` tal como lo manda el contrato (`YYYY-MM-DD`) contra
 * el límite en la misma forma: comparar cadenas ISO evita que la zona horaria
 * del servidor decida si una estancia entra o no. Un payload sin fecha válida
 * NO se descarta (no se puede juzgar): decide el resto del flujo.
 */
export function estanciaImportable(
  checkout: string | null | undefined,
  hoy: Date = new Date()
): boolean {
  const iso = typeof checkout === 'string' ? checkout.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return true;
  const limite = inicioDelDia(hoy);
  limite.setDate(limite.getDate() - Math.max(0, DIAS_ESTANCIA_IMPORTABLE));
  return iso >= toIsoFechaLocal(limite);
}

/**
 * Ventana para re-verificar UNA reserva concreta contra el proveedor.
 *
 * Se abre hacia atrás lo suficiente para cubrir el día en que la reserva se
 * hizo: con una ventana fija de 30 días, una reserva hecha hace medio año no
 * aparecería nunca y se leería como «el proveedor ya no la reporta» —que es
 * justo lo contrario de lo que pasó: seguiría ahí—.
 *
 * `bookedOn` es la fecha de reserva del canal; si no la trae (o es nula) cae a
 * la fecha con la que entró al sistema, y sin ninguna de las dos se queda en el
 * barrido por defecto.
 */
export function ventanaParaReserva(
  bookedOn: Date | null | undefined,
  hoy: Date = new Date()
): VentanaReservas {
  const diasAtras = bookedOn
    ? Math.max(DIAS_BARRIDO_RESERVAS_ATRAS, diasDesde(bookedOn, hoy) + 1)
    : DIAS_BARRIDO_RESERVAS_ATRAS;
  return ventanaFetchReservas(diasAtras, DIAS_BARRIDO_RESERVAS_ADELANTE, hoy);
}
