export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

/**
 * GET - Mensajes de WhatsApp de las conversaciones ligadas a un lead/contacto.
 *
 * Alimenta el timeline de la ficha para mostrar el estado real de cada mensaje
 * (pendiente, enviado, entregado, leído o fallido con motivo), que se actualiza
 * desde el webhook de Evolution (MESSAGES_UPDATE).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });
    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo');
    const entityId = searchParams.get('entityId');

    if ((tipo !== 'lead' && tipo !== 'contact') || !entityId) {
      return NextResponse.json(
        { error: 'tipo (lead|contact) y entityId son requeridos' },
        { status: 400 }
      );
    }

    // La ficha debe ser del tenant: nunca devolver mensajes de otro.
    if (tipo === 'lead') {
      const lead = await prisma.lead.findFirst({
        where: { id: entityId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    } else {
      const contacto = await prisma.contact.findFirst({
        where: { id: entityId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!contacto) {
        return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
      }
    }

    const conversaciones = await prisma.conversation.findMany({
      where: {
        tenantId: user.tenantId,
        canal: 'whatsapp',
        ...(tipo === 'lead' ? { leadId: entityId } : { contactId: entityId }),
      },
      select: { id: true },
      take: 20,
    });

    if (conversaciones.length === 0) {
      return NextResponse.json({ mensajes: [] });
    }

    const mensajes = await prisma.message.findMany({
      where: {
        conversationId: { in: conversaciones.map((c) => c.id) },
        canal: 'whatsapp',
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 60,
      select: {
        id: true,
        conversationId: true,
        contenido: true,
        direccion: true,
        estado: true,
        errorMensaje: true,
        fechaCreacion: true,
        metadatos: true,
      },
    });

    return NextResponse.json({ mensajes });
  } catch (error: any) {
    console.error('Error al cargar mensajes de la ficha:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al cargar los mensajes' },
      { status: 500 }
    );
  }
}
