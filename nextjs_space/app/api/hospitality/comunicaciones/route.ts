export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { COMUNICACION_EVENTOS, IDIOMAS_COMUNICACION } from '@/lib/hospitality/comunicaciones';

/**
 * Plantillas de comunicación automática (plan maestro §21).
 *
 * GET  /api/hospitality/comunicaciones?evento=&canal=&activo=
 * POST /api/hospitality/comunicaciones — crear una plantilla por evento/canal
 *
 * Una plantilla pertenece SIEMPRE a un tenant. `evento` es uno de
 * confirmacion|pre_llegada|check_in|post_salida|resena y `canal` es
 * whatsapp|email. Las variables {{nombre}}, {{checkIn}}, ... se reemplazan
 * al enviar (ver lib/hospitality/comunicaciones.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const evento = searchParams.get('evento') || undefined;
    const canal = searchParams.get('canal') || undefined;
    const soloActivos = searchParams.get('activo') === 'true';

    const where: any = { tenantId: auth.tenant!.id };
    if (evento) where.evento = evento;
    if (canal) where.canal = canal;
    if (soloActivos) where.activo = true;

    const plantillas = await prisma.hospitalityCommunicationTemplate.findMany({
      where,
      orderBy: [{ evento: 'asc' }, { canal: 'asc' }, { fechaCreacion: 'asc' }],
    });

    return NextResponse.json({ plantillas, total: plantillas.length });
  } catch (error) {
    console.error('Error obteniendo plantillas de comunicación:', error);
    return NextResponse.json({ error: 'Error al obtener las plantillas de comunicación' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const { evento, canal, asunto, contenido, activo, idioma } = body;

    if (!evento || !COMUNICACION_EVENTOS.includes(evento)) {
      return NextResponse.json(
        { error: `evento inválido. Debe ser uno de: ${COMUNICACION_EVENTOS.join(', ')}` },
        { status: 400 }
      );
    }
    if (!canal || !['whatsapp', 'email'].includes(canal)) {
      return NextResponse.json({ error: 'canal inválido. Debe ser whatsapp o email' }, { status: 400 });
    }
    if (idioma !== undefined && !IDIOMAS_COMUNICACION.includes(idioma)) {
      return NextResponse.json(
        { error: `idioma inválido. Debe ser uno de: ${IDIOMAS_COMUNICACION.join(', ')}` },
        { status: 400 }
      );
    }
    if (!contenido || !String(contenido).trim()) {
      return NextResponse.json({ error: 'contenido es obligatorio' }, { status: 400 });
    }
    if (canal === 'email' && !asunto) {
      return NextResponse.json({ error: 'asunto es obligatorio para plantillas de email' }, { status: 400 });
    }

    const plantilla = await prisma.hospitalityCommunicationTemplate.create({
      data: {
        tenantId,
        evento,
        canal,
        asunto: asunto ? String(asunto).trim() : null,
        contenido: String(contenido).trim(),
        activo: activo !== false,
        idioma: IDIOMAS_COMUNICACION.includes(idioma) ? idioma : 'es',
      },
    });

    return NextResponse.json({ plantilla }, { status: 201 });
  } catch (error) {
    console.error('Error creando plantilla de comunicación:', error);
    return NextResponse.json({ error: 'Error al crear la plantilla de comunicación' }, { status: 500 });
  }
}