import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { FleetService } from '@/lib/erp/fleet-service';

export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const vehicle = await FleetService.getVehicle(params.id, auth.tenantId);
    if (!vehicle) {
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ vehicle });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const body = await request.json();

    // Si es registro de kilometraje, usar método específico
    if (body.currentKm !== undefined) {
      const updated = await FleetService.recordKm(params.id, auth.tenantId, body.currentKm);
      return NextResponse.json({ vehicle: updated });
    }

    const vehicle = await FleetService.updateVehicle(params.id, auth.tenantId, body);
    return NextResponse.json({ vehicle });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
