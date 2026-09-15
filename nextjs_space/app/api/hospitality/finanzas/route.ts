export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { cargarDatosFinancieros, resolverRango } from '@/lib/hospitality/money-query';
import {
  conteoPorEstadoCobro,
  csvFinanciero,
  desglosePorCanal,
  desglosePorPropiedad,
  filasFinancieras,
  resumenFinanciero,
} from '@/lib/hospitality/finance-summary';
import { monedaEfectiva } from '@/lib/moneda';

/**
 * GET /api/hospitality/finanzas — informe financiero del período (FASE 3.B).
 *
 * Lectura pura: no escribe nada. Devuelve los totales (bruto, comisiones,
 * gastos, neto, margen, cobrado, pendiente, reembolsado), el desglose por canal
 * y por propiedad, y una fila por reserva con su estado de cobro.
 *
 * Parámetros: desde, hasta (yyyy-mm-dd; por defecto el mes en curso),
 * propertyId, canal, formato=csv.
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
    const canal = searchParams.get('canal');
    const formato = (searchParams.get('formato') || searchParams.get('format') || '').toLowerCase();

    const { reservas, propiedades } = await cargarDatosFinancieros({
      tenantId: auth.tenant!.id,
      desde,
      hasta,
      propertyId,
      canal,
    });

    // Moneda del informe: la de las reservas del período y, si no hay, la del
    // tenant. Ni la primera fila ni el valor por defecto del esquema entran.
    const monedaInforme = monedaEfectiva(
      reservas.map((r) => r.moneda),
      auth.tenant?.moneda
    );
    // Una reserva sin divisa propia se informa en la del informe para no dejar
    // importes sin símbolo; el dato real nunca se pisa.
    const filas = filasFinancieras(reservas).map((f) => ({
      ...f,
      moneda: f.moneda || monedaInforme,
    }));
    const totales = resumenFinanciero(filas);

    if (formato === 'csv') {
      const csv = csvFinanciero(filas);
      const nombre = `finanzas-${desde.toISOString().slice(0, 10)}-${new Date(
        hasta.getTime() - 86_400_000
      )
        .toISOString()
        .slice(0, 10)}.csv`;
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
        // `hasta` es exclusivo; se informa el último día incluido.
        hasta: new Date(hasta.getTime() - 86_400_000).toISOString().slice(0, 10),
      },
      totales,
      porCanal: desglosePorCanal(filas),
      porPropiedad: desglosePorPropiedad(filas),
      estadosCobro: conteoPorEstadoCobro(filas),
      reservas: filas,
      propiedades,
      moneda: monedaInforme,
    });
  } catch (error) {
    console.error('Error obteniendo finanzas de hospitality:', error);
    return NextResponse.json({ error: 'Error al obtener las finanzas' }, { status: 500 });
  }
}
