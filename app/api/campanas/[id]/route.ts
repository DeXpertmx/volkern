export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/campanas/[id] - Obtener campaña por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const campana = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        mensajes: {
          orderBy: { orden: 'asc' }
        },
        executions: {
          take: 100,
          orderBy: { fechaCreacion: 'desc' }
        },
        metrics: {
          orderBy: { fecha: 'desc' },
          take: 30
        }
      }
    });

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    return NextResponse.json(campana);
  } catch (error: any) {
    console.error('Error al obtener campaña:', error);
    return NextResponse.json(
      { error: 'Error al obtener campaña', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/campanas/[id] - Actualizar campaña
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const data = await request.json();

    // Verificar que la campaña existe y no está en ejecución
    const campanaExistente = await prisma.campaign.findUnique({
      where: { id: params.id }
    });

    if (!campanaExistente) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    if (campanaExistente.estado === 'en_curso') {
      return NextResponse.json(
        { error: 'No se puede editar una campaña en ejecución' },
        { status: 400 }
      );
    }

    // Actualizar la campaña
    const campana = await prisma.campaign.update({
      where: { id: params.id },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo,
        canales: data.canales,
        targetType: data.targetType,
        targetConfig: data.targetConfig,
        fechaProgramada: data.fechaProgramada ? new Date(data.fechaProgramada) : null,
        frecuencia: data.frecuencia,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : null
      }
    });

    // Actualizar mensajes si se proporcionan
    if (data.mensajes && Array.isArray(data.mensajes)) {
      // Eliminar mensajes existentes
      await prisma.campaignMessage.deleteMany({
        where: { campaignId: params.id }
      });

      // Crear nuevos mensajes
      for (const mensaje of data.mensajes) {
        await prisma.campaignMessage.create({
          data: {
            campaignId: params.id,
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

    // Obtener la campaña completa actualizada
    const campanaActualizada = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { mensajes: true }
    });

    return NextResponse.json(campanaActualizada);
  } catch (error: any) {
    console.error('Error al actualizar campaña:', error);
    return NextResponse.json(
      { error: 'Error al actualizar campaña', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/campanas/[id] - Eliminar campaña
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verificar que la campaña existe
    const campana = await prisma.campaign.findUnique({
      where: { id: params.id }
    });

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    if (campana.estado === 'en_curso') {
      return NextResponse.json(
        { error: 'No se puede eliminar una campaña en ejecución' },
        { status: 400 }
      );
    }

    // Eliminar la campaña (cascade eliminará mensajes, ejecuciones y métricas)
    await prisma.campaign.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar campaña:', error);
    return NextResponse.json(
      { error: 'Error al eliminar campaña', details: error.message },
      { status: 500 }
    );
  }
}
