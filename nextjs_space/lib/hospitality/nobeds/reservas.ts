/**
 * Diferencial del sondeo de reservas.
 *
 * NOBEDS **no tiene webhooks** (su `/api/Webhooks` responde 404 y no está entre
 * sus 52 operaciones), así que la ingesta es sondeo con diferencial. Y ahí hay
 * dos hechos medidos que mandan sobre el diseño:
 *
 * - Las reservas **canceladas siguen en la lista**, con `status: Cancelled` y su
 *   marca `canceled`. La cancelación es un campo, no una inferencia.
 * - Aun así, una reserva puede **desaparecer** de la ventana por otras razones
 *   (cambio de fechas, ventana mal pedida, su propio mantenimiento). Tratar una
 *   desaparición como cancelación reabre una noche que puede estar vendida: es
 *   la dirección peligrosa del mismo overbooking. Por eso una desaparición se
 *   **confirma en un segundo ciclo** antes de darla por cierta, y mientras tanto
 *   se ve como incidencia.
 *
 * Todo es puro: no escribe ni decide por su cuenta. El llamador persiste.
 */

import { estaCancelada, huellaReserva } from './mapa';
import type { ReservaNobeds } from './tipos';

export interface DiferencialReservas {
  /** `order_id` que no estaba en la instantánea anterior. */
  nuevas: ReservaNobeds[];
  /** Estaba y cambió la huella (`updated` / `status` / `canceled`). */
  modificadas: ReservaNobeds[];
  /** Canceladas: por estado o por marca, no por desaparición. */
  canceladas: ReservaNobeds[];
  /** Estaban y ya no vienen. **No** se tratan como cancelación. */
  desaparecidas: ReservaNobeds[];
  sinCambios: ReservaNobeds[];
}

function indexar(reservas: ReservaNobeds[]): Map<string, ReservaNobeds> {
  const mapa = new Map<string, ReservaNobeds>();
  for (const reserva of reservas) {
    if (!reserva.orderId) continue;
    mapa.set(reserva.orderId, reserva);
  }
  return mapa;
}

/**
 * Compara dos instantáneas. Una reserva que aparece cancelada se informa
 * **una sola vez** (en el ciclo en que la vemos pasar a cancelada); si ya
 * estaba cancelada antes, cuenta como sin cambios.
 */
export function diferenciar(
  anteriores: ReservaNobeds[],
  actuales: ReservaNobeds[]
): DiferencialReservas {
  const previas = indexar(anteriores);
  const vistas = new Set<string>();

  const nuevas: ReservaNobeds[] = [];
  const modificadas: ReservaNobeds[] = [];
  const canceladas: ReservaNobeds[] = [];
  const sinCambios: ReservaNobeds[] = [];

  for (const actual of actuales) {
    if (!actual.orderId) continue;
    vistas.add(actual.orderId);
    const previa = previas.get(actual.orderId);

    if (!previa) {
      nuevas.push(actual);
      continue;
    }

    const cambio = huellaReserva(previa) !== huellaReserva(actual);
    if (!cambio) {
      sinCambios.push(actual);
      continue;
    }

    if (estaCancelada(actual) && !estaCancelada(previa)) {
      canceladas.push(actual);
    } else {
      modificadas.push(actual);
    }
  }

  const desaparecidas = anteriores.filter(
    (previa) => previa.orderId && !vistas.has(previa.orderId)
  );

  return { nuevas, modificadas, canceladas, desaparecidas, sinCambios };
}

/** Estado de una desaparición pendiente de confirmar. */
export interface PendienteDesaparicion {
  orderId: string;
  /** Ciclos consecutivos en los que ha faltado (el primero ya cuenta). */
  ciclos: number;
  /** Última vez que la vimos en la ventana. */
  ultimaVezVista: string | null;
}

export interface ResultadoDesapariciones {
  /** Desaparecieron en suficientes ciclos seguidos: ya se pueden dar por perdidas. */
  confirmadas: ReservaNobeds[];
  /** Siguen desaparecidas pero aún no se confirman. */
  pendientes: PendienteDesaparicion[];
}

/**
 * Avanza el contador de desapariciones.
 *
 * - Una reserva que falta por primera vez queda `pendiente` con `ciclos: 1`.
 * - Si vuelve a faltar en el siguiente ciclo, llega a `ciclosParaConfirmar` y se
 *   devuelve en `confirmadas`.
 * - Si **reaparece**, se cae de `pendientes` sin generar nada: no se cancela, no
 *   se reabre ninguna noche y no se marca la reserva por error.
 *
 * `pendientes` debe ser lo devuelto por el ciclo anterior, no una lista
 * inventada: es la memoria del barrido.
 */
export function actualizarPendientes(entrada: {
  desaparecidas: ReservaNobeds[];
  pendientes: PendienteDesaparicion[];
  ciclosParaConfirmar?: number;
}): ResultadoDesapariciones {
  const ciclosParaConfirmar = entrada.ciclosParaConfirmar ?? 2;
  if (!Number.isInteger(ciclosParaConfirmar) || ciclosParaConfirmar < 1) {
    throw new Error('ciclosParaConfirmar debe ser un entero >= 1');
  }

  const previos = new Map(entrada.pendientes.map((p) => [p.orderId, p]));
  const confirmadas: ReservaNobeds[] = [];
  const pendientes: PendienteDesaparicion[] = [];

  for (const reserva of entrada.desaparecidas) {
    if (!reserva.orderId) continue;
    const anterior = previos.get(reserva.orderId);
    const ciclos = (anterior?.ciclos ?? 0) + 1;

    if (ciclos >= ciclosParaConfirmar) {
      confirmadas.push(reserva);
      continue;
    }

    pendientes.push({
      orderId: reserva.orderId,
      ciclos,
      ultimaVezVista: reserva.actualizadaEn ?? anterior?.ultimaVezVista ?? null,
    });
  }

  return { confirmadas, pendientes };
}

/** Resumen para el log de sincronización y el panel de salud. */
export function resumenDiferencial(diferencial: DiferencialReservas): {
  nuevas: number;
  modificadas: number;
  canceladas: number;
  desaparecidas: number;
  sinCambios: number;
} {
  return {
    nuevas: diferencial.nuevas.length,
    modificadas: diferencial.modificadas.length,
    canceladas: diferencial.canceladas.length,
    desaparecidas: diferencial.desaparecidas.length,
    sinCambios: diferencial.sinCambios.length,
  };
}
