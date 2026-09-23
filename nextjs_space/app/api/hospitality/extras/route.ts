export const dynamic = 'force-dynamic';

/**
 * API del catálogo de EXTRAS comprables en el booking engine (desayuno, late
 * check-out, traslados…). La propiedad es la unidad de negocio: cada hotel
 * decide qué vende en su web y a qué precio.
 *
 * GET  /api/hospitality/extras?propertyId=…  — catálogo COMPLETO del panel
 *        (incluye inactivos: el hotel los reactiva, no los re-crea).
 * POST /api/hospitality/extras               — crear o editar { id? }.
 *
 * El precio lo valida esta ruta (número ≥ 0); la web pública lee el catálogo
 * activo vía el GET del booking y NUNCA recibe precios del cliente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';
import { logAuditAction } from '@/lib/permissions';

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
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') || '';
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId es requerido' }, { status: 400 });
    }

    const propiedad = await propiedadDelTenant(propertyId, auth.tenant!.id);
    if (!propiedad) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const extras = await prisma.hospitalityExtra.findMany({
      where: { propertyId, tenantId: auth.tenant!.id },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });

    return NextResponse.json({ extras });
  } catch (error) {
    console.error('[Hospitality Extras] Error listando extras:', error);
    return NextResponse.json({ error: 'Error al listar los extras' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => null);
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId : '';
    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
    const precio = Number(body?.precio);
    // Divisa del extra: la indicada, si no la de reporte del tenant. El valor
    // del esquema queda solo como red de seguridad de la escritura.
    const moneda =
      typeof body?.moneda === 'string' && body.moneda.trim()
        ? body.moneda.trim().slice(0, 8)
        : '';
    const monedaDelExtra = monedaEscritura(moneda, auth.tenant!.moneda);
    const precioPorNoche = body?.precioPorNoche === true;
    const descripcionEs = typeof body?.descripcionEs === 'string' ? body.descripcionEs.trim().slice(0, 500) || null : null;
    const descripcionEn = typeof body?.descripcionEn === 'string' ? body.descripcionEn.trim().slice(0, 500) || null : null;
    const activo = body?.activo !== false;
    const orden = Number.isInteger(Number(body?.orden)) ? Math.max(0, Number(body?.orden)) : 0;
    const id = typeof body?.id === 'string' && body.id ? body.id : null;

    if (!propertyId || !nombre) {
      return NextResponse.json({ error: 'propertyId y nombre son requeridos' }, { status: 400 });
    }
    if (!Number.isFinite(precio) || precio < 0) {
      return NextResponse.json({ error: 'El precio debe ser un número ≥ 0' }, { status: 400 });
    }

    const propiedad = await propiedadDelTenant(propertyId, tenantId);
    if (!propiedad) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const data = {
      tenantId,
      propertyId,
      nombre,
      descripcionEs,
      descripcionEn,
      precio,
      moneda: monedaDelExtra,
      precioPorNoche,
      activo,
      orden,
    };

    // Edición de la pieza existente (para no duplicar catálogos al corregir
    // un precio): si llega id, debe existir y ser del tenant.
    let extra;
    if (id) {
      const existente = await prisma.hospitalityExtra.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existente) return NextResponse.json({ error: 'Extra no encontrado' }, { status: 404 });
      extra = await prisma.hospitalityExtra.update({ where: { id }, data });
    } else {
      extra = await prisma.hospitalityExtra.create({ data });
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'hospitality_extra_guardar',
      'property',
      propertyId,
      `${id ? 'Actualizado' : 'Creado'} extra «${nombre}» (${precio} ${monedaDelExtra}${precioPorNoche ? '/noche' : ''}, ${activo ? 'activo' : 'inactivo'})`,
      null,
      { extraId: extra.id, nombre, precio, moneda: monedaDelExtra, precioPorNoche, activo },
    ).catch(() => {});

    return NextResponse.json({ ok: true, extra });
  } catch (error) {
    console.error('[Hospitality Extras] Error guardando extra:', error);
    return NextResponse.json({ error: 'Error al guardar el extra' }, { status: 500 });
  }
}
