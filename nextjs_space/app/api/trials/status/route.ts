export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TrialService, getTenantTrialInfo, startTenantTrial } from '@/lib/trial-service';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    let tenantId: string | null = null;
    
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { tenantId: true },
      });
      tenantId = user?.tenantId || null;
    } else {
      const url = new URL(req.url);
      tenantId = url.searchParams.get('tenantId');
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const trialInfo = await getTenantTrialInfo(tenantId);
    
    const limits = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { limites: true },
    });

    const activationStatus = (limits?.limites as Record<string, any>)?._trialActivated || false;
    const firstActionAt = (limits?.limites as Record<string, any>)?._firstActionAt || null;

    return NextResponse.json({
      ...trialInfo,
      activationStatus,
      firstActionAt,
      suggestedActions: getSuggestedActions(trialInfo, activationStatus, !!firstActionAt),
    });
  } catch (error) {
    console.error('[API/Trials] Error getting trial status:', error);
    return NextResponse.json(
      { error: 'Error obteniendo estado del trial' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const { action, diasTrial, plan, days } = body;

    const service = new TrialService(user.tenantId);
    let result;

    switch (action) {
      case 'start':
        if (!diasTrial) {
          return NextResponse.json({ error: 'Días de trial requeridos' }, { status: 400 });
        }
        result = await service.startTrial(diasTrial);
        break;

      case 'convert':
        result = await service.convertToPaid(plan || 'esencial');
        break;

      case 'extend':
        if (!days) {
          return NextResponse.json({ error: 'Días de extensión requeridos' }, { status: 400 });
        }
        result = await service.extendTrial(days);
        break;

      case 'cancel':
        result = await service.cancelTrial();
        break;

      case 'expire':
        result = await service.expireTrial();
        break;

      case 'markActivation':
        await service.markActivationEvent();
        result = await service.checkTrialStatus();
        break;

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API/Trials] Error processing trial action:', error);
    return NextResponse.json(
      { error: 'Error procesando acción de trial' },
      { status: 500 }
    );
  }
}

function getSuggestedActions(
  trialInfo: any,
  wasActivated: boolean,
  hasFirstAction: boolean
): string[] {
  const actions: string[] = [];

  if (trialInfo.status === 'active') {
    if (!wasActivated && !hasFirstAction) {
      actions.push('explore_features');
    }
    if (trialInfo.daysRemaining <= 3) {
      actions.push('consider_upgrade');
    }
    if (trialInfo.daysRemaining <= 7) {
      actions.push('schedule_onboarding_call');
    }
  }

  if (trialInfo.status === 'expired') {
    actions.push('upgrade_plan');
  }

  return actions;
}