export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/email-campanas/audiences/[id]
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

    const audiencia = await prisma.audience.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!audiencia) {
      return NextResponse.json({ error: 'Audiencia no encontrada' }, { status: 404 });
    }

    // Calcular total actual
    const filtros = JSON.parse(audiencia.filtrosJSON || '{}');
    const where: any = { tenantId: user.tenantId, email: { not: '' } };

    if (filtros.tags?.length > 0) {
      where.tags = { contains: filtros.tags[0] };
    }

    if (filtros.scoreMin !== undefined || filtros.scoreMax !== undefined) {
      where.scoreValue = {
        gte: filtros.scoreMin || 0,
        lte: filtros.scoreMax || 100
      };
    }

    if (filtros.estado) {
      where.estado = filtros.estado;
    }

    const totalLeads = await prisma.lead.count({ where });

    return NextResponse.json({ ...audiencia, totalLeads });
  } catch (error: any) {
    console.error('Error al obtener audiencia:', error);
    return NextResponse.json(
      { error: 'Error al obtener audiencia', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/email-campanas/audiences/[id]
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

    const data = await request.json();

    const audiencia = await prisma.audience.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!audiencia) {
      return NextResponse.json({ error: 'Audiencia no encontrada' }, { status: 404 });
    }

    // Calcular nuevo total
    const filtros = data.filtros || JSON.parse(audiencia.filtrosJSON || '{}');
    const where: any = { tenantId: user.tenantId, email: { not: '' } };

    if (filtros.tags?.length > 0) {
      where.tags = { contains: filtros.tags[0] };
    }

    if (filtros.scoreMin !== undefined || filtros.scoreMax !== undefined) {
      where.scoreValue = {
        gte: filtros.scoreMin || 0,
        lte: filtros.scoreMax || 100
      };
    }

    if (filtros.estado) {
      where.estado = filtros.estado;
    }

    const totalLeads = await prisma.lead.count({ where });

    const updated = await prisma.audience.update({
      where: { id: params.id },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        filtrosJSON: JSON.stringify(filtros),
        totalLeads,
        ultimaActualizacion: new Date()
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'ACTUALIZAR',
        entidad: 'Audience',
        entidadId: updated.id,
        descripcion: `Audiencia actualizada: ${updated.nombre}`
      }
    });

    return NextResponse.json({ ...updated, totalLeads });
  } catch (error: any) {
    console.error('Error al actualizar audiencia:', error);
    return NextResponse.json(
      { error: 'Error al actualizar audiencia', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/email-campanas/audiences/[id]
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

    const audiencia = await prisma.audience.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!audiencia) {
      return NextResponse.json({ error: 'Audiencia no encontrada' }, { status: 404 });
    }

    // Verificar si está siendo usada
    const campanas = await prisma.emailCampaign.count({
      where: { audienciaId: audiencia.id }
    });

    if (campanas > 0) {
      return NextResponse.json(
        { error: `Esta audiencia está siendo usada por ${campanas} campaña(s)` },
        { status: 400 }
      );
    }

    await prisma.audience.delete({
      where: { id: params.id }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'ELIMINAR',
        entidad: 'Audience',
        entidadId: audiencia.id,
        descripcion: `Audiencia eliminada: ${audiencia.nombre}`
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar audiencia:', error);
    return NextResponse.json(
      { error: 'Error al eliminar audiencia', details: error.message },
      { status: 500 }
    );
  }
}
