/**
 * Comparación de reservas directas por idioma de origen — módulo PURO, sin BD.
 *
 * Pregunta de negocio que responde (plan de Booking Engine + Payments, FASE 3.E):
 * «¿mi web internacional convierte o no?». La web pública habla hoy español e
 * inglés (`?lang=en`); el idioma con el que el huésped navegó viaja con la
 * reserva (`guestData.idioma`, normalizado por el POST público) y aquí se
 * convierte en la comparación que el hotel ve en Reportes → Ventas.
 *
 * Dos decisiones que el módulo fija (y que la ruta y la página no pueden
 * reescribir):
 *  - **Solo el canal «Directa».** El idioma lo estampa el POST público del
 *    booking engine (`CANAL_BOOKING_ENGINE`); una reserva de canal traería un
 *    idioma por defecto sin significado y la comparación mentiría.
 *  - **El español es el total de la web menos el inglés, no un subconjunto.**
 *    Toda reserva directa nace con idioma ('es' por defecto del POST), así que
 *    una reserva directa sin `guestData.idioma` legible ES una reserva en
 *    español — las comparaciones antiguas no se pierden cuando llegó el inglés.
 */

import { aportaProduccion } from './estados';
import { CANAL_BOOKING_ENGINE } from './booking-engine';
import { idiomaDeValor } from './booking-i18n';

/** Fila mínima que la ruta le pasa al módulo (tal cual sale de Prisma). */
export interface ReservaConIdioma {
  channel: string;
  estado: string;
  /** Importe final de la reserva; null en holds pendientes. */
  amountAfterTax: number | null;
  /** `guestData` tal cual está en BD; de él solo se lee `idioma`. */
  guestData: unknown;
}

export interface ComparacionIdiomas {
  /** Reservas directas cuyo idioma guardado es 'en'. */
  en: number;
  /** Reservas directas en español — incluidas las anteriores al inglés. */
  es: number;
  /** Total de reservas directas que produjeron (el denominador de la tasa). */
  total: number;
  /** Cuota del inglés sobre las reservas directas (0..1); null sin reservas. */
  cuotaEn: number | null;
  /** Ingresos de las reservas directas en inglés (misma divisa, la del tenant). */
  ingresosEn: number;
}

/**
 * Comparación de reservas directas ES vs EN dentro de una lista ya cargada.
 *
 * El filtro de ventana lo hace la consulta (igual que el resto de bloques del
 * dashboard); este módulo decide **qué cuenta** y **qué no**: solo reservas
 * directas que produjeron (`aportaProduccion`, la misma regla que el mix de
 * canales — canceladas y no-shows no convierten).
 */
export function comparacionIdiomasDirectas(
  reservas: ReservaConIdioma[],
): ComparacionIdiomas {
  let en = 0;
  let es = 0;
  let ingresosEn = 0;

  for (const r of reservas) {
    if (r.channel !== CANAL_BOOKING_ENGINE) continue;
    if (!aportaProduccion(r.estado)) continue;

    // `idiomaDeValor` devuelve 'es' para ausente o desconocido: una reserva
    // directa anterior al inglés ES una reserva en español.
    const idioma = idiomaDeValor(leerIdioma(r.guestData));

    if (idioma === 'en') {
      en += 1;
      ingresosEn += r.amountAfterTax || 0;
    } else {
      es += 1;
    }
  }

  const total = en + es;
  return { en, es, total, cuotaEn: total > 0 ? en / total : null, ingresosEn };
}

/** Lee `idioma` de un `guestData` Json arbitrario sin asumir su forma. */
function leerIdioma(guestData: unknown): unknown {
  if (guestData == null || typeof guestData !== 'object') return null;
  return (guestData as Record<string, unknown>).idioma;
}

/** Umbral de cuota EN a partir del cual la web internacional convierte bien. */
export const CUOTA_EN_CONVIERTE_BIEN = 0.15;

/** Volumen mínimo de reservas directas para que la cuota signifique algo. */
export const CUOTA_EN_VOLUMEN_MINIMO = 10;

/**
 * Lectura accionable de la comparación — la misma voz que `alertaHoldsAbandonados`:
 * el módulo dice qué significa la cifra; la página solo la pinta.
 *
 * Con poco volumen la cuota es ruido y se dice: hace falta más muestra.
 */
export function lecturaComparacionIdiomas(c: ComparacionIdiomas): string {
  if (c.total === 0) {
    return 'Sin reservas directas que produjeron en el período. La comparación ES/EN aparece en cuanto la web directa venda.';
  }
  if (c.en === 0) {
    return 'Ninguna reserva directa llegó en inglés en el período. Si recibes huéspedes internacionales, revisa que el enlace inglés (?lang=en) esté publicado donde te encuentran: web, Google Business y enlaces de canal.';
  }
  if (c.total < CUOTA_EN_VOLUMEN_MINIMO) {
    return `Con ${c.total} reserva${c.total === 1 ? '' : 's'} directa${c.total === 1 ? '' : 's'} la cuota del inglés (${Math.round((c.cuotaEn ?? 0) * 100)}%) es todavía ruido: hace falta más muestra antes de sacar conclusiones.`;
  }
  const pct = Math.round((c.cuotaEn ?? 0) * 100);
  if ((c.cuotaEn ?? 0) >= CUOTA_EN_CONVIERTE_BIEN) {
    return `El ${pct}% de tus reservas directas llegó en inglés: la web internacional convierte. Mantén el enlace ?lang=en visible y las plantillas de comunicación en ambos idiomas.`;
  }
  return `Solo el ${pct}% de tus reservas directas llegó en inglés. Con volumen ya suficiente, la señal apunta a que el enlace inglés no está llegando a quien viaja: revisa dónde publicas el enlace ?lang=en y qué canales traen huéspedes internacionales.`;
}
