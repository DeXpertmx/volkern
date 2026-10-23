export const dynamic = 'force-dynamic';

/**
 * API del catálogo de TARIFAS ADICIONALES por estancia (limpieza, gestión,
 * mascota, ropa de cama, resort, comunidad…).
 *
 * GET  /api/hospitality/fees?propertyId=…  — catálogo COMPLETO del panel
 *        (incluye inactivas: el hotel las reactiva, no las re-crea).
 * POST /api/hospitality/fees               — crear o editar { id? }.
 *
 * Las obligatorias se cobran en toda estancia de la propiedad; las opcionales
 * se ofrecen al huésped en el motor directo. El importe lo valida esta ruta
 * (número ≥ 0) y la web pública NUNCA recibe un importe del navegador: solo
 * nombra el id de la tarifa que marca (módulo puro `booking-fees`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';
import { logAuditAction } from '@/lib/permissions';

/** Tope de cordura del importe: un cargo por estancia no es un precio de compra. */
const IMPORTE_MAX = 1_000_000;

async function propiedadDelTenant(propertyId: string, tenantId: string) {
  return prisma.hospitalityProperty.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true },
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') || '';
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId es requerido' }, { status: 400 });
    }

    const propiedad = await propiedadDelTenant(propertyId, auth.tenant!.id);
    if (!propiedad) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const tarifas = await prisma.hospitalityFee.findMany({
      where: { propertyId, tenantId: auth.tenant!.id },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });

    return NextResponse.json({ tarifas });
  } catch (error) {
    console.error('[Hospitality Fees] Error listando tarifas:', error);
    return NextResponse.json({ error: 'Error al listar las tarifas adicionales' }, { status: 500 });
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
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId : '';
    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
    const importe = Number(body?.importe);
    const moneda =
      typeof body?.moneda === 'string' && body.moneda.trim()
        ? body.moneda.trim().slice(0, 8)
        : '';
    const monedaDeLaTarifa = monedaEscritura(moneda, auth.tenant!.moneda);
    const obligatoria = body?.obligatoria !== false;
    const descripcionEs =
      typeof body?.descripcionEs === 'string' ? body.descripcionEs.trim().slice(0, 500) || null : null;
    const descripcionEn =
      typeof body?.descripcionEn === 'string' ? body.descripcionEn.trim().slice(0, 500) || null : null;
    const activo = body?.activo !== false;
    const orden = Number.isInteger(Number(body?.orden)) ? Math.max(0, Number(body?.orden)) : 0;
    const id = typeof body?.id === 'string' && body.id ? body.id : null;

    if (!propertyId || !nombre) {
      return NextResponse.json({ error: 'propertyId y nombre son requeridos' }, { status: 400 });
    }
    if (!Number.isFinite(importe) || importe < 0 || importe > IMPORTE_MAX) {
      return NextResponse.json(
        { error: `El importe debe ser un número entre 0 y ${IMPORTE_MAX}` },
        { status: 400 }
      );
    }

    const propiedad = await propiedadDelTenant(propertyId, tenantId);
    if (!propiedad) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const data = {
      tenantId,
      propertyId,
      nombre,
      descripcionEs,
      descripcionEn,
      importe,
      moneda: monedaDeLaTarifa,
      obligatoria,
      activo,
      orden,
    };

    // Edición de la pieza existente: si llega id, tiene que ser del tenant.
    let tarifa;
    if (id) {
      const existente = await prisma.hospitalityFee.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existente) return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 });
      tarifa = await prisma.hospitalityFee.update({ where: { id }, data });
    } else {
      tarifa = await prisma.hospitalityFee.create({ data });
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_tarifa_guardar',
      'property',
      propertyId,
      `${id ? 'Actualizada' : 'Creada'} tarifa adicional «${nombre}» (${importe} ${monedaDeLaTarifa}, ${
        obligatoria ? 'obligatoria' : 'opcional'
      }, ${activo ? 'activa' : 'inactiva'})`,
      null,
      { tarifaId: tarifa.id, nombre, importe, moneda: monedaDeLaTarifa, obligatoria, activo }
    ).catch(() => {});

    return NextResponse.json({ ok: true, tarifa });
  } catch (error) {
    console.error('[Hospitality Fees] Error guardando tarifa:', error);
    return NextResponse.json({ error: 'Error al guardar la tarifa adicional' }, { status: 500 });
  }
}
