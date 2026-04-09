export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// POST /api/leads/[id]/convert - Convertir Lead a Contact + Deal
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Obtener el lead
    const lead = await prisma.lead.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead no encontrado' },
        { status: 404 }
      );
    }

    // Verificar si ya fue convertido
    if (lead.status === 'converted') {
      return NextResponse.json(
        { error: 'Este lead ya fue convertido' },
        { status: 400 }
      );
    }

    // Verificar si ya existe un contacto con este email
    let contact = await prisma.contact.findFirst({
      where: {
        tenantId: user.tenantId,
        email: lead.email
      }
    });

    // Si no existe, crear el contacto
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId: user.tenantId,
          nombre: lead.nombre,
          email: lead.email,
          telefono: lead.telefono,
          tipo: 'person',
          cargo: lead.cargo,
          ubicacion: lead.ubicacion,
          linkedin: lead.linkedin,
          notas: lead.notas,
          tags: lead.tags
        }
      });
    }

    // Obtener la primera etapa disponible o usar 'Calificación' por defecto
    const firstStage = await prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        orden: { not: 999 } // Excluir etapas finales
      },
      orderBy: { orden: 'asc' }
    });

    // Crear el deal
    const deal = await prisma.deal.create({
      data: {
        tenantId: user.tenantId,
        contactId: contact.id,
        leadId: lead.id, // Keep for backward compatibility
        usuarioAsignadoId: lead.asignadoA,
        titulo: `Oportunidad de ${contact.nombre}`,
        valor: 0,
        moneda: 'EUR',
        etapa: firstStage?.nombre || 'Calificación',
        probabilidad: firstStage?.probabilidad || 25,
        estado: 'activo',
        prioridad: 'media',
        origen: lead.fuente || 'conversion_lead'
      }
    });

    // Actualizar el lead
    await prisma.lead.update({
      where: { id: params.id },
      data: {
        status: 'converted',
        estado: 'convertido',
        convertedToContactId: contact.id,
        convertedAt: new Date()
      }
    });

    // Audit logs
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'convertir',
        entidad: 'lead',
        entidadId: lead.id,
        descripcion: 'Lead convertido a contacto y deal',
        cambiosDespues: {
          contactId: contact.id,
          dealId: deal.id
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'crear',
        entidad: 'deal',
        entidadId: deal.id,
        descripcion: 'Deal creado desde conversión de lead',
        cambiosDespues: {
          origen: 'conversion_lead',
          leadId: lead.id,
          contactId: contact.id
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        contact,
        deal
      },
      message: 'Lead convertido exitosamente'
    });
  } catch (error) {
    console.error('Error al convertir lead:', error);
    return NextResponse.json(
      { error: 'Error al convertir lead' },
      { status: 500 }
    );
  }
}
