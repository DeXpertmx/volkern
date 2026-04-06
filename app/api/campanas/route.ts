export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/campanas - Listar campañas
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const tipo = searchParams.get('tipo');

    const where: any = {};
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;

    const campanas = await prisma.campaign.findMany({
      where,
      include: {
        mensajes: true,
        _count: {
          select: {
            executions: true
          }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(campanas);
  } catch (error: any) {
    console.error('Error al obtener campañas:', error);
    return NextResponse.json(
      { error: 'Error al obtener campañas', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/campanas - Crear campaña
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const data = await request.json();

    // Crear la campaña
    const campana = await prisma.campaign.create({
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo || 'manual',
        canales: data.canales || [],
        targetType: data.targetType || 'todos',
        targetConfig: data.targetConfig || {},
        fechaProgramada: data.fechaProgramada ? new Date(data.fechaProgramada) : null,
        frecuencia: data.frecuencia,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : null
      }
    });

    // Crear mensajes asociados
    if (data.mensajes && Array.isArray(data.mensajes)) {
      for (const mensaje of data.mensajes) {
        await prisma.campaignMessage.create({
          data: {
            campaignId: campana.id,
            canal: mensaje.canal,
            asunto: mensaje.asunto,
            contenido: mensaje.contenido,
            mediaUrl: mensaje.mediaUrl,
            orden: mensaje.orden || 0,
            delayMinutos: mensaje.delayMinutos
          }
        });
      }
    }

    // Obtener la campaña completa con mensajes
    const campanaCompleta = await prisma.campaign.findUnique({
      where: { id: campana.id },
      include: { mensajes: true }
    });

    return NextResponse.json(campanaCompleta, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear campaña:', error);
    return NextResponse.json(
      { error: 'Error al crear campaña', details: error.message },
      { status: 500 }
    );
  }
}
