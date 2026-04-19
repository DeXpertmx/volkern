export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// POST /api/leads/[id]/convert - Convertir Lead a Contact + Deal (+ Gobernanza Fiscal)
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

    const body = await request.json();
    const { fiscalData } = body;

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

    // Si no existe, crear el contacto con gobernanza fiscal
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          tenantId: user.tenantId,
          nombre: lead.nombre,
          email: lead.email,
          telefono: lead.telefono,
          tipo: fiscalData?.fiscalType === 'EMPRESA' ? 'company' : 'person',
          isTaxValidated: !!fiscalData,
          cargo: lead.cargo,
          ubicacion: lead.ubicacion,
          linkedin: lead.linkedin,
          notas: lead.notas,
          tags: lead.tags
        }
      });

      // Crear Perfil Fiscal si hay datos
      if (fiscalData) {
        await prisma.perfilFiscalCliente.create({
          data: {
            tenantId: user.tenantId,
            contactId: contact.id,
            tipo: fiscalData.tipo,
            razonSocial: fiscalData.razonSocial || lead.nombre,
            country: fiscalData.country || 'ES',
            tipoIdFiscal: fiscalData.tipoIdFiscal || 'NIF',
            nif: fiscalData.nif,
            address: fiscalData.address,
            city: fiscalData.city,
            zipCode: fiscalData.zipCode,
            province: fiscalData.province,
            idFiscalValidado: true,
            fechaValidacion: new Date(),
            // Nuevos campos de gobernanza (Roadmap Alignment)
            defaultIva: fiscalData.defaultIva ? parseFloat(fiscalData.defaultIva) : 21.0,
            defaultIrpf: fiscalData.defaultIrpf ? parseFloat(fiscalData.defaultIrpf) : 0.0,
            recargoEquivalencia: !!fiscalData.recargoEquivalencia,
            emailFacturacion: fiscalData.emailFacturacion,
            iban: fiscalData.iban,
            regimenFiscal: fiscalData.regimenFiscal
          }
        });
      }
    }

    // Obtener la primera etapa disponible
    const firstStage = await prisma.pipelineStage.findFirst({
      where: {
        tenantId: user.tenantId,
        orden: { not: 999 }
      },
      orderBy: { orden: 'asc' }
    });

    // Crear el deal
    const deal = await prisma.deal.create({
      data: {
        tenantId: user.tenantId,
        contactId: contact.id,
        leadId: lead.id,
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

    // --- MIGRACIÓN DE HISTORIAL (ROADMAP UNIFICADO) ---
    // Migrar Tareas
    await prisma.task.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Migrar Interacciones
    await prisma.interaction.updateMany({
      where: { leadId: lead.id },
      data: { contactId: contact.id }
    });

    // Migrar Notas
    await prisma.note.updateMany({
      where: { leadId: lead.id },
      data: { contactId: contact.id }
    });

    // Migrar Citas
    await prisma.cita.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Migrar Adjuntos
    await prisma.leadAttachment.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Migrar Conversaciones (Emails/Chat)
    await prisma.conversation.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Migrar Deals existentes (si los había acumulado como lead)
    await prisma.deal.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Migrar Cotizaciones
    await prisma.cotizacion.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Migrar Contratos
    await prisma.contrato.updateMany({
      where: { leadId: lead.id, tenantId: user.tenantId },
      data: { contactId: contact.id }
    });

    // Audit logs
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'convertir',
        entidad: 'lead',
        entidadId: lead.id,
        descripcion: fiscalData 
          ? 'Lead convertido con Alta Fiscal validada' 
          : 'Lead convertido a contacto (sin datos fiscales todavía)',
        cambiosDespues: {
          contactId: contact.id,
          dealId: deal.id,
          isTaxValidated: !!fiscalData
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
