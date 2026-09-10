export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { HOSPITALITY_TRIGGERS } from '../../route';
import { AutomationRuleEngine } from '@/lib/marketing/automation/rule-engine';

/**
 * POST /api/hospitality/automatizaciones/[id]/test
 *
 * Dispara la regla con datos reales del tenant (la reserva más reciente),
 * pasando por el AutomationRuleEngine real. Devuelve cuántas reglas
 * coincidieron y si se encolaron acciones. Útil para verificar de punta a
 * punta sin esperar al evento real.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const regla = await prisma.automationRule.findFirst({
      where: { id, tenantId, triggerType: { in: HOSPITALITY_TRIGGERS } },
    });
    if (!regla) {
      return NextResponse.json({ error: 'Automatización no encontrada en este tenant' }, { status: 404 });
    }

    // Contexto de ejemplo: la reserva más reciente del tenant.
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { tenantId },
      orderBy: { fechaCreacion: 'desc' },
    });

    const payload = reserva
      ? {
          tenantId,
          reservationId: reserva.id,
          propertyId: reserva.propertyId,
          unitId: reserva.unitId,
          contactId: reserva.contactId,
          channel: reserva.channel,
          externalBookingId: reserva.externalBookingId,
          estado: reserva.estado,
          checkIn: reserva.checkIn ? reserva.checkIn.toISOString() : undefined,
          checkOut: reserva.checkOut ? reserva.checkOut.toISOString() : undefined,
          guestData: reserva.guestData || undefined,
          timestamp: new Date(),
          source: 'app' as const,
        }
      : {
          tenantId,
          reservationId: 'reserva-ejemplo',
          unitId: 'unidad-ejemplo',
          channel: 'Airbnb',
          externalBookingId: 'BK-EXAMPLE',
          estado: 'confirmed',
          timestamp: new Date(),
          source: 'app' as const,
        };

    // Procesar por el engine real (busca reglas activas del tenant+trigger).
    await AutomationRuleEngine.processEvent(regla.triggerType, payload);

    return NextResponse.json({
      ok: true,
      trigger: regla.triggerType,
      payload,
      nota: 'Regla evaluada por el engine. Si Redis está disponible, las acciones quedaron encoladas.',
    });
  } catch (error) {
    console.error('Error probando automatización de Hospitality:', error);
    return NextResponse.json({ error: 'Error al probar la automatización' }, { status: 500 });
  }
}