export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/onboarding/catalogo — paso 5 de §31.
 *
 * Obtiene el mapping externo de la propiedad: por el código de propiedad
 * (hotelCode) devuelve el catálogo REAL de habitaciones y planes de tarifa del
 * proveedor. Son los únicos códigos válidos para vincular unidades, así que
 * nada se inventa: lo que no devuelva el catálogo no se puede vincular.
 *
 * Devuelve siempre HTTP 200 con `ok` en el body: si devolviéramos 5xx el proxy
 * reemplazaría el cuerpo por "error code: 502" y se perdería la causa real.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { testConnectivityConnection } from '@/lib/hospitality/connectivity';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.ver');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId.trim() : '';
    const hotelCode = typeof body?.hotelCode === 'string' ? body.hotelCode.trim() : '';

    if (!propertyId || !hotelCode) {
      return NextResponse.json(
        { ok: false, error: 'Indica la propiedad y el código de propiedad del proveedor.' },
        { status: 200 }
      );
    }

    // La propiedad debe pertenecer al tenant (aislamiento).
    const propiedad = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true, nombre: true },
    });
    if (!propiedad) {
      return NextResponse.json({ ok: false, error: 'Propiedad no encontrada' }, { status: 200 });
    }

    // Un hotel ya reclamado por otra cuenta no puede reclamarse aquí: evita que
    // un tenant se apropie del código de propiedad de otro.
    const ajeno = await prisma.connectivityMapping.findFirst({
      where: {
        externalPropertyId: hotelCode,
        estado: 'activo',
        tenantId: { not: tenantId },
      },
      select: { tenantId: true },
    });
    if (ajeno) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Ese código de propiedad ya está vinculado a otra cuenta. Si el hotel es tuyo y estaba en otra cuenta (una demo, una cuenta anterior), hay que liberar antes ese vínculo; si no reconoces el código, confírmalo con el proveedor.',
        },
        { status: 200 }
      );
    }

    const result = await testConnectivityConnection(hotelCode, tenantId);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || 'No se pudo obtener el catálogo del proveedor.',
          hotelCode,
          respuestaExterna: result.respuestaExterna ?? null,
        },
        { status: 200 }
      );
    }

    const property = result.property;
    if (!property) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'El proveedor no devolvió el detalle de la propiedad. Verifica que el código sea correcto y que el acceso esté habilitado.',
          hotelCode,
        },
        { status: 200 }
      );
    }

    // Respuesta saneada: solo los campos necesarios para construir el mapping y
    // nunca datos de configuración de la plataforma.
    const rooms = (property.rooms || []).map((room) => ({
      roomCode: room.room_id,
      roomName: room.room_name ?? room.room_id,
      count: room.count ?? null,
      active: room.active ?? null,
      minOcc: room.min_occ ?? null,
      maxOcc: room.max_occ ?? null,
      rateplans: (room.rateplans || []).map((rp) => ({
        rateplanCode: rp.rateplan_id,
        rateplanName: rp.rateplan_name ?? rp.rateplan_id,
        occupancy: rp.occupancy ?? null,
        noOfMeals: rp.no_of_meals ?? null,
      })),
    }));

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'consultar',
      'hospitality_connectivity_mapping',
      propertyId,
      `Catálogo externo consultado para "${propiedad.nombre}" (${hotelCode}): ${rooms.length} tipo(s) de habitación`
    ).catch(() => {});

    return NextResponse.json(
      {
        ok: true,
        hotelCode,
        hotel: {
          nombre: property.hotel_name ?? null,
          moneda: property.currency ?? null,
          timezone: property.timezone ?? null,
        },
        rooms,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error obteniendo catálogo externo:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al obtener el catálogo del proveedor' },
      { status: 200 }
    );
  }
}
