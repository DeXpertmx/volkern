export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

interface ProvisioningResult {
  success: boolean;
  chatwootAccountId?: number;
  error?: string;
}

async function quickProvisionTenant(tenantId: string): Promise<ProvisioningResult> {
  const chatwootUrl = process.env.CHATWOOT_BASE_URL;
  const chatwootToken = process.env.CHATWOOT_SUPER_ADMIN_TOKEN;

  if (!chatwootUrl || !chatwootToken) {
    return { success: true };
  }

  try {
    const { chatwootApi } = await import('@/lib/nexus/chatwoot-api');
    
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error('Tenant no encontrado');
    }

    // Timeout de 15s para evitar que el onboarding se cuelgue
    const account = await Promise.race([
      chatwootApi.createAccount(tenant.nombre, 'es'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: Chatwoot no respondió en 15s')), 15000)
      ),
    ]);

    return {
      success: true,
      chatwootAccountId: account.id
    };
  } catch (error: any) {
    console.error('[Quick Provision] Error:', error);
    return {
      success: false,
      error: error.message
    };
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
      include: { tenant: true }
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const { step } = await req.json();

    if (step === 'provision') {
      const result = await quickProvisionTenant(user.tenantId);
      
      if (result.success) {
        await prisma.tenant.update({
          where: { id: user.tenantId },
          data: {
            provisioningStatus: 'COMPLETED'
          }
        });

        await prisma.onboardingProgress.upsert({
          where: { tenantId: user.tenantId },
          update: { pasoActual: 2 },
          create: {
            tenantId: user.tenantId,
            pasoActual: 2
          }
        });
      }

      return NextResponse.json(result);
    }

    if (step === 'complete') {
      await prisma.onboardingProgress.upsert({
        where: { tenantId: user.tenantId },
        update: {
          completado: true,
          fechaCompletado: new Date(),
          pasoActual: 5
        },
        create: {
          tenantId: user.tenantId,
          completado: true,
          fechaCompletado: new Date(),
          pasoActual: 5
        }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Step inválido' }, { status: 400 });

  } catch (error: any) {
    console.error('[Onboarding Quick] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const progress = await prisma.onboardingProgress.findUnique({
      where: { tenantId: user.tenantId }
    });

    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'telegram'
      }
    });

    return NextResponse.json({
      currentStep: progress?.pasoActual || 1,
      telegramConnected: !!channel,
      telegramUsername: (channel?.config as any)?.botUsername
    });

  } catch (error: any) {
    console.error('[Onboarding Quick GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}