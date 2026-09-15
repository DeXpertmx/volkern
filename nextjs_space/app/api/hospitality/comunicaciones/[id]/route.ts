export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { COMUNICACION_EVENTOS } from '@/lib/hospitality/comunicaciones';

/** PATCH /api/hospitality/comunicaciones/[id] — editar/activar/desactivar. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const existente = await prisma.hospitalityCommunicationTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Plantilla no encontrada en este tenant' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { evento, canal, asunto, contenido, activo } = body;

    if (evento !== undefined && !COMUNICACION_EVENTOS.includes(evento)) {
      return NextResponse.json(
        { error: `evento inválido. Debe ser uno de: ${COMUNICACION_EVENTOS.join(', ')}` },
        { status: 400 }
      );
    }
    if (canal !== undefined && !['whatsapp', 'email'].includes(canal)) {
      return NextResponse.json({ error: 'canal inválido. Debe ser whatsapp o email' }, { status: 400 });
    }
    const canalFinal = canal !== undefined ? canal : existente.canal;
    const asuntoFinal = asunto !== undefined ? (asunto ? String(asunto).trim() : null) : existente.asunto;
    if (canalFinal === 'email' && !asuntoFinal) {
      return NextResponse.json({ error: 'asunto es obligatorio para plantillas de email' }, { status: 400 });
    }

    const plantilla = await prisma.hospitalityCommunicationTemplate.update({
      where: { id },
      data: {
        ...(evento !== undefined ? { evento } : {}),
        ...(canal !== undefined ? { canal: canalFinal } : {}),
        ...(asunto !== undefined ? { asunto: asuntoFinal } : {}),
        ...(contenido !== undefined ? { contenido: String(contenido).trim() } : {}),
        ...(activo !== undefined ? { activo: !!activo } : {}),
      },
    });

    return NextResponse.json({ plantilla });
  } catch (error) {
    console.error('Error actualizando plantilla de comunicación:', error);
    return NextResponse.json({ error: 'Error al actualizar la plantilla de comunicación' }, { status: 500 });
  }
}

/** DELETE /api/hospitality/comunicaciones/[id] — eliminar una plantilla del tenant. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const existente = await prisma.hospitalityCommunicationTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Plantilla no encontrada en este tenant' }, { status: 404 });
    }

    await prisma.hospitalityCommunicationTemplate.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando plantilla de comunicación:', error);
    return NextResponse.json({ error: 'Error al eliminar la plantilla de comunicación' }, { status: 500 });
  }
}