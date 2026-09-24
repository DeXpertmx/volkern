export const dynamic = 'force-dynamic';

/**
 * API de la fianza de una reserva (módulo `lib/hospitality/fianza`).
 *
 * GET    /api/hospitality/reservations/[id]/fianza — estado actual.
 * POST   /api/hospitality/reservations/[id]/fianza — registrar / cobrar /
 *        devolver / aplicar a daños. El cobro y la devolución REAL del dinero
 *        siguen siendo pagos de Finanzas; aquí solo se mueve el estado de la
 *        línea de garantía.
 * DELETE /api/hospitality/reservations/[id]/fianza — quitar una fianza
 *        registrada por error (solo mientras está pendiente).
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import {
  cambiarEstadoFianza,
  estadoFianza,
  registrarFianza,
  quitarFianza,
} from '@/lib/hospitality/fianza';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const fianza = await estadoFianza(auth.tenant!.id, id);
    return NextResponse.json({ fianza });
  } catch (error) {
    console.error('Error consultando la fianza:', error);
    return NextResponse.json({ error: 'Error al consultar la fianza' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La fianza es dinero (se cobra y se retiene): decide Finanzas, no una
    // edición de reserva.
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const { accion, importe, moneda, importeRetenido } = body || {};

    let resultado;
    if (accion === 'registrar') {
      resultado = await registrarFianza(auth.tenant!.id, id, Number(importe), { moneda });
    } else if (accion === 'cobrar' || accion === 'devolver' || accion === 'aplicar') {
      resultado = await cambiarEstadoFianza(auth.tenant!.id, id, accion, { importeRetenido });
    } else {
      return NextResponse.json({ error: 'Acción inválida (registrar|cobrar|devolver|aplicar)' }, { status: 400 });
    }

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_reservation',
      id,
      `Fianza ${resultado.accion}: ${resultado.importe} ${resultado.moneda}`
    ).catch(() => {});

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('Error actualizando la fianza:', error);
    return NextResponse.json({ error: 'Error al actualizar la fianza' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'finanzas.gestionar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const resultado = await quitarFianza(auth.tenant!.id, id);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error quitando la fianza:', error);
    return NextResponse.json({ error: 'Error al quitar la fianza' }, { status: 500 });
  }
}
