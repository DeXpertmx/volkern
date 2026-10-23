/**
 * Registro de consultas de códigos promocionales (lado servidor).
 *
 * Vive fuera de los módulos puros porque escribe en la base. La regla de negocio
 * (qué cuenta como consulta y cómo se resume) está en `promos-consultas.ts`.
 *
 * Dos decisiones que este archivo hace cumplir:
 * - **Un fallo al registrar no rompe la consulta.** El huésped está esperando el
 *   descuento; que la analítica no pueda escribir una fila no puede convertirse
 *   en «ese código no vale». Se registra el error y se sigue.
 * - **Se guarda el hecho, no el importe.** Ni el descuento concedido ni el total
 *   viajan aquí: el dinero del código ya vive en la reserva y en Finanzas. Esta
 *   tabla solo dice quién lo intentó, con qué código y qué pasó.
 */

import { prisma } from '@/lib/db';
import { normalizarCodigo } from './booking-promos';
import { normalizarSesion } from './promos-consultas';

export interface EntradaConsultaPromocion {
  tenantId: string;
  codigo: string;
  propertyId?: string | null;
  unitId?: string | null;
  checkIn: Date;
  checkOut: Date;
  /** «aplicada» o el motivo del rechazo. */
  resultado: string;
  /** Texto para el hotel; el código del motivo es el que se agrega. */
  motivo?: string | null;
  sesionId?: string | null;
}

/**
 * Guarda la consulta. Con sesión, una fila por (sesión, código): volver a aplicar
 * el mismo código en la misma visita actualiza la fila en lugar de sumar otra.
 *
 * Devuelve `true` si quedó registrada. No lanza nunca.
 */
export async function registrarConsultaPromocion(
  entrada: EntradaConsultaPromocion
): Promise<boolean> {
  const codigo = normalizarCodigo(entrada.codigo);
  if (!codigo) return false;

  const sesionId = normalizarSesion(entrada.sesionId);
  const datos = {
    tenantId: entrada.tenantId,
    codigo,
    propertyId: entrada.propertyId || null,
    unitId: entrada.unitId || null,
    checkIn: entrada.checkIn,
    checkOut: entrada.checkOut,
    resultado: entrada.resultado,
    motivo: entrada.motivo || null,
  };

  try {
    if (sesionId) {
      await prisma.hospitalityPromoConsulta.upsert({
        where: { tenantId_sesionId_codigo: { tenantId: entrada.tenantId, sesionId, codigo } },
        create: { ...datos, sesionId },
        // La fecha se actualiza: el informe ordena por el último intento.
        update: { ...datos, fecha: new Date() },
      });
    } else {
      // Sin sesión la fila se crea igual: es un intento real. Lo que se declara
      // es que no tiene clave de atribución.
      await prisma.hospitalityPromoConsulta.create({ data: { ...datos, sesionId: null } });
    }
    return true;
  } catch (error) {
    console.error('[Hospitality Promos] No se pudo registrar la consulta del código:', error);
    return false;
  }
}

/**
 * Marca como convertida la consulta de esta sesión con este código.
 *
 * Se llama dentro de la transacción que crea la reserva: o quedan las dos cosas
 * (reserva y conversión) o no queda ninguna. Sin sesión no se marca nada —
 * atribuir la reserva a la última consulta de cualquier visitante sería inventar
 * el dato.
 *
 * Devuelve cuántas consultas se marcaron (0 o 1; más de una sería un error de
 * datos, no un caso normal).
 */
export async function marcarConsultaConvertida(
  tx: unknown,
  params: {
    tenantId: string;
    codigo: string;
    sesionId: string | null | undefined;
    reservationId: string;
  }
): Promise<number> {
  const sesionId = normalizarSesion(params.sesionId);
  const codigo = normalizarCodigo(params.codigo);
  if (!sesionId || !codigo) return 0;

  // El cliente llega como transacción de Prisma (`Prisma.TransactionClient`),
  // que este módulo no necesita conocer: solo usa un `updateMany`. Tipar el
  // argumento entero ataría el helper a la versión del cliente sin ganar nada.
  const cliente = tx as {
    hospitalityPromoConsulta: {
      updateMany: (args: unknown) => Promise<{ count: number }>;
    };
  };

  const { count } = await cliente.hospitalityPromoConsulta.updateMany({
    where: { tenantId: params.tenantId, codigo, sesionId },
    data: { reservationId: params.reservationId },
  });
  return count;
}
