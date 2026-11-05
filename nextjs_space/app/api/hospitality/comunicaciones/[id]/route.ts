export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { Prisma } from '@prisma/client';
import { COMUNICACION_EVENTOS, IDIOMAS_COMUNICACION, leerDiseno } from '@/lib/hospitality/comunicaciones';
import { normalizarDiseno } from '@/lib/hospitality/comunicaciones-email';

/** PATCH /api/hospitality/comunicaciones/[id] — editar/activar/desactivar. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
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
    const { evento, canal, asunto, contenido, activo, idioma, diseno } = body;

    // El diseño visual se valida con las mismas reglas que lo lee el envío. Un
    // `diseno: null` explícito lo borra (vuelve al correo de texto).
    let disenoParaGuardar: unknown;
    let hayDisenoNuevo: boolean | undefined;
    if (diseno !== undefined) {
      if (diseno === null) {
        disenoParaGuardar = Prisma.DbNull;
        hayDisenoNuevo = false;
      } else {
        const validado = normalizarDiseno(diseno);
        if (!validado.ok) {
          return NextResponse.json({ error: validado.error }, { status: 400 });
        }
        disenoParaGuardar = validado.diseno;
        hayDisenoNuevo = true;
      }
    }

    if (evento !== undefined && !COMUNICACION_EVENTOS.includes(evento)) {
      return NextResponse.json(
        { error: `evento inválido. Debe ser uno de: ${COMUNICACION_EVENTOS.join(', ')}` },
        { status: 400 }
      );
    }
    if (canal !== undefined && !['whatsapp', 'email'].includes(canal)) {
      return NextResponse.json({ error: 'canal inválido. Debe ser whatsapp o email' }, { status: 400 });
    }
    if (idioma !== undefined && !IDIOMAS_COMUNICACION.includes(idioma)) {
      return NextResponse.json(
        { error: `idioma inválido. Debe ser uno de: ${IDIOMAS_COMUNICACION.join(', ')}` },
        { status: 400 }
      );
    }
    const canalFinal = canal !== undefined ? canal : existente.canal;
    const asuntoFinal = asunto !== undefined ? (asunto ? String(asunto).trim() : null) : existente.asunto;
    if (canalFinal === 'email' && !asuntoFinal) {
      return NextResponse.json({ error: 'asunto es obligatorio para plantillas de email' }, { status: 400 });
    }

    // Una plantilla de email tiene que llevar algo: texto o diseño. Quitarle el
    // diseño a una plantilla que no tenía texto la dejaría enviando un correo
    // vacío, así que se rechaza en el momento y no en el envío.
    const contenidoFinal = contenido !== undefined ? String(contenido ?? '').trim() : String(existente.contenido ?? '').trim();
    const disenoFinal = hayDisenoNuevo === undefined ? leerDiseno(existente.diseno) : hayDisenoNuevo;
    if (canalFinal === 'email' && !contenidoFinal && !disenoFinal) {
      return NextResponse.json(
        { error: 'La plantilla de email necesita contenido o un diseño con bloques' },
        { status: 400 }
      );
    }
    if (canalFinal === 'whatsapp' && !contenidoFinal) {
      return NextResponse.json({ error: 'contenido es obligatorio' }, { status: 400 });
    }

    const plantilla = await prisma.hospitalityCommunicationTemplate.update({
      where: { id },
      data: {
        ...(evento !== undefined ? { evento } : {}),
        ...(canal !== undefined ? { canal: canalFinal } : {}),
        ...(asunto !== undefined ? { asunto: asuntoFinal } : {}),
        ...(contenido !== undefined ? { contenido: String(contenido).trim() } : {}),
        ...(idioma !== undefined ? { idioma } : {}),
        ...(activo !== undefined ? { activo: !!activo } : {}),
        ...(diseno !== undefined ? { diseno: disenoParaGuardar as object } : {}),
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
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
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