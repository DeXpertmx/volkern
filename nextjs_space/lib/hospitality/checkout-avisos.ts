/**
 * Avisos de servidor del check-out — separado de `checkout.ts`.
 *
 * `checkout.ts` es un módulo PURO que importan páginas de cliente (la
 * cabecera del dashboard usa sus constantes y el calendario su
 * `finEstanciaReal`). Webpack incluye en el bundle del navegador TAMBIÉN los
 * imports dinámicos, así que cualquier `await import('...push-notification')`
 * —o `./incidencias`, que arrastra `bullmq`— terminaba metiendo módulos de
 * Node (`net`, `fs`, `worker_threads`) en un bundle de browser y el build de
 * producción reventaba con «Can't resolve 'net'».
 *
 * Regla que fija este fichero: lo que avisa (BD + push) vive aquí, con
 * importación dinámica correcta para el servidor; lo que define la política
 * vive en `checkout.ts` y no toca nada de servidor.
 */

import { ETIQUETA_SALIDA_ANTICIPADA } from './checkout';

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
}
