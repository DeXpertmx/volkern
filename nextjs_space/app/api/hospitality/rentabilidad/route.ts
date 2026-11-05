export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/rentabilidad — MI CARTERA del propietario.
 *
 * El informe de rentabilidad operativa de toda la cartera en una lectura:
 *
 *   Ingresos brutos → Ingresos netos → Rentabilidad operativa real
 *
 * - Nivel 1 y 2: el cálculo de la reserva (`finance.ts` / `finance-summary.ts`);
 *   aquí no hay una segunda fórmula de dinero que pueda divergir de Finanzas.
 * - Nivel 3: los gastos del ERP imputados a las reservas de cada propiedad
 *   (`Expense.hospitalityReservationId`, enlace FASE 3.B), agregados por
 *   categoría de coste (comisiones de canales, limpieza, mantenimiento,
 *   consumibles, gestión y otros, suministros) por el módulo puro
 *   `lib/hospitality/rentabilidad.ts`.
 *
 * Lectura pura: no escribe nada. Aislamiento multi-tenant por sesión/API key.
 * Parámetros: desde, hasta (yyyy-mm-dd; por defecto el mes en curso), propertyId
 * opcional, formato=csv (exporta MI CARTERA; requiere `finanzas.exportar`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { cargarDatosFinancieros, resolverRango } from '@/lib/hospitality/money-query';
import { construirCartera, filasCsvCartera, type ReservaParaRentabilidad } from '@/lib/hospitality/rentabilidad';
import { construirCsv } from '@/lib/hospitality/csv';
import { monedaEfectiva } from '@/lib/moneda';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    // La cartera es dinero de la propiedad: la ve quien puede ver finanzas.
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const { desde, hasta } = resolverRango(searchParams);
    const propertyId = searchParams.get('propertyId');
    const formato = (searchParams.get('formato') || searchParams.get('format') || '').toLowerCase();

    // Ver la cartera no es sacarla del sistema: exportar es capacidad aparte,
    // igual que en Reportes.
    if (formato === 'csv') {
      const sinPermisoExportar = exigirPermisoHospitality(auth, 'finanzas.exportar');
      if (sinPermisoExportar) return sinPermisoExportar;
    }

    const tenantId = auth.tenant!.id;
    const monedaTenant = auth.tenant?.moneda ?? null;

    const { reservas, propiedades } = await cargarDatosFinancieros({
      tenantId,
      desde,
      hasta,
      propertyId,
    });

    // Los costes operativos llegan por la reserva (enlace ERP de FASE 3.B):
    // un solo lector de gastos para Finanzas y para esta cartera.
    const reservasIds = reservas.map((r) => r.id);
    const gastos = reservasIds.length
      ? await prisma.expense.findMany({
          where: { tenantId, hospitalityReservationId: { in: reservasIds } },
          select: { hospitalityReservationId: true, description: true, amount: true, category: true },
        })
      : [];

    const gastosPorReserva = new Map<string, Array<{ concepto: string; importe: number; categoria?: string | null }>>();
    for (const gasto of gastos) {
      if (!gasto.hospitalityReservationId) continue;
      const lista = gastosPorReserva.get(gasto.hospitalityReservationId) || [];
      lista.push({ concepto: gasto.description, importe: gasto.amount, categoria: gasto.category });
      gastosPorReserva.set(gasto.hospitalityReservationId, lista);
    }

    const reservasConGastos: ReservaParaRentabilidad[] = reservas.map((reserva) => ({
      ...reserva,
      gastos: gastosPorReserva.get(reserva.id) || [],
    }));

    const cartera = construirCartera({ reservas: reservasConGastos, propiedades, monedaTenant });

    if (formato === 'csv') {
      const csv = construirCsvCartera(cartera);
      const nombre = `reporte-cartera-${desde.toISOString().slice(0, 10)}.csv`;
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
      ...cartera,
      // Igual que en Reportes: la divisa del informe es la de los datos y, si
      // no hay, la de reporte del tenant. Nunca un valor por defecto del esquema.
      monedaInforme: monedaEfectiva(reservas.map((r) => r.moneda), monedaTenant),
    });
  } catch (error) {
    console.error('Error obteniendo la cartera de hospitality:', error);
    return NextResponse.json({ error: 'Error al obtener la cartera' }, { status: 500 });
  }
}

/** CSV con el helper compartido del proyecto (escape RFC 4180). */
function construirCsvCartera(cartera: ReturnType<typeof construirCartera>): string {
  return construirCsv(filasCsvCartera(cartera), { bom: true });
}
