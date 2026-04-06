export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

/**
 * API para verificar automáticamente el progreso del onboarding
 * Revisa si el usuario ha completado cada paso basándose en datos reales
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const tenantId = user.tenantId;

    // Verificar cada paso del onboarding
    const [
      whitelabelConfig,
      leadsCount,
      serviciosCount,
      integrationsCount,
      automationsCount,
      teamCount,
    ] = await Promise.all([
      prisma.configuracion.findFirst({
        where: {
          OR: [
            { clave: 'whitelabel_nombre' },
            { clave: 'whitelabel_logo' },
          ],
        },
      }),
      prisma.lead.count({ where: { tenantId } }),
      prisma.servicio.count({ where: { tenantId } }),
      prisma.integration.count({
        where: {
          tenantId,
          conectado: true,
          tipo: { in: ['whatsapp', 'email', 'sms'] },
        },
      }),
      prisma.automation.count({ where: { tenantId, activo: true } }),
      prisma.user.count({ where: { tenantId, estado: 'activo' } }),
    ]);

    // Determinar qué pasos están completados
    const stepsCompleted = {
      configuracionBasica: !!whitelabelConfig,
      primerLead: leadsCount > 0,
      primerServicio: serviciosCount > 0,
      configuracionCanales: integrationsCount > 0,
      primeraAutomatizacion: automationsCount > 0,
      invitacionEquipo: teamCount > 1, // Más de 1 usuario (el creador + al menos 1 invitado)
    };

    // Actualizar progreso
    const progress = await prisma.onboardingProgress.upsert({
      where: { tenantId },
      update: stepsCompleted,
      create: {
        tenantId,
        ...stepsCompleted,
      },
    });

    return NextResponse.json({
      progress,
      checks: stepsCompleted,
    });
  } catch (error) {
    console.error('Error verificando progreso de onboarding:', error);
    return NextResponse.json(
      { error: 'Error verificando progreso de onboarding' },
      { status: 500 }
    );
  }
}
