export const dynamic = 'force-dynamic';
/**
 * API para estadísticas del Chatbot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
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

    // Obtener configuración con estadísticas
    const config = await prisma.chatbotConfig.findUnique({
      where: { tenantId: user.tenantId }
    });

    if (!config) {
      return NextResponse.json({
        totalConversaciones: 0,
        totalCitasAgendadas: 0,
        totalTransferencias: 0,
        mensajesHoy: 0,
        citasHoy: 0,
      });
    }

    // Contar mensajes del chatbot hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const mensajesHoy = await prisma.message.count({
      where: {
        conversation: {
          tenantId: user.tenantId
        },
        fechaCreacion: { gte: hoy },
        metadatos: {
          path: ['source'],
          equals: 'chatbot'
        }
      }
    });

    // Contar citas agendadas hoy
    const citasHoy = await prisma.cita.count({
      where: {
        tenantId: user.tenantId,
        fechaCreacion: { gte: hoy },
        descripcion: { contains: 'chatbot' }
      }
    });

    return NextResponse.json({
      totalConversaciones: config.totalConversaciones,
      totalCitasAgendadas: config.totalCitasAgendadas,
      totalTransferencias: config.totalTransferencias,
      mensajesHoy,
      citasHoy,
    });

  } catch (error) {
    console.error('Error obteniendo stats chatbot:', error);
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    );
  }
}
