export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/email-campanas/audiences - Listar audiencias
export async function GET(request: NextRequest) {
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

    const audiencias = await prisma.audience.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { fechaCreacion: 'desc' }
    });

    // Calcular total de leads por audiencia
    const audienciasConConteo = await Promise.all(
      audiencias.map(async (audiencia) => {
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

        return {
          ...audiencia,
          totalLeads
        };
      })
    );

    return NextResponse.json(audienciasConConteo);
  } catch (error: any) {
    console.error('Error al obtener audiencias:', error);
    return NextResponse.json(
      { error: 'Error al obtener audiencias', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/email-campanas/audiences - Crear audiencia
export async function POST(request: NextRequest) {
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

    if (!data.nombre) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    // Calcular total de leads que coinciden
    const filtros = data.filtros || {};
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

    // Crear audiencia
    const audiencia = await prisma.audience.create({
      data: {
        tenantId: user.tenantId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        filtrosJSON: JSON.stringify(filtros),
        totalLeads,
        creadoPor: user.id
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'CREAR',
        entidad: 'Audience',
        entidadId: audiencia.id,
        descripcion: `Audiencia creada: ${audiencia.nombre} (${totalLeads} leads)`
      }
    });

    return NextResponse.json({ ...audiencia, totalLeads }, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear audiencia:', error);
    return NextResponse.json(
      { error: 'Error al crear audiencia', details: error.message },
      { status: 500 }
    );
  }
}
