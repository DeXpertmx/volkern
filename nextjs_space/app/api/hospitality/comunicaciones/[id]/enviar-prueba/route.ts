export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { formatearImporte, primeraMoneda } from '@/lib/moneda';
import {
  buildContextoPlantilla,
  renderPlantilla,
  enviarComunicacion,
} from '@/lib/hospitality/comunicaciones';

/**
 * POST /api/hospitality/comunicaciones/[id]/enviar-prueba
 * Envía la plantilla a un destinatario de prueba usando un contexto de ejemplo
 * (la reserva más reciente del tenant si existe). Devuelve el resultado real.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'comunicaciones.enviar');
    if (sinPermiso) return sinPermiso;

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const plantilla = await prisma.hospitalityCommunicationTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!plantilla) {
      return NextResponse.json({ error: 'Plantilla no encontrada en este tenant' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const destinatario = String(body.destinatario || '').trim();
    if (!destinatario) {
      return NextResponse.json({ error: 'destinatario es obligatorio (email o teléfono)' }, { status: 400 });
    }

    // Contexto de ejemplo: la reserva más reciente del tenant (si existe).
    const reservaEjemplo = await prisma.hospitalityReservation.findFirst({
      where: { tenantId },
      orderBy: { fechaCreacion: 'desc' },
      include: {
        unit: { select: { nombre: true } },
        property: { select: { nombre: true } },
      },
    });

    const contexto = reservaEjemplo
      ? buildContextoPlantilla({ reserva: reservaEjemplo, unidad: reservaEjemplo.unit, propiedad: reservaEjemplo.property })
      : {
          nombre: 'Cliente de ejemplo',
          email: destinatario,
          telefono: destinatario,
          unidad: 'Villa de prueba',
          propiedad: 'Propiedad de ejemplo',
          canal: 'Airbnb',
          referencia: 'BK-EXAMPLE-001',
          checkIn: 'viernes, 15 de octubre',
          checkOut: 'domingo, 18 de octubre',
          noches: '3',
          // El importe de ejemplo se escribe como los reales: en la divisa del
          // tenant y con el formateador del módulo de dinero.
          importe: formatearImporte(6900, primeraMoneda(auth.tenant?.moneda)),
          estado: 'confirmed',
        };

    const contenido = renderPlantilla(plantilla.contenido, contexto);

    const resultado = await enviarComunicacion({
      tenantId,
      canal: plantilla.canal,
      asunto: plantilla.asunto,
      contenido,
      destinatario,
    });

    return NextResponse.json({ ok: resultado.ok, resultado, contexto, contenidoPreview: contenido });
  } catch (error) {
    console.error('Error enviando prueba de plantilla:', error);
    return NextResponse.json({ error: 'Error al enviar la plantilla de prueba' }, { status: 500 });
  }
}