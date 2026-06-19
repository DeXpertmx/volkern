export const dynamic = 'force-dynamic';
/**
 * API para configuración del Chatbot WhatsApp
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isModuleActive } from '@/lib/plans';

/**
 * GET - Obtener configuración del chatbot
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { 
        tenant: {
          include: { tenantFeatures: true }
        }
      }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    // Obtener o crear configuración por defecto
    let config = await prisma.chatbotConfig.findUnique({
      where: { tenantId: user.tenantId }
    });

    if (!config) {
      config = await prisma.chatbotConfig.create({
        data: {
          tenantId: user.tenantId,
          activo: false,
          nombreAsistente: 'Asistente Virtual',
        }
      });
    }

    // Obtener servicios para mostrar en UI
    const servicios = await prisma.servicio.findMany({
      where: { tenantId: user.tenantId, activo: true },
      select: { id: true, nombre: true, duracionMinutos: true, precio: true }
    });

    const isHired = user.tenant 
      ? isModuleActive('chatbot_whatsapp', user.tenant.plan, user.tenant.tenantFeatures)
      : false;

    return NextResponse.json({
      config,
      servicios,
      isHired,
      tenantNombre: user.tenant?.nombre,
      tenantId: user.tenantId
    });

  } catch (error) {
    console.error('Error obteniendo config chatbot:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

/**
 * POST - Actualizar configuración del chatbot
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const body = await request.json();
    const {
      activo,
      nombreAsistente,
      mensajeBienvenida,
      mensajeFueraHorario,
      personalidad,
      contextoNegocio,
      horarioInicio,
      horarioFin,
      diasActivos,
      timezone,
      horariosPersonalizados,
      puedeAgendarCitas,
      puedeMostrarServicios,
      puedeTransferirHumano,
      maxMensajesPorConversacion,
      tiempoEsperaTransferencia,
      ragActivo,
    } = body;

    const config = await prisma.chatbotConfig.upsert({
      where: { tenantId: user.tenantId },
      update: {
        activo: activo ?? undefined,
        nombreAsistente: nombreAsistente ?? undefined,
        mensajeBienvenida: mensajeBienvenida ?? undefined,
        mensajeFueraHorario: mensajeFueraHorario ?? undefined,
        personalidad: personalidad ?? undefined,
        contextoNegocio: contextoNegocio ?? undefined,
        horarioInicio: horarioInicio ?? undefined,
        horarioFin: horarioFin ?? undefined,
        diasActivos: diasActivos ?? undefined,
        timezone: timezone ?? undefined,
        horariosPersonalizados: horariosPersonalizados ?? undefined,
        puedeAgendarCitas: puedeAgendarCitas ?? undefined,
        puedeMostrarServicios: puedeMostrarServicios ?? undefined,
        puedeTransferirHumano: puedeTransferirHumano ?? undefined,
        maxMensajesPorConversacion: maxMensajesPorConversacion ?? undefined,
        tiempoEsperaTransferencia: tiempoEsperaTransferencia ?? undefined,
        ragActivo: ragActivo ?? undefined,
      },
      create: {
        tenantId: user.tenantId,
        activo: activo ?? true,
        nombreAsistente: nombreAsistente || 'Asistente Virtual',
        mensajeBienvenida,
        mensajeFueraHorario,
        personalidad,
        contextoNegocio,
        horarioInicio: horarioInicio ?? 9,
        horarioFin: horarioFin ?? 18,
        diasActivos: diasActivos || '1,2,3,4,5',
        timezone: timezone || 'America/Mexico_City',
        horariosPersonalizados: horariosPersonalizados ?? null,
        puedeAgendarCitas: puedeAgendarCitas ?? true,
        puedeMostrarServicios: puedeMostrarServicios ?? true,
        puedeTransferirHumano: puedeTransferirHumano ?? true,
        maxMensajesPorConversacion: maxMensajesPorConversacion ?? 50,
        tiempoEsperaTransferencia: tiempoEsperaTransferencia ?? 300,
        ragActivo: ragActivo ?? true,
      }
    });

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        accion: 'actualizar',
        entidad: 'chatbot_config',
        entidadId: config.id,
        descripcion: `Configuración del chatbot actualizada. Activo: ${config.activo}`,
        tenantId: user.tenantId,
      }
    });

    return NextResponse.json({
      success: true,
      config
    });

  } catch (error) {
    console.error('Error actualizando config chatbot:', error);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
