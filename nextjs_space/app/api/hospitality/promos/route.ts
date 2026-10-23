export const dynamic = 'force-dynamic';

/**
 * API de CÓDIGOS PROMOCIONALES del canal directo.
 *
 * GET  /api/hospitality/promos   — lista del tenant (incluye inactivos: el hotel
 *        los reactiva, no los re-crea).
 * POST /api/hospitality/promos   — crear o editar { id? }.
 *
 * El descuento se aplica SOLO al alojamiento y lo calcula el servidor al
 * reservar (`lib/hospitality/booking-promos`). Aquí solo se valida la
 * definición del código: formato, tipo, rango y fechas coherentes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';
import { logAuditAction } from '@/lib/permissions';
import { codigoValido, normalizarCodigo } from '@/lib/hospitality/booking-promos';

/** Fecha de un input `YYYY-MM-DD`; vacío = sin límite. */
function fechaOpcional(valor: unknown): Date | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const fecha = new Date(`${valor.trim()}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const promos = await prisma.hospitalityPromoCode.findMany({
      where: { tenantId: auth.tenant!.id },
      orderBy: [{ activo: 'desc' }, { fechaCreacion: 'desc' }],
    });

    return NextResponse.json({ promos });
  } catch (error) {
    console.error('[Hospitality Promos] Error listando códigos:', error);
    return NextResponse.json({ error: 'Error al listar los códigos promocionales' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => null);
    const codigo = normalizarCodigo(body?.codigo);
    const tipo = body?.tipo === 'importe' ? 'importe' : 'porcentaje';
    const valor = Number(body?.valor);
    const desde = fechaOpcional(body?.desde);
    const hasta = fechaOpcional(body?.hasta);
    const minNoches = Math.max(1, Math.round(Number(body?.minNoches) || 1));
    const maxUsosBruto = body?.maxUsos === null || body?.maxUsos === '' || body?.maxUsos === undefined
      ? null
      : Math.round(Number(body.maxUsos));
    const maxUsos = maxUsosBruto != null && Number.isFinite(maxUsosBruto) && maxUsosBruto > 0 ? maxUsosBruto : null;
    const activo = body?.activo !== false;
    const descripcion =
      typeof body?.descripcion === 'string' ? body.descripcion.trim().slice(0, 300) || null : null;
    const moneda =
      typeof body?.moneda === 'string' && body.moneda.trim()
        ? monedaEscritura(body.moneda.trim().slice(0, 8), auth.tenant!.moneda)
        : monedaEscritura('', auth.tenant!.moneda);
    const id = typeof body?.id === 'string' && body.id ? body.id : null;

    if (!codigoValido(codigo)) {
      return NextResponse.json(
        { error: 'El código debe tener entre 3 y 40 caracteres: letras, números, guion o guion bajo.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: 'El valor del descuento debe ser mayor que 0' }, { status: 400 });
    }
    if (tipo === 'porcentaje' && valor > 100) {
      return NextResponse.json({ error: 'Un porcentaje de descuento no puede pasar de 100' }, { status: 400 });
    }
    if (desde && hasta && desde.getTime() > hasta.getTime()) {
      return NextResponse.json({ error: 'La fecha final no puede ser anterior a la inicial' }, { status: 400 });
    }

    const data = {
      tenantId,
      codigo,
      tipo,
      valor,
      moneda,
      desde,
      hasta,
      minNoches,
      maxUsos,
      activo,
      descripcion,
    };

    let promo;
    if (id) {
      const existente = await prisma.hospitalityPromoCode.findFirst({
        where: { id, tenantId },
        select: { id: true, usos: true },
      });
      if (!existente) return NextResponse.json({ error: 'Código no encontrado' }, { status: 404 });
      if (maxUsos != null && maxUsos < existente.usos) {
        return NextResponse.json(
          { error: `El código ya se ha usado ${existente.usos} veces: el límite no puede ser menor.` },
          { status: 400 }
        );
      }
      promo = await prisma.hospitalityPromoCode.update({ where: { id }, data });
    } else {
      promo = await prisma.hospitalityPromoCode.create({ data });
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_promo_guardar',
      'tenant',
      tenantId,
      `${id ? 'Actualizado' : 'Creado'} código promocional «${codigo}» (${tipo === 'porcentaje' ? `${valor}%` : `${valor} ${moneda}`}, ${
        activo ? 'activo' : 'inactivo'
      })`,
      null,
      { promoId: promo.id, codigo, tipo, valor, activo }
    ).catch(() => {});

    return NextResponse.json({ ok: true, promo });
  } catch (error: unknown) {
    // El código es único por tenant: dos hoteles pueden usar el mismo texto, el
    // mismo hotel no puede tener dos con idéntico código.
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ese código ya existe en tu cuenta' }, { status: 409 });
    }
    console.error('[Hospitality Promos] Error guardando código:', error);
    return NextResponse.json({ error: 'Error al guardar el código promocional' }, { status: 500 });
  }
}
