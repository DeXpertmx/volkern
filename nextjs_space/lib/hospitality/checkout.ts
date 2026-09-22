/**
 * Salida anticipada — módulo PURO, sin BD.
 *
 * Cuando el huésped se marcha ANTES de su `checkOut` previsto, la estancia
 * termina ese día. Qué significa «termina» lo decide el Anfitrión por
 * propiedad (apagador en la configuración, decisión de producto 2026-09-18,
 * docs/hospitality-estados-auditoria.md):
 *
 *  - **A · `cerrar_estancia`**: el check-out **pisa las fechas previstas** —
 *    pone el `checkOut` al día en curso y las noches no usadas desaparecen
 *    (del planning, de las noches vendidas y de la facturación prevista).
 *    Barato y sin campos nuevos… pero pierde lo planeado: si el hotel cobra
 *    la estancia completa, el ADR se infla (ingresos iguales ÷ menos noches).
 *  - **B · `salida_real`** (por defecto): se guarda la **salida real** en
 *    `checkOutReal` y la ocupación/disponibilidad usan
 *    `min(checkOut, checkOutReal)` — la habitación vacía vuelve a ser
 *    vendible ese mismo día. `checkOut` queda intacto para las noches
 *    vendidas y la facturación: separa «qué noches VENDÍ» de «qué noches
 *    OCUPÉ», que es la distinción que el sistema no podía expresar.
 *
 * Regla de reparto (la misma matriz del audit de estados):
 *  - Ocupación y disponibilidad (motor, analítica, push a canales) →
 *    `finEstanciaReal` (consume la salida real).
 *  - Producción y facturación (noches vendidas, ADR, estancia media, cargo)
 *    → `checkOut` previsto, sin tocar.
 *
 * Este módulo es la ÚNICA definición de ambas cosas; motor y analítica
 * consumen aquí en vez de repetir el `min()` (el patrón de `estados.ts`:
 * una pregunta, una definición, cero variantes).
 */

import { startOfDay, toIsoDate } from './calendar';

/** Qué pasa con las noches no usadas cuando el huésped se va antes. */
export type PoliticaSalidaAnticipada = 'cerrar_estancia' | 'salida_real';

export const POLITICAS_SALIDA_ANTICIPADA = ['cerrar_estancia', 'salida_real'] as const;

/** Por defecto, B: la salida real no pisa lo previsto ni distorsiona KPIs. */
export const POLITICA_SALIDA_ANTICIPADA_POR_DEFECTO: PoliticaSalidaAnticipada = 'salida_real';

export function esPoliticaSalidaAnticipada(
  valor: unknown
): valor is PoliticaSalidaAnticipada {
  return (
    typeof valor === 'string' &&
    (POLITICAS_SALIDA_ANTICIPADA as readonly string[]).includes(valor)
  );
}

/** Un valor inválido cae en el defecto en vez de cambiar el criterio en silencio. */
export function politicaSalidaAnticipadaEfectiva(
  valor: string | null | undefined
): PoliticaSalidaAnticipada {
  return esPoliticaSalidaAnticipada(valor)
    ? valor
    : POLITICA_SALIDA_ANTICIPADA_POR_DEFECTO;
}

/** Etiqueta legible de cada opción (para el apagador de la UI). */
export const ETIQUETA_SALIDA_ANTICIPADA: Record<PoliticaSalidaAnticipada, string> = {
  cerrar_estancia: 'Cerrar la estancia (A)',
  salida_real: 'Registrar la salida real (B)',
};

/** Qué implica cada opción, para explicarlo donde se elige. */
export const DESCRIPCION_SALIDA_ANTICIPADA: Record<PoliticaSalidaAnticipada, string> = {
  cerrar_estancia:
    'El check-out acorta la reserva a las noches realmente usadas: las noches no usadas desaparecen del planning y de las noches vendidas (el ADR sube si se cobra la estancia completa).',
  salida_real:
    'La reserva conserva sus fechas previstas; la habitación vacía vuelve a estar disponible desde la salida real y los KPIs de producción no cambian.',
};

/**
 * Fin REAL de la estancia para ocupación y disponibilidad:
 * `min(checkOut previsto, checkOutReal)`.
 *
 * Compara por días (las reservas se guardan con hora: llegada 15:00, salida
 * 11:00) y devuelve el instante ganador tal cual — los consumidores ya
 * comparan con `startOfDay`, igual que con `checkOut`.
 *
 * Sin salida real (null, el caso normal) devuelve el previsto: la función es
 * inocua cuando no hubo salida anticipada.
 */
export function finEstanciaReal(
  checkOut: Date,
  checkOutReal?: Date | null
): Date {
  if (!checkOutReal) return checkOut;
  const previsto = startOfDay(checkOut).getTime();
  const real = startOfDay(checkOutReal).getTime();
  return real < previsto ? checkOutReal : checkOut;
}

/** Hora de salida de un día, la convención de la vertical (11:00 local). */
function salidaDelDia(d: Date): Date {
  return new Date(`${toIsoDate(d)}T11:00:00`);
}

// ─── Aviso al operador: el criterio de liberación de noches cambió ──────────
//
// La parte asíncrona (BD + push) vive en el mismo fichero que la política
// porque comparten vocabulario, pero separada al final y con imports
// dinámicos: `checkout.ts` sigue siendo importable desde los módulos puros
// (availability, analytics) sin arrastrar Prisma ni el stack de push.

/**
 * Avisa a los operadores del tenant de que cambió la política de salida
 * anticipada de una propiedad.
 *
 * El apagador decide qué pasa con las noches no usadas a partir del PRÓXIMO
 * check-out: si nadie avisa, el operador ve la disponibilidad moverse de una
 * manera que ya no corresponde al criterio que conocía. Sigue el patrón de
 * `notificarVinculacionAutomatica` (incidencias.ts): push in-app a los
 * operadores del tenant, con el enlace a la configuración de la propiedad,
 * y **nunca lanza** — un aviso no puede romper el cambio que anuncia.
 */
export async function notificarCambioSalidaAnticipada(input: {
  tenantId: string;
  propertyId: string;
  property: string;
  antes: 'cerrar_estancia' | 'salida_real';
  despues: 'cerrar_estancia' | 'salida_real';
}): Promise<string[]> {
  try {
    const { operadoresDelTenant } = await import('./incidencias');
    const operadores = await operadoresDelTenant(input.tenantId);
    if (operadores.length === 0) return [];

    const cuerpo =
      `En "${input.property}" el criterio de liberación de noches cambió: ` +
      `antes «${ETIQUETA_SALIDA_ANTICIPADA[input.antes]}», ahora ` +
      `«${ETIQUETA_SALIDA_ANTICIPADA[input.despues]}». ` +
      (input.despues === 'cerrar_estancia'
        ? 'Desde el próximo check-out, salir antes acorta la reserva y las noches no usadas desaparecen del planning y de las vendidas.'
        : 'Desde el próximo check-out, salir antes conserva las fechas previstas y libera la habitación vacía sin tocar lo vendido.');

    const { sendPushNotification } = await import('@/lib/services/push-notification');
    await Promise.all(
      operadores.map((u) =>
        sendPushNotification(u.id, {
          title: 'Política de salida anticipada cambiada',
          body: cuerpo,
          url: `/dashboard/hospitality?propertyId=${input.propertyId}`,
          tag: 'hospitality-config',
          data: {
            propertyId: input.propertyId,
            antes: input.antes,
            despues: input.despues,
          },
        }).catch(() => ({ success: false }))
      )
    );
    return operadores.map((u) => u.id);
  } catch (e) {
    console.error('[Hospitality] Error avisando del cambio de salida anticipada:', e);
    return [];
  }
}/**
 * Qué campos escribir en la reserva al marcar `checked_out`, según la
 * política de la propiedad. Lo consumen el check-out operativo
 * (`performCheckOperation`) y el PATCH manual de reservas, para que las dos
 * puertas apliquen EXACTAMENTE lo mismo.
 *
 *  - A `cerrar_estancia`: pisa el `checkOut` al día en curso (11:00) SOLO si
 *    la salida es anterior a la prevista — salir el día previsto no toca
 *    ninguna fecha.
 *  - B `salida_real`: guarda `checkOutReal` (el instante real) y no toca el
 *    previsto.
 */
export function datosDeSalida(
  politica: string | null | undefined,
  opts: { checkOutPrevisto: Date; hoy?: Date }
): { checkOut?: Date; checkOutReal?: Date } {
  const p = politicaSalidaAnticipadaEfectiva(politica);
  const hoy = opts.hoy ?? new Date();
  if (p === 'cerrar_estancia') {
    const saleTarde =
      startOfDay(hoy).getTime() >= startOfDay(opts.checkOutPrevisto).getTime();
    return saleTarde ? {} : { checkOut: salidaDelDia(hoy) };
  }
  return { checkOutReal: hoy };
}
