export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { EVENTS } from '@/lib/types/events';

/**
 * Reglas de automatización de Hospitality (plan maestro §22).
 *
 * Reutiliza el Automation Engine existente de Volkern (modelo AutomationRule
 * + AutomationRuleEngine + EventBus): NO duplica el motor. Esta API gestiona
 * las reglas cuyos triggerType pertenecen a Hospitality:
 *
 *   hospitality_reservation_created   → crear tarea de preparación
 *   hospitality_reservation_modified  → reaccionar a cambios
 *   hospitality_reservation_cancelled → liberar/bloquear
 *   hospitality_reservation_checked_in  → enviar instrucciones de acceso
 *   hospitality_reservation_checked_out → crear limpieza
 *   hospitality_checkin_due           → aviso 24h antes del check-in
 *   hospitality_cleaning_completed    → unidad disponible
 *   hospitality_maintenance_created/completed → avisos
 */
export const HOSPITALITY_TRIGGERS: string[] = [
  EVENTS.HOSPITALITY_RESERVATION_CREATED,
  EVENTS.HOSPITALITY_RESERVATION_MODIFIED,
  EVENTS.HOSPITALITY_RESERVATION_CANCELLED,
  EVENTS.HOSPITALITY_RESERVATION_CHECKED_IN,
  EVENTS.HOSPITALITY_RESERVATION_CHECKED_OUT,
  EVENTS.HOSPITALITY_CHECKIN_DUE,
  EVENTS.HOSPITALITY_CLEANING_COMPLETED,
  EVENTS.HOSPITALITY_MAINTENANCE_CREATED,
  EVENTS.HOSPITALITY_MAINTENANCE_COMPLETED,
];

export const HOSPITALITY_TRIGGER_LABELS: Record<string, string> = {
  [EVENTS.HOSPITALITY_RESERVATION_CREATED]: 'Reserva creada',
  [EVENTS.HOSPITALITY_RESERVATION_MODIFIED]: 'Reserva modificada',
  [EVENTS.HOSPITALITY_RESERVATION_CANCELLED]: 'Reserva cancelada',
  [EVENTS.HOSPITALITY_RESERVATION_CHECKED_IN]: 'Check-in realizado',
  [EVENTS.HOSPITALITY_RESERVATION_CHECKED_OUT]: 'Check-out realizado',
  [EVENTS.HOSPITALITY_CHECKIN_DUE]: 'Check-in en 24h',
  [EVENTS.HOSPITALITY_CLEANING_COMPLETED]: 'Limpieza completada',
  [EVENTS.HOSPITALITY_MAINTENANCE_CREATED]: 'Mantenimiento creado',
  [EVENTS.HOSPITALITY_MAINTENANCE_COMPLETED]: 'Mantenimiento completado',
};

export const HOSPITALITY_ACTION_TYPES = [
  'CREATE_HOSPITALITY_TASK',
  'CREATE_HOSPITALITY_CLEANING',
  'SEND_GUEST_MESSAGE',
  'SET_UNIT_STATUS',
] as const;

/** GET /api/hospitality/automatizaciones — reglas del tenant + logs recientes. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);
    const trigger = searchParams.get('trigger') || undefined;
    const soloActivas = searchParams.get('activas') === 'true';

    const where: any = { tenantId, triggerType: { in: HOSPITALITY_TRIGGERS } };
    if (trigger) where.triggerType = trigger;
    if (soloActivas) where.isActive = true;

    const rules = await prisma.automationRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        logs: {
          orderBy: { executedAt: 'desc' },
          take: 5,
          select: { id: true, entityId: true, status: true, error: true, result: true, executedAt: true },
        },
        _count: { select: { logs: true } },
      },
    });

    const logs = await prisma.automationLog.findMany({
      where: { tenantId, rule: { triggerType: { in: HOSPITALITY_TRIGGERS } } },
      orderBy: { executedAt: 'desc' },
      take: 20,
      include: { rule: { select: { id: true, name: true, triggerType: true } } },
    });

    return NextResponse.json({ reglas: rules, logs, total: rules.length });
  } catch (error) {
    console.error('Error obteniendo automatizaciones de Hospitality:', error);
    return NextResponse.json({ error: 'Error al obtener las automatizaciones' }, { status: 500 });
  }
}

/** POST /api/hospitality/automatizaciones — crear una regla. */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const { name, description, triggerType, conditions, actions, isActive } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'name es obligatorio' }, { status: 400 });
    }
    if (!triggerType || !HOSPITALITY_TRIGGERS.includes(triggerType)) {
      return NextResponse.json({ error: 'triggerType inválido. Debe ser un trigger de Hospitality' }, { status: 400 });
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json({ error: 'actions debe ser un arreglo no vacío' }, { status: 400 });
    }
    for (const a of actions) {
      if (!a?.type || !HOSPITALITY_ACTION_TYPES.includes(a.type)) {
        return NextResponse.json(
          { error: `acción inválida. Tipos permitidos: ${HOSPITALITY_ACTION_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const rule = await prisma.automationRule.create({
      data: {
        tenantId,
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        triggerType,
        conditions: conditions && typeof conditions === 'object' ? conditions : {},
        actions,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ regla: rule }, { status: 201 });
  } catch (error) {
    console.error('Error creando automatización de Hospitality:', error);
    return NextResponse.json({ error: 'Error al crear la automatización' }, { status: 500 });
  }
}