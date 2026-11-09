export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/email-campanas/[id] - Obtener campaña específica
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const campana = await prisma.emailCampaign.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      },
      include: {
        plantilla: true,
        audiencia: true,
        destinatarios: {
          take: 10,
          orderBy: { fechaEnviado: 'desc' },
          include: {
            lead: {
              select: { nombre: true, email: true }
            }
          }
        },
        _count: {
          select: { destinatarios: true }
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

// PUT /api/email-campanas/[id] - Actualizar campaña
export async function PUT(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Verificar que la campaña existe y pertenece al tenant
    const campanaExistente = await prisma.emailCampaign.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!campanaExistente) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    // No permitir editar campañas que ya se enviaron
    if (['enviando', 'enviada'].includes(campanaExistente.estado)) {
      return NextResponse.json(
        { error: 'No se puede editar una campaña que ya se envió' },
        { status: 400 }
      );
    }

    const data = await request.json();

    const campanaActualizada = await prisma.emailCampaign.update({
      where: { id: params.id },
      data: {
        nombre: data.nombre,
        asunto: data.asunto,
        remitente: data.remitente,
        remitenteEmail: data.remitenteEmail,
        responderA: data.responderA,
        contenidoHTML: data.contenidoHTML,
        contenidoTexto: data.contenidoTexto,
        plantillaId: data.plantillaId,
        audienciaId: data.audienciaId,
        filtrosJSON: data.filtrosJSON ? JSON.stringify(data.filtrosJSON) : null,
        tipoProgramacion: data.tipoProgramacion,
        fechaEnvio: data.fechaEnvio ? new Date(data.fechaEnvio) : null
      },
      include: {
        plantilla: true,
        audiencia: true
      }
    });

    // Registro de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'ACTUALIZAR',
        entidad: 'EmailCampaign',
        entidadId: campanaActualizada.id,
        descripcion: `Campaña de email actualizada: ${campanaActualizada.nombre}`
      }
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

// DELETE /api/email-campanas/[id] - Eliminar campaña
export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const campana = await prisma.emailCampaign.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    // Solo permitir eliminar borradores o campañas fallidas
    if (!['borrador', 'fallida'].includes(campana.estado)) {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar campañas en borrador o fallidas' },
        { status: 400 }
      );
    }

    await prisma.emailCampaign.delete({
      where: { id: params.id }
    });

    // Registro de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'ELIMINAR',
        entidad: 'EmailCampaign',
        entidadId: params.id,
        descripcion: `Campaña de email eliminada: ${campana.nombre}`
      }
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
