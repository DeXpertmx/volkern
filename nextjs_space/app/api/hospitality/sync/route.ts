export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';

/**
 * POST /api/hospitality/sync — sincronización manual de inventario y tarifas
 * hacia la capa de conectividad (plan maestro §15, §31 paso 7/8).
 *
 * Body opcional: { propertyId?: string, diasHorizonte?: number }
 * Si no llega propertyId, empuja todas las propiedades del tenant.
 * Los resultados quedan auditados en HospitalitySyncLog (tipo inventory,
 * rates, inventory_restrictions o rates_restrictions).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));

    let propertyId: string | null = null;
    if (typeof body?.propertyId === 'string' && body.propertyId.trim()) {
      // La propiedad debe pertenecer al tenant (aislamiento).
      const prop = await prisma.hospitalityProperty.findFirst({
        where: { id: body.propertyId.trim(), tenantId },
        select: { id: true },
      });
      if (!prop) {
        return NextResponse.json({ error: 'La propiedad no existe en este tenant' }, { status: 404 });
      }
      propertyId = prop.id;
    }

    const diasHorizonte = Math.min(
      Math.max(parseInt(body?.diasHorizonte) || 90, 1),
      365
    );

    const result = await dispatchConnectivityPush(tenantId, propertyId, 'manual', { diasHorizonte });

    return NextResponse.json({
      ok: result.ok,
      pushCount: result.pushCount,
      errores: result.errores,
      inventory: result.inventory,
      rates: result.rates,
      inventoryRestrictions: result.inventoryRestrictions,
      rateRestrictions: result.rateRestrictions,
    });
  } catch (error) {
    console.error('Error en sincronización manual:', error);
    return NextResponse.json({ error: 'Error al sincronizar' }, { status: 500 });
  }
}