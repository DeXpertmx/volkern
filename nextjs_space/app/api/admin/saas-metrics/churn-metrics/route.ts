import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';
import { calcularVentanaChurn } from '@/lib/saas-metrics';

export async function GET(request: NextRequest) {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const periodDays = parseInt(searchParams.get('periodDays') || '90');

    const now = new Date();
    const months: Array<{
      month: string;
      churnRate: number | null;
      churned: number;
      total: number;
    }> = [];

    // Mismo cálculo que /api/admin/saas-metrics/kpis (ver calcularVentanaChurn
    // en lib/saas-metrics.ts): una sola definición para toda la plataforma.
    for (let i = Math.floor(periodDays / 30); i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const ventana = await calcularVentanaChurn(monthStart, monthEnd);

      months.push({
        month: monthStart.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        churnRate: ventana.tasa === null ? null : Math.round(ventana.tasa * 100) / 100,
        churned: ventana.bajas,
        total: ventana.base,
      });
    }

    const medibles = months.filter((m) => m.churnRate !== null);
    const avgChurnRate = medibles.length > 0
      ? medibles.reduce((sum, m) => sum + (m.churnRate as number), 0) / medibles.length
      : null;

    return NextResponse.json({
      metrics: months,
      avgChurnRate: avgChurnRate === null ? null : Math.round(avgChurnRate * 100) / 100,
      definicion:
        'Churn sobre cuentas: bajas (cancelada/suspendida/inactiva) del periodo / cuentas que ya eran clientes al inicio del periodo.',
    });
  } catch (error) {
    console.error('[SaaS Churn Metrics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch churn metrics', details: (error as Error).message },
      { status: 500 }
    );
  }
}