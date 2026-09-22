export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/hospitality/holds?dias=30
 *
 * Métricas de holds caducados **por tenant**, para el operador de plataforma:
 * cuántos holds se liberaron en la ventana, en cuántas propiedades, cuándo fue
 * el último y con qué ventana media. Solo operadores Superadmin.
 *
 * La fuente es la auditoría que deja el barrido
 * (`hospitality_hold_expirado`, ver `lib/cron/hospitality-holds.ts`): no hay
 * contadores que mantener ni que puedan desviarse de lo que realmente pasó.
 * El cálculo (ventana, agrupación, orden) vive en el módulo puro
 * `lib/hospitality/holds-metrics.ts`; esta ruta solo carga y delega.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-helpers';
import { ACCION_AUDIT_HOLD_CADUCADO } from '@/lib/hospitality/holds';
import {
  agregarHoldsCaducados,
  eventoDesdeAudit,
  ventanaHoldDias,
  HOLD_METRICAS_VENTANA_POR_DEFECTO,
} from '@/lib/hospitality/holds-metrics';

/** Tope de filas de auditoría por consulta (las métricas son un mínimo si se alcanza). */
const TOPE_FILAS = 2000;

export async function GET(req: NextRequest) {
  try {
    const auth = await isAdminRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dias = ventanaHoldDias(
      searchParams.get('dias') ?? HOLD_METRICAS_VENTANA_POR_DEFECTO
    );
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);

    // Cota inferior en SQL (usa el índice de fechaCreacion); la cota superior
    // la pone el módulo puro: así una fila escrita entre el cálculo de `desde`
    // y la consulta (barrido concurrente) no se pierde por un `lte: ahora`
    // desfasado milisegundos. La ventana se define en un solo sitio.
    const filas = await prisma.auditLog.findMany({
      where: {
        accion: ACCION_AUDIT_HOLD_CADUCADO,
        fechaCreacion: { gte: desde },
      },
      select: { tenantId: true, metadata: true, fechaCreacion: true },
      orderBy: { fechaCreacion: 'desc' },
      take: TOPE_FILAS,
    });

    const eventos = filas
      .map(eventoDesdeAudit)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const resumen = agregarHoldsCaducados(eventos, { ahora, dias });

    const ids = resumen.tenants.map((t) => t.tenantId);
    const nombres = ids.length
      ? await prisma.tenant.findMany({
          where: { id: { in: ids } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombrePorId = new Map(nombres.map((t) => [t.id, t.nombre]));

    return NextResponse.json({
      ventanaDias: resumen.ventanaDias,
      desde: resumen.desde.toISOString(),
      total: resumen.total,
      // Si la ventana trae más filas que el tope, las métricas son un mínimo.
      truncado: filas.length >= TOPE_FILAS,
      tenants: resumen.tenants.map((t) => ({
        ...t,
        tenant: nombrePorId.get(t.tenantId) ?? t.tenantId,
        ultimoCaducado: t.ultimoCaducado ? t.ultimoCaducado.toISOString() : null,
      })),
      generadoEn: ahora.toISOString(),
    });
  } catch (error) {
    console.error('Error obteniendo las métricas de holds caducados:', error);
    return NextResponse.json(
      { error: 'Error al obtener las métricas de holds caducados' },
      { status: 500 }
    );
  }
}
