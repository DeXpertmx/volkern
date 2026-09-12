export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { fxConvert, CURRENCY_CONSTANTS, type Currency } from '@/lib/insurance/currency';

/**
 * GET /api/insurance/portfolio/timeline?months=12
 *
 * Devuelve la serie mensual de prima (últimos N meses) agrupada por mes de
 * `fechaEmision` de las pólizas activas:
 *
 *   { tenantMoneda, months, serie: [{ mes: '2024-11', label: 'Nov 2024', polizasCount, polizasNuevas, primaTotal, primaPromedio }, ...], ... }
 *
 * Los meses sin actividad se devuelven con primaTotal=0 para que el chart
 * pueda dibujarlos sin gaps.
 *
 * `tenantMoneda` es la divisa de reporte del tenant, y **las sumas están
 * convertidas a ella**: una póliza en euros y otra en pesos dentro del mismo
 * tenant no pueden sumarse en bruto, porque el total no significaría nada y la
 * pantalla lo escribiría con el símbolo de una divisa que no es la suya.
 *
 * Cap de meses: 36 (1 año y medio) para no devolver payloads demasiado
 * grandes para tenants históricos.
 */
const MAX_MONTHS = 36;

const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildEmptySeries(now: Date, count: number): Array<{ mes: string; label: string }> {
  const series: Array<{ mes: string; label: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${MONTHS_ES_SHORT[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    series.push({ mes, label });
  }
  return series;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requesteg = Number(searchParams.get('months') ?? '12');
    const months = Math.max(1, Math.min(MAX_MONTHS, Number.isFinite(requesteg) ? requesteg : 12));

    const now = new Date();
    // Primer día del mes N meses atrás → al incluirlo, ese mes completo está dentro del rango.
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    // Divisa de reporte del tenant: es a la que se convierten todas las sumas y
    // la que la pantalla usa para escribir el dinero.
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenant!.id },
      select: { moneda: true },
    });
    const tenantMoneda: Currency = (tenant?.moneda as Currency | undefined) ??
      (CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY as Currency);

    // Filtrar en BD por fechaEmision reduce drásticamente el dataset — sólo se bajan
    // las pólizas emitidas dentro de la ventana solicitada.
    const polizas = await prisma.poliza.findMany({
      where: {
        tenantId: auth.tenant!.id,
        fechaEmision: { gte: startDate },
      },
      select: {
        id: true,
        fechaEmision: true,
        primaAnual: true,
        moneda: true,
        estado: true,
      },
    });

    // Acumular por YYYY-MM (mes de fechaEmision).
    const acumulados = new Map<string, { polizasCount: number; polizasNuevas: number; primaTotal: number }>();
    for (const p of polizas) {
      const d = new Date(p.fechaEmision);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const entry = acumulados.get(key) ?? { polizasCount: 0, polizasNuevas: 0, primaTotal: 0 };
      entry.polizasCount += 1;
      // Contar como "nueva" cualquier póliza del rango (no renovación) — es emisión fresca.
      entry.polizasNuevas += 1;
      // Convertir a la divisa del tenant antes de sumar: el total debe estar en
      // la misma divisa que declara `tenantMoneda`.
      entry.primaTotal += fxConvert(
        Number(p.primaAnual ?? 0),
        (p.moneda as string) ?? tenantMoneda,
        tenantMoneda
      );
      acumulados.set(key, entry);
    }

    // Construir serie completa (rellena ceros) para que el chart no tenga gaps.
    const skeleton = buildEmptySeries(now, months);
    const serie = skeleton.map(s => {
      const agg = acumulados.get(s.mes);
      const polizasCount = agg?.polizasCount ?? 0;
      return {
        ...s,
        polizasCount,
        polizasNuevas: agg?.polizasNuevas ?? 0,
        primaTotal: agg?.primaTotal ?? 0,
        primaPromedio: polizasCount > 0 ? (agg!.primaTotal / polizasCount) : 0,
      };
    });

    // Variables de tendencia: comparar el último mes con el promedio de meses anteriores.
    const last3Prom = serie.slice(-4, -1).reduce((acc, m) => acc + m.primaTotal, 0) / 3;
    const ultimoMes = serie[serie.length - 1].primaTotal;
    const tendencia = last3Prom > 0 ? ((ultimoMes - last3Prom) / last3Prom) * 100 : 0;

    return NextResponse.json({
      generado: new Date().toISOString(),
      tenantMoneda,
      months,
      serie,
      tendencia,
      mejorMes:
        serie.reduce((acc, m) => (m.primaTotal > acc.primaTotal ? m : acc), serie[0]),
      totalVentana: serie.reduce((acc, m) => acc + m.primaTotal, 0),
    });
  } catch (error) {
    console.error('Error al obtener timeline del portfolio:', error);
    return NextResponse.json(
      { error: 'Error al obtener timeline: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
