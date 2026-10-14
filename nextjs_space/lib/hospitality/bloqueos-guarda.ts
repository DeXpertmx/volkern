/**
 * La guarda del servidor: ¿este bloqueo de fechas pisa noches ya contratadas?
 *
 * Está aparte de `bloqueos-conflicto.ts` porque aquel es PURO (la regla) y este
 * toca la BD (la consulta). Las puertas que cierran fechas —la API de bloqueos
 * (POST y PATCH) y el asistente— pasan por aquí, así que la consulta y el
 * mensaje son los mismos en todas y no hay una variante por puerta.
 *
 * La pantalla del planning no necesita esta función: tiene las reservas del
 * rango ya cargadas y llama a la regla pura directamente para avisar antes de
 * enviar. El servidor sigue siendo la autoridad —el aviso previo es comodidad,
 * no la guarda—.
 */

import { prisma } from '@/lib/db';
import { estadosSinProduccion } from './estados';
import {
  choquesParaRespuesta,
  mensajeConflictoBloqueo,
  nochesVendidas,
  type ChoqueBloqueo,
} from './bloqueos-conflicto';

/** Lo que se le responde al operador: el texto y las reservas que estorban. */
export interface ConflictoBloqueo {
  error: string;
  conflicto: ChoqueBloqueo[];
}

/**
 * Devuelve el conflicto, o `null` si el rango está libre.
 *
 * El `where` es el prefiltro barato —el mismo que usa el motor de disponibilidad
 * para cargar su contexto: solo reservas con producción y solo las que se
 * cruzan—; quien decide día a día es `reservasQueChocan`, con la regla única de
 * ocupación (la salida no ocupa y una salida anticipada libera sus noches).
 */
export async function conflictoDeBloqueo(
  tenantId: string,
  unitId: string,
  inicio: Date,
  fin: Date
): Promise<ConflictoBloqueo | null> {
  const candidatas = await prisma.hospitalityReservation.findMany({
    where: {
      tenantId,
      unitId,
      estado: { notIn: estadosSinProduccion() },
      checkIn: { lt: fin },
      checkOut: { gt: inicio },
    },
    select: {
      id: true,
      channel: true,
      externalBookingId: true,
      estado: true,
      checkIn: true,
      checkOut: true,
      checkOutReal: true,
      guestData: true,
      contact: { select: { nombre: true } },
    },
  });

  const conflicto = choquesParaRespuesta(candidatas, inicio, fin);
  if (conflicto.length === 0) return null;

  return {
    error: mensajeConflictoBloqueo(conflicto, nochesVendidas(candidatas, inicio, fin)),
    conflicto,
  };
}
