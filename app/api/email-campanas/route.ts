export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/email-campanas - Listar campañas de email
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

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');

    const where: any = { tenantId: user.tenantId };
    if (estado) where.estado = estado;

    const campanas = await prisma.emailCampaign.findMany({
      where,
      include: {
        plantilla: {
          select: { nombre: true }
        },
        audiencia: {
          select: { nombre: true, totalLeads: true }
        },
        _count: {
          select: { destinatarios: true }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(campanas);
  } catch (error: any) {
    console.error('Error al obtener campañas de email:', error);
    return NextResponse.json(
      { error: 'Error al obtener campañas', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/email-campanas - Crear campaña de email
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true, name: true, email: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const data = await request.json();

    // Validaciones
    if (!data.nombre || !data.asunto || !data.contenidoHTML) {
      return NextResponse.json(
        { error: 'Campos requeridos: nombre, asunto, contenidoHTML' },
        { status: 400 }
      );
    }

    // Crear la campaña
    const campana = await prisma.emailCampaign.create({
      data: {
        tenantId: user.tenantId,
        nombre: data.nombre,
        asunto: data.asunto,
        remitente: data.remitente || user.name || 'Volkern CRM',
        remitenteEmail: data.remitenteEmail || user.email,
        responderA: data.responderA || user.email,
        contenidoHTML: data.contenidoHTML,
        contenidoTexto: data.contenidoTexto,
        plantillaId: data.plantillaId,
        audienciaId: data.audienciaId,
        filtrosJSON: data.filtrosJSON ? JSON.stringify(data.filtrosJSON) : null,
        tipoProgramacion: data.tipoProgramacion || 'inmediato',
        fechaEnvio: data.fechaEnvio ? new Date(data.fechaEnvio) : null,
        creadoPor: user.id,
        estado: 'borrador'
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
        accion: 'CREAR',
        entidad: 'EmailCampaign',
        entidadId: campana.id,
        descripcion: `Campaña de email creada: ${campana.nombre}`
      }
    });

    return NextResponse.json(campana, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear campaña de email:', error);
    return NextResponse.json(
      { error: 'Error al crear campaña', details: error.message },
      { status: 500 }
    );
  }
}
