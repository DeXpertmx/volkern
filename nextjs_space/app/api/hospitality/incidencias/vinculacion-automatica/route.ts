export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/incidencias/vinculacion-automatica
 *
 * Propone —y aplica, cuando no hay duda— el vínculo entre una habitación que
 * está rechazando reservas y una unidad libre de la propiedad.
 *
 * El código de la habitación **debe existir en el catálogo real del proveedor**
 * (`property_details`): nada se inventa. El destino se elige solo si es
 * inequívoco:
 *   1. el código de la unidad es exactamente el `roomCode`;
 *   2. el nombre de la unidad es exactamente el nombre de la habitación;
 *   3. la ocupación que el proveedor publica (`min_occ`/`max_occ`) deja una sola
 *      unidad libre compatible con la capacidad de la habitación;
 *   4. los huéspedes reales de la reserva (adults + children del payload)
 *      desempatan: una única unidad libre con esa capacidad exacta, o una única
 *      con capacidad para alojarlos (la más ajustada, sin empate de capacidad);
 *   5. solo queda una unidad libre en la propiedad (nada que elegir).
 * Si la ocupación publicada deja fuera a todas las unidades libres no se vincula
 * ninguna: meter una reserva de 2 personas en una unidad de 8 no es "lo más
 * parecido", es un error de configuración que el operador tiene que ver. Lo
 * mismo con los huéspedes reales: si ninguna unidad libre puede alojarlos, no se
 * vincula nada y el motivo queda en la incidencia.
 * En cualquier otro caso se devuelve la propuesta con sus candidatos y **no se
 * escribe nada**: decide el operador. Es el mismo principio que la guardia del
 * webhook, que nunca adivina la unidad de una reserva.
 *
 * Las reglas viven en `lib/hospitality/incidencias.ts` porque el webhook usa
 * exactamente las mismas cuando una reserva llega con la habitación sin vínculo
 * (ver `vincularHabitacionDesdeWebhook`).
 *
 * Body: { propertyId?: string, aplicar?: boolean } — `aplicar` es `true` por
 * defecto; con `false` solo se calcula la propuesta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import {
  crearCacheVinculacion,
  listarIncidencias,
  proponerVinculacion,
} from '@/lib/hospitality/incidencias';

/** Habitaciones distintas que se resuelven en una petición. */
const MAX_HABITACIONES = 20;

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const propertyId =
      typeof body?.propertyId === 'string' && body.propertyId.trim() ? body.propertyId.trim() : null;
    const aplicar = body?.aplicar !== false;

    const listado = await listarIncidencias(tenantId, propertyId);
    if (!listado.ok) {
      return NextResponse.json({ error: listado.error }, { status: listado.status });
    }

    const sinVinculo = listado.incidencias.filter((i) => !i.vinculo);
    const cache = crearCacheVinculacion();
    const propuestas: Array<Record<string, unknown>> = [];
    const aplicadas: Array<Record<string, unknown>> = [];
    const vistas = new Set<string>();

    for (const incidencia of sinVinculo) {
      if (aplicadas.length + propuestas.length >= MAX_HABITACIONES) break;

      const base = {
        hotelCode: incidencia.hotelCode,
        propertyId: incidencia.propertyId,
        roomCode: incidencia.roomCode,
        rateplanCode: incidencia.rateplanCode,
        ocupacion: incidencia.ocupacion ?? null,
      };

      // Sin ningún vínculo en el hotel, el problema es el código de propiedad
      // (paso 5), no la habitación: vincular una sola lo taparía.
      if (incidencia.tipo !== 'roomcode_sin_mapping' || !incidencia.roomCode || !incidencia.propertyId) {
        propuestas.push({
          ...base,
          motivo: 'propiedad_sin_vinculos',
          candidatos: [],
          detalle: 'El código de propiedad no tiene ningún vínculo guardado',
        });
        continue;
      }

      const clave = `${incidencia.hotelCode}|${incidencia.roomCode.toLowerCase()}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      const resultado = await proponerVinculacion({
        tenantId,
        propertyId: incidencia.propertyId,
        hotelCode: incidencia.hotelCode,
        roomCode: incidencia.roomCode,
        rateplanCode: incidencia.rateplanCode,
        // Huéspedes reales que traía la reserva rechazada: desempatan cuando el
        // rango del tipo de habitación no distingue entre las unidades libres.
        // El payload acompaña para que las edades (si el canal las publica)
        // resten bebés de la cuenta.
        ocupacion: incidencia.ocupacion,
        payload: incidencia.payload,
        aplicar,
        traza: { origen: 'manual' },
        cache,
      });

      if (resultado.estado === 'aplicada' && resultado.aplicada) {
        aplicadas.push({
          ...resultado.aplicada,
          hotelCode: incidencia.hotelCode,
          propertyId: incidencia.propertyId,
        });
      } else {
        propuestas.push({
          ...base,
          roomCode: resultado.aplicada?.roomCode ?? base.roomCode,
          motivo: resultado.motivo,
          candidatos: resultado.candidatos,
          detalle: resultado.detalle,
        });
      }
    }

    if (auth.user?.id && aplicadas.length > 0) {
      await logAuditAction(
        auth.user.id,
        tenantId,
        'actualizar',
        'hospitality_connectivity_mapping',
        propertyId ?? (aplicadas[0].propertyId as string),
        `Vínculos automáticos de incidencias: ${aplicadas
          .map((a) => `${a.roomCode}→${a.unit}`)
          .join(', ')}`
      ).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      aplicar,
      aplicadas,
      propuestas,
      resumen: {
        aplicadas: aplicadas.length,
        propuestas: propuestas.length,
        sinVinculo: sinVinculo.length,
      },
    });
  } catch (error) {
    console.error('Error en la vinculación automática de incidencias:', error);
    return NextResponse.json({ error: 'Error al proponer los vínculos' }, { status: 500 });
  }
}
