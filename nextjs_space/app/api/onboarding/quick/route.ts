export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

interface ProvisioningResult {
  success: boolean;
  chatwootAccountId?: number;
  chatwootWarning?: string;
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
    // Chatwoot es un add-on best-effort: una falla aquí NO debe bloquear el
    // onboarding del nuevo tenant. Se loguea el detalle completo (status + URL
    // + body) para diagnóstico y se devuelve una advertencia amigable; el
    // canal puede provisionarse después desde Integraciones.
    console.error('[Quick Provision] Chatwoot error (no bloquea el onboarding):', {
      message: error?.message,
      baseUrl: chatwootUrl,
    });
    return {
      success: true,
      chatwootWarning: 'No se pudo conectar el canal de mensajería. Podrás configurarlo más tarde desde Integraciones.'
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

    if (step === 'modules') {
      const { modules: selectedModules } = await req.json()
      if (!Array.isArray(selectedModules) || selectedModules.length === 0) {
        return NextResponse.json({ error: 'Selecciona al menos un módulo' }, { status: 400 })
      }

      // Validar que los IDs sean módulos válidos
      const { ALL_MODULES } = await import('@/lib/plans')
      const validIds = new Set(ALL_MODULES.map((m: any) => m.id))
      const validModules = selectedModules.filter((m: string) => validIds.has(m))

      // Obtener módulos existentes
      const existing = await prisma.tenantFeature.findMany({
        where: { tenantId: user.tenantId },
        select: { feature: true },
      })
      const existingFeatures = new Set(existing.map(e => e.feature))

      // Crear los módulos nuevos (los que no existen aún)
      const toCreate = validModules.filter(m => !existingFeatures.has(m))
      if (toCreate.length > 0) {
        await prisma.tenantFeature.createMany({
          data: toCreate.map(feature => ({
            tenantId: user.tenantId!,
            feature,
            habilitado: true,
          })),
        })
      }

      // Deshabilitar los que no fueron seleccionados (excepto los core)
      const CORE_MODULES = ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'equipo', 'configuracion', 'conocimiento']
      const toDisable = existing.filter(e => !validModules.includes(e.feature) && !CORE_MODULES.includes(e.feature))
      if (toDisable.length > 0) {
        await prisma.tenantFeature.updateMany({
          where: {
            tenantId: user.tenantId,
            feature: { in: toDisable.map(e => e.feature) },
          },
          data: { habilitado: false },
        })
      }

      // También habilitar los que estaban deshabilitados pero ahora se seleccionaron
      await prisma.tenantFeature.updateMany({
        where: {
          tenantId: user.tenantId,
          feature: { in: validModules },
        },
        data: { habilitado: true },
      })

      return NextResponse.json({ success: true, activated: toCreate.length })
    }

    if (step === 'profile') {
      const { perfil, nif, nombreEmpresa } = await req.json();
      await prisma.tenant.update({
        where: { id: user.tenantId },
        data: {
          nifCif: nif || undefined,
          configuracion: {
            ...((user.tenant?.configuracion as any) || {}),
            perfil: perfil || 'general',
          },
        },
      });
      return NextResponse.json({ success: true });
    }

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
      const tenantConfig = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { configuracion: true } });
      const isGestoria = (tenantConfig?.configuracion as any)?.perfil === 'gestoria';
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