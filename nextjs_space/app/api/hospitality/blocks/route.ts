export const dynamic = 'force-dynamic';

/**
 * Bloqueos manuales de fechas por unidad.
 * Intervalo: fechaInicio inclusiva, fechaFin exclusiva.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import {
  esTipoBloqueoValido,
  limpiarMotivo,
  normalizarTipoBloqueo,
  TIPO_BLOQUEO_POR_DEFECTO,
  type TipoBloqueo,
} from '@/lib/hospitality/block-types';
import { conflictoDeBloqueo } from '@/lib/hospitality/bloqueos-guarda';

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function pushUnitProperty(tenantId: string, propertyId: string) {
  try {
    await dispatchConnectivityPush(tenantId, propertyId, 'unidad_cambiada', { skipRates: true });
  } catch (error) {
    // El bloqueo queda guardado aunque el proveedor falle; el SyncLog conserva
    // la causa para reintento manual desde Conectividad.
    console.error('[Hospitality] Error en push tras cambiar bloqueo:', error);
  }
}

// GET /api/hospitality/blocks — listar bloqueos del tenant.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const unitId = searchParams.get('unitId');
    const from = parseDateOnly(searchParams.get('from'));
    const to = parseDateOnly(searchParams.get('to'));

    const where: any = { tenantId: auth.tenant!.id };
    if (propertyId) where.unit = { propertyId };
    if (unitId) where.unitId = unitId;
    if (from) where.fechaFin = { gt: from };
    if (to) where.fechaInicio = { lt: to };

    const blocks = await prisma.hospitalityUnitBlock.findMany({
      where,
      include: {
        unit: { select: { id: true, nombre: true, codigo: true, propertyId: true } },
      },
      orderBy: [{ fechaInicio: 'asc' }, { unitId: 'asc' }],
    });

    return NextResponse.json({
      blocks: blocks.map((block: any) => ({
        ...block,
        fechaInicio: serializeDate(block.fechaInicio),
        fechaFin: serializeDate(block.fechaFin),
      })),
    });
  } catch (error) {
    console.error('Error obteniendo bloqueos:', error);
    return NextResponse.json({ error: 'Error al obtener bloqueos' }, { status: 500 });
  }
}

// POST /api/hospitality/blocks
// Body: { unitId, fechaInicio, fechaFin, tipo?, motivo? }
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const body = await req.json().catch(() => ({}));
    const unitId = typeof body?.unitId === 'string' ? body.unitId.trim() : '';
    const fechaInicio = parseDateOnly(body?.fechaInicio);
    const fechaFin = parseDateOnly(body?.fechaFin);
    // El motivo es obligatorio: es la razón documentada del cierre (uso del
    // propietario, visita de un familiar, noches cedidas o vendidas a una
    // empresa fuera de canal, avería...). Un bloqueo sin razón deja al que mire
    // el calendario en marzo sin saber por qué esas noches estaban cerradas.
    const motivo = limpiarMotivo(body?.motivo);
    // El tipo decide qué representa el bloqueo (propietario, mantenimiento o
    // administrativo). Un valor desconocido no rompe: cae al por defecto.
    const tipo: TipoBloqueo = body?.tipo === undefined
      ? TIPO_BLOQUEO_POR_DEFECTO
      : esTipoBloqueoValido(body.tipo)
        ? body.tipo
        : TIPO_BLOQUEO_POR_DEFECTO;

    if (!unitId || !fechaInicio || !fechaFin) {
      return NextResponse.json(
        { error: 'unitId, fechaInicio y fechaFin son obligatorios (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    if (fechaFin.getTime() <= fechaInicio.getTime()) {
      return NextResponse.json({ error: 'La fecha fin debe ser posterior a la fecha inicio' }, { status: 400 });
    }
    if (!motivo) {
      return NextResponse.json(
        {
          error:
            'Indica el motivo del bloqueo: queda registrado con las fechas (uso del propietario, visita de un familiar, noches cedidas o vendidas a una empresa, avería...).',
        },
        { status: 400 }
      );
    }

    const unit = await prisma.hospitalityUnit.findFirst({
      where: { id: unitId, tenantId: auth.tenant!.id },
      select: { id: true, nombre: true, propertyId: true, property: { select: { nombre: true } } },
    });
    if (!unit) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

    const duplicate = await prisma.hospitalityUnitBlock.findFirst({
      where: {
        tenantId: auth.tenant!.id,
        unitId,
        estado: 'activo',
        fechaInicio: { lt: fechaFin },
        fechaFin: { gt: fechaInicio },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'El intervalo se solapa con otro bloqueo activo de esta unidad' },
        { status: 409 }
      );
    }

    // Las fechas ya contratadas no se cierran: un bloqueo resta disponibilidad
    // como una reserva, pero la reserva tiene un huésped detrás. La guarda es la
    // misma que usan el PATCH y el asistente (`bloqueos-guarda`).
    const conflicto = await conflictoDeBloqueo(auth.tenant!.id, unitId, fechaInicio, fechaFin);
    if (conflicto) return NextResponse.json(conflicto, { status: 409 });

    const block = await prisma.hospitalityUnitBlock.create({
      data: {
        tenantId: auth.tenant!.id,
        unitId,
        fechaInicio,
        fechaFin,
        tipo: normalizarTipoBloqueo(tipo),
        motivo,
      },
      include: { unit: { select: { id: true, nombre: true, codigo: true, propertyId: true } } },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'crear',
      'hospitality_unit_block',
      block.id,
      `Bloqueo (${normalizarTipoBloqueo(tipo)}) creado para "${unit.nombre}" del ${serializeDate(fechaInicio)} al ${serializeDate(fechaFin)} · motivo: ${motivo}`
    ).catch(() => {});

    await pushUnitProperty(auth.tenant!.id, unit.propertyId);

    return NextResponse.json(
      { block: { ...block, fechaInicio: serializeDate(block.fechaInicio), fechaFin: serializeDate(block.fechaFin) } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creando bloqueo:', error);
    return NextResponse.json({ error: 'Error al crear bloqueo' }, { status: 500 });
  }
}
