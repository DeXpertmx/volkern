export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Lectura pura: si no existe progreso se devuelve null; el POST lo crea
    // (upsert) al primer guardado. Ya no se escribe dentro del GET.
    const progress = await prisma.onboardingProgress.findUnique({
      where: { tenantId: user.tenantId },
    });

    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error obteniendo progreso de onboarding:', error);
    return NextResponse.json(
      { error: 'Error obteniendo progreso de onboarding' },
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
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const {
      configuracionBasica,
      primerLead,
      primerServicio,
      configuracionCanales,
      primeraPagina,
      primeraAutomatizacion,
      invitacionEquipo,
      omitido,
      pasoActual,
      packSeleccionado,
    } = body;

    // Obtener progreso actual
    const currentProgress = await prisma.onboardingProgress.findUnique({
      where: { tenantId: user.tenantId },
    });

    // Actualizar progreso
    const updateData: any = {};

    if (configuracionBasica !== undefined) updateData.configuracionBasica = configuracionBasica;
    if (primerLead !== undefined) updateData.primerLead = primerLead;
    if (primerServicio !== undefined) updateData.primerServicio = primerServicio;
    if (configuracionCanales !== undefined) updateData.configuracionCanales = configuracionCanales;
    if (primeraPagina !== undefined) updateData.primeraPagina = primeraPagina;
    if (primeraAutomatizacion !== undefined) updateData.primeraAutomatizacion = primeraAutomatizacion;
    if (invitacionEquipo !== undefined) updateData.invitacionEquipo = invitacionEquipo;
    if (omitido !== undefined) updateData.omitido = omitido;
    if (pasoActual !== undefined) updateData.pasoActual = pasoActual;

    // Si se selecciona un pack, aplicarlo
    if (packSeleccionado) {
      const { getPackTemplate } = await import('@/lib/event-engine/pack-templates');
      const template = getPackTemplate(packSeleccionado);
      if (template) {
        const { PackSystem } = await import('@/lib/event-engine');
        await PackSystem.savePack(user.tenantId, template);
        updateData.packAplicado = packSeleccionado;
      }
    }

    // Verificar si todos los pasos están completados
    // Combinar valores actuales con los nuevos para verificar completitud
    const finalConfigBasica = configuracionBasica !== undefined ? configuracionBasica : (currentProgress?.configuracionBasica || false);
    const finalPrimerLead = primerLead !== undefined ? primerLead : (currentProgress?.primerLead || false);
    const finalPrimerServicio = primerServicio !== undefined ? primerServicio : (currentProgress?.primerServicio || false);
    const finalConfigCanales = configuracionCanales !== undefined ? configuracionCanales : (currentProgress?.configuracionCanales || false);
    const finalPrimeraPagina = primeraPagina !== undefined ? primeraPagina : (currentProgress?.primeraPagina || false);
    const finalPrimeraAutomatizacion = primeraAutomatizacion !== undefined ? primeraAutomatizacion : (currentProgress?.primeraAutomatizacion || false);
    const finalInvitacionEquipo = invitacionEquipo !== undefined ? invitacionEquipo : (currentProgress?.invitacionEquipo || false);

    const allStepsComplete =
      finalConfigBasica &&
      finalConfigCanales &&
      finalPrimerServicio &&
      finalPrimeraPagina &&
      finalPrimerLead &&
      finalPrimeraAutomatizacion &&
      finalInvitacionEquipo;

    if (allStepsComplete && !currentProgress?.completado) {
      updateData.completado = true;
      updateData.fechaCompletado = new Date();
    }

    const progress = await prisma.onboardingProgress.upsert({
      where: { tenantId: user.tenantId },
      update: updateData,
      create: {
        tenantId: user.tenantId,
        ...updateData,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: progress.completado ? 'onboarding_completado' : 'onboarding_actualizado',
        entidad: 'OnboardingProgress',
        entidadId: progress.id,
        descripcion: progress.completado
          ? 'Usuario completó el onboarding'
          : 'Usuario actualizó progreso del onboarding',
        cambiosDespues: updateData,
      },
    });

    if (progress.completado || configuracionBasica || primerLead || primerServicio) {
      try {
        const { trackFirstAction } = await import('@/lib/trial-onboarding');
        if (progress.completado) {
          await trackFirstAction(user.tenantId, 'onboarding_completado');
        }
        if (primerLead) {
          await trackFirstAction(user.tenantId, 'first_lead_created');
        }
        if (primerServicio) {
          await trackFirstAction(user.tenantId, 'first_service_created');
        }
      } catch (error) {
        console.error('[Onboarding] Error tracking trial activation:', error);
      }
    }

    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error actualizando progreso de onboarding:', error);
    return NextResponse.json(
      { error: 'Error actualizando progreso de onboarding' },
      { status: 500 }
    );
  }
}
