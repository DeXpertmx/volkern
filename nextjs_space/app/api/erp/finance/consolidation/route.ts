import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';
import { validateFinancialSecurity } from '@/lib/security/finance-guard';
import { generateIntegrityHash } from '@/lib/security/integrity-service';

/**
 * GET /api/erp/finance/consolidation - Obtener resumen ejecutivo para el Cockpit
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
    const months = parseInt(searchParams.get('months') || '1');
    
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const periodEnd = now;

    // Ejecutar Skills de Consolidación (The Financial Brain)
    const pnl = await skills.analyze_global_profitability({ tenantId, period: months > 1 ? 'last_quarter' : 'current_month' });
    const cashFlow = await skills.project_financial_forecast({ tenantId });
    const tax = await skills.tax_prospector({ tenantId, region: 'ES' }); // Default ES, se puede parametrizar

    return NextResponse.json({
      pnl,
      cashFlow,
      tax,
      period: { start: periodStart, end: periodEnd }
    });
  } catch (error) {
    console.error('Error consolidating financial data:', error);
    return NextResponse.json({ error: 'Error al consolidar datos financieros' }, { status: 500 });
  }
}, ['erp:read']);
