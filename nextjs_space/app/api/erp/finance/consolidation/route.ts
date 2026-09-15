export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';
import { validateFinancialSecurity } from '@/lib/security/finance-guard';

/**
 * GET /api/erp/finance/consolidation — Resumen ejecutivo del Cockpit financiero.
 *
 * Contrato de la respuesta (lo consumen el cockpit de Finanzas y Reportes):
 *
 *   {
 *     period:   { meses, desde, hasta },
 *     pnl:      { revenue, expenses, payroll, manufacturingCosts, scrapLoss,
 *                 profit, margin, resumen },   // cifras del periodo
 *     cashFlow: { expectedIn, committedOut, runwayDays, resumen },  // proyección
 *     tax:      { region, estimatedLiability, advice }
 *   }
 *
 * Las cifras van planas, no dentro de un `data`: las skills devuelven
 * `{ content, data }` y la ruta reenviaba ese envoltorio tal cual, así que los
 * componentes leían `pnl.totalRevenue` / `pnl.netProfit` —campos que nunca
 * existieron— y el cockpit mostraba ceros con la petición devolviendo 200.
 *
 * `?months=N` sí llega a la skill: la ruta le pasaba `period`, que el wrapper
 * ignora, de modo que un año entero se respondía como el mes en curso.
 *
 * Nota sobre permisos: la puerta financiera exige administrar la cuenta
 * (`configuracion.gestionar`), no un nombre de rol. Los roles llegan como
 * objeto `Role`, no como cadena.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const user = { id: auth.user!.id, role: auth.user!.role, email: auth.user!.email || '' };

    // 🛡️ ACTIVAR ESCUDO FINANCIERO (Modo Fortaleza)
    const security = await validateFinancialSecurity(tenantId, user);
    if (!security.authorized) {
      return NextResponse.json({ error: security.error }, { status: security.status });
    }

    const { searchParams } = new URL(request.url);
    const meses = Math.max(1, Math.min(12, parseInt(searchParams.get('months') || '1', 10) || 1));

    const now = new Date();
    const desde = new Date(now.getFullYear(), now.getMonth() - (meses - 1), 1);

    // Ejecutar Skills de Consolidación (The Financial Brain)
    const pnl = await (skills as any).analyze_global_profitability({ tenantId, months: meses });
    const forecast = await skills.project_financial_forecast({ tenantId });
    const tax = await skills.tax_prospector({ tenantId, region: 'ES' }); // Default ES, se puede parametrizar

    return NextResponse.json({
      period: { meses, desde, hasta: now },
      pnl: { ...pnl.data, resumen: pnl.content },
      cashFlow: { ...forecast.data, resumen: forecast.content },
      tax,
    });
  } catch (error) {
    console.error('Error consolidating financial data:', error);
    return NextResponse.json({ error: 'Error al consolidar datos financieros' }, { status: 500 });
  }
}, ['erp:read']);
