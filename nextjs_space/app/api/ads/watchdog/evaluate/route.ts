export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { BudgetWatchdog } from '@/lib/ads/budget-watchdog';

// POST /api/ads/watchdog/evaluate — Evaluar reglas watchdog manualmente
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json();

    const { ruleId, campaignId } = body || {};

    let evaluations;

    if (ruleId) {
      // Evaluar una regla específica
      evaluations = [await BudgetWatchdog.evaluateRule(ruleId)];
    } else if (campaignId) {
      // Evaluar todas las reglas aplicables a una campaña
      evaluations = await BudgetWatchdog.evaluateCampaign(campaignId);
    } else {
      // Evaluar todas las reglas del tenant
      evaluations = await BudgetWatchdog.evaluateAll(tenantId);
    }

    const triggeredCount = evaluations.filter((e) => e.triggered).length;

    return NextResponse.json({
      evaluated: evaluations.length,
      triggered: triggeredCount,
      evaluations,
    });
  } catch (error: any) {
    console.error('[WATCHDOG_EVALUATE] Error:', error);
    return NextResponse.json({ error: 'Error al evaluar reglas watchdog' }, { status: 500 });
  }
}, ['ads:admin']);
