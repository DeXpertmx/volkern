export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/onboarding/mapping — paso 6 de §31.
 *
 * Relaciona cada unidad de Volkern con su habitación y plan de tarifa del
 * proveedor. Los códigos se validan contra el catálogo real (paso 5): si un
 * `roomCode` o `rateplanCode` no existe en el proveedor, no se vincula. Nada se
 * inventa (§0.1).
 *
 * Al revincular una unidad, el vínculo anterior queda inactivo para que una
 * unidad nunca empuje a dos habitaciones a la vez.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { testConnectivityConnection } from '@/lib/hospitality/connectivity';

const PROVIDER = 'channel_connectivity';

/**
 * Marca de un vínculo confirmado por una persona en el wizard. Sustituye al
 * `metadata` que dejó la vinculación automática, de modo que `vinculoAutomatico`
 * (y el recordatorio periódico) dejen de considerarlo pendiente.
 */
function metadataConfirmado(userId: string | null) {
  return {
    origen: 'manual',
    confirmadoEn: new Date().toISOString(),
    confirmadoPor: userId,
  };
}

interface Asignacion {
  unitId?: unknown;
  roomCode?: unknown;
  rateplanCode?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId.trim() : '';
    const hotelCode = typeof body?.hotelCode === 'string' ? body.hotelCode.trim() : '';
    const asignacionesRaw: Asignacion[] = Array.isArray(body?.asignaciones) ? body.asignaciones : [];

    if (!propertyId || !hotelCode) {
      return NextResponse.json(
        { ok: false, error: 'Indica la propiedad y el código de propiedad externo.' },
        { status: 200 }
      );
    }
    if (asignacionesRaw.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Asigna al menos una unidad.' },
        { status: 200 }
      );
    }

    const propiedad = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true, nombre: true },
    });
    if (!propiedad) {
      return NextResponse.json({ ok: false, error: 'Propiedad no encontrada' }, { status: 200 });
    }

    // Normaliza y valida la forma de las asignaciones.
    const asignaciones: Array<{ unitId: string; roomCode: string; rateplanCode: string | null }> = [];
    for (const a of asignacionesRaw) {
      const unitId = typeof a.unitId === 'string' ? a.unitId.trim() : '';
      const roomCode = typeof a.roomCode === 'string' ? a.roomCode.trim() : '';
      const rateplanCode = typeof a.rateplanCode === 'string' && a.rateplanCode.trim()
        ? a.rateplanCode.trim()
        : null;
      if (!unitId || !roomCode) {
        return NextResponse.json(
          { ok: false, error: 'Cada asignación necesita unidad y habitación.' },
          { status: 200 }
        );
      }
      asignaciones.push({ unitId, roomCode, rateplanCode });
    }

    // Dos unidades no pueden apuntar a la misma habitación (restricción única).
    const roomCodes = asignaciones.map((a) => a.roomCode);
    if (new Set(roomCodes).size !== roomCodes.length) {
      return NextResponse.json(
        { ok: false, error: 'Hay habitaciones repetidas: cada unidad debe usar una distinta.' },
        { status: 200 }
      );
    }

    // Las unidades deben pertenecer a esta propiedad y tenant.
    const unidades = await prisma.hospitalityUnit.findMany({
      where: { tenantId, propertyId, id: { in: asignaciones.map((a) => a.unitId) } },
      select: { id: true, nombre: true },
    });
    if (unidades.length !== asignaciones.length) {
      return NextResponse.json(
        { ok: false, error: 'Alguna unidad no pertenece a esta propiedad.' },
        { status: 200 }
      );
    }

    // El hotel no puede ser de otra cuenta.
    const ajeno = await prisma.connectivityMapping.findFirst({
      where: { externalPropertyId: hotelCode, estado: 'activo', tenantId: { not: tenantId } },
      select: { tenantId: true },
    });
    if (ajeno) {
      return NextResponse.json(
        { ok: false, error: 'Ese código de propiedad ya está vinculado a otra cuenta.' },
        { status: 200 }
      );
    }

    // Validación contra el catálogo real del proveedor.
    const catalogo = await testConnectivityConnection(hotelCode);
    if (!catalogo.ok || !catalogo.property) {
      return NextResponse.json(
        {
          ok: false,
          error:
            catalogo.error ||
            'No se pudo validar el catálogo del proveedor. Reintenta antes de vincular.',
          respuestaExterna: catalogo.respuestaExterna ?? null,
        },
        { status: 200 }
      );
    }

    const rooms = new Map(
      (catalogo.property.rooms || []).map((r) => [
        r.room_id,
        new Set((r.rateplans || []).map((rp) => rp.rateplan_id)),
      ])
    );

    for (const a of asignaciones) {
      const rateplans = rooms.get(a.roomCode);
      if (!rateplans) {
        return NextResponse.json(
          { ok: false, error: `La habitación "${a.roomCode}" no existe en el proveedor.` },
          { status: 200 }
        );
      }
      if (a.rateplanCode && !rateplans.has(a.rateplanCode)) {
        return NextResponse.json(
          {
            ok: false,
            error: `El plan de tarifa "${a.rateplanCode}" no pertenece a la habitación "${a.roomCode}".`,
          },
          { status: 200 }
        );
      }
    }

    // Aplica los vínculos.
    const vinculados: Array<{ unitId: string; roomCode: string; rateplanCode: string | null }> = [];
    for (const a of asignaciones) {
      const previos = await prisma.connectivityMapping.findMany({
        where: { tenantId, unitId: a.unitId, provider: PROVIDER, estado: 'activo' },
        select: { id: true, externalPropertyId: true, externalUnitCode: true },
      });

      // Lo que ya apuntaba al mismo destino se conserva (idempotente).
      const yaCorrecto = previos.find(
        (p) => p.externalPropertyId === hotelCode && p.externalUnitCode === a.roomCode
      );

      for (const p of previos) {
        if (p.id === yaCorrecto?.id) continue;
        await prisma.connectivityMapping.update({
          where: { id: p.id },
          data: { estado: 'inactivo' },
        });
      }

      await prisma.connectivityMapping.upsert({
        where: {
          provider_externalPropertyId_externalUnitCode: {
            provider: PROVIDER,
            externalPropertyId: hotelCode,
            externalUnitCode: a.roomCode,
          },
        },
        create: {
          tenantId,
          propertyId,
          unitId: a.unitId,
          provider: PROVIDER,
          externalPropertyId: hotelCode,
          externalUnitCode: a.roomCode,
          externalRatePlanCode: a.rateplanCode,
          estado: 'activo',
          metadata: metadataConfirmado(auth.user?.id ?? null),
        },
        update: {
          tenantId,
          propertyId,
          unitId: a.unitId,
          externalRatePlanCode: a.rateplanCode,
          estado: 'activo',
          // Guardar los vínculos ES la revisión: el vínculo pasa a ser manual
          // (una persona lo confirmó) y deja de contar como pendiente de revisar.
          metadata: metadataConfirmado(auth.user?.id ?? null),
        },
      });

      vinculados.push(a);
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'actualizar',
      'hospitality_connectivity_mapping',
      propertyId,
      `Mapping externo de "${propiedad.nombre}": ${vinculados.length} unidad(es) vinculadas a ${hotelCode}`
    ).catch(() => {});

    return NextResponse.json({ ok: true, hotelCode, vinculadas: vinculados }, { status: 200 });
  } catch (error) {
    console.error('Error guardando el mapping externo:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al guardar el mapping externo' },
      { status: 200 }
    );
  }
}
