export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { cargarDatosFinancieros, resolverRango } from '@/lib/hospitality/money-query';
import {
  csvCanales,
  csvPropiedades,
  reporteFinanciero,
  reporteOperacion,
  reportePropiedades,
  reporteVentas,
} from '@/lib/hospitality/reportes';
import { monedaEfectiva } from '@/lib/moneda';

/** Estados de unidad que no forman parte del inventario vendible. */
const NO_VENDIBLES = ['out_of_service'];

/**
 * GET /api/hospitality/reportes — reportes del período (FASE 3.E).
 *
 * Lectura pura. Devuelve los cuatro bloques del plan: operación (ocupación,
 * ADR, RevPAR, estancia media, cancelaciones, no-shows), ventas (mix de canales,
 * peso de la directa, antelación), finanzas y por propiedad.
 *
 * Parámetros: desde, hasta (yyyy-mm-dd; por defecto el mes en curso),
 * propertyId, formato=csv (exporta la tabla de la sección pedida con `seccion`).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const { desde, hasta } = resolverRango(searchParams);
    const propertyId = searchParams.get('propertyId');
    const formato = (searchParams.get('formato') || searchParams.get('format') || '').toLowerCase();
    const seccion = (searchParams.get('seccion') || 'propiedades').toLowerCase();

    // Ver los reportes no es sacarlos del sistema: exportar es una capacidad
    // aparte, porque un archivo sale del control de Volkern.
    if (formato === 'csv') {
      const sinPermisoExportar = exigirPermisoHospitality(auth, 'finanzas.exportar');
      if (sinPermisoExportar) return sinPermisoExportar;
    }

    const tenantId = auth.tenant!.id;

    const { reservas, propiedades, unidades } = await cargarDatosFinancieros({
      tenantId,
      desde,
      hasta,
      propertyId,
    });

    const unidadesActivas = unidades
      .filter((u) => !NO_VENDIBLES.includes(u.estado))
      .map((u) => u.id);

    const operacion = reporteOperacion({
      reservas,
      unidades: unidades.map((u) => ({ id: u.id, propertyId: u.propertyId })),
      desde,
      hasta,
      unidadesActivas,
    });

    const ventas = reporteVentas({ reservas });

    const financiero = reporteFinanciero({ reservas });

    const propiedadesReporte = reportePropiedades({
      propiedades: propertiesDe(reservas, propiedades),
      unidades: unidades.map((u) => ({ id: u.id, propertyId: u.propertyId })),
      reservas,
      desde,
      hasta,
    });

    // Operaciones del período: limpiezas e incidencias (plan §23).
    const [limpiezas, incidencias] = await Promise.all([
      prisma.hospitalityCleaningTask.groupBy({
        by: ['estado'],
        where: { tenantId, fecha: { gte: desde, lt: hasta } },
        _count: { _all: true },
      }),
      prisma.hospitalityMaintenanceTask.groupBy({
        by: ['estado'],
        where: { tenantId, fecha: { gte: desde, lt: hasta } },
        _count: { _all: true },
      }),
    ]);

    const porEstado = (grupos: Array<{ estado: string; _count: { _all: number } }>) => {
      const mapa: Record<string, number> = {};
      for (const grupo of grupos) mapa[grupo.estado] = grupo._count._all;
      return mapa;
    };

    if (formato === 'csv') {
      const csv = seccion === 'canales' ? csvCanales(ventas.canales) : csvPropiedades(propiedadesReporte);
      const nombre = `reporte-${seccion}-${desde.toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${nombre}"`,
        },
      });
    }

    return NextResponse.json({
      rango: {
        desde: desde.toISOString().slice(0, 10),
        hasta: new Date(hasta.getTime() - 86_400_000).toISOString().slice(0, 10),
      },
      operacion,
      ventas,
      financiero: {
        totales: financiero.totales,
        porCanal: financiero.porCanal,
      },
      propiedades: propiedadesReporte,
      operaciones: {
        limpieza: porEstado(limpiezas),
        incidencias: porEstado(incidencias),
      },
      // Igual que en Finanzas: la divisa la dictan las reservas del período y, si
      // no hay, la del tenant.
      moneda: monedaEfectiva(reservas.map((r) => r.moneda), auth.tenant?.moneda),
    });
  } catch (error) {
    console.error('Error obteniendo reportes de hospitality:', error);
    return NextResponse.json({ error: 'Error al obtener los reportes' }, { status: 500 });
  }
}

/**
 * Propiedades del informe: las del tenant más las que aparezcan solo en las
 * reservas (con su nombre), para no perder ingresos si una propiedad se
 * ocultara de la lista por cualquier motivo.
 */
function propertiesDe(
  reservas: Array<{ propertyId?: string | null; propertyNombre?: string | null }>,
  propiedades: Array<{ id: string; nombre: string }>
): Array<{ id: string; nombre: string }> {
  const porId = new Map(propiedades.map((p) => [p.id, p] as const));
  for (const reserva of reservas) {
    if (!reserva.propertyId) continue;
    if (!porId.has(reserva.propertyId)) {
      porId.set(reserva.propertyId, {
        id: reserva.propertyId,
        nombre: reserva.propertyNombre || reserva.propertyId,
      });
    }
  }
  return Array.from(porId.values());
}
