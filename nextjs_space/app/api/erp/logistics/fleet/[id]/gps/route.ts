import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { FleetService } from '@/lib/erp/fleet-service'

// ─── PATCH /api/erp/logistics/fleet/[id]/gps ───────────────────────────
// Regenera el deviceKey GPS de un vehículo.
// Útil cuando el dispositivo IoT se pierde, se reemplaza o se compromete la seguridad.
// ─────────────────────────────────────────────────────────────────────────

export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params as { id: string }
    
    const result = await FleetService.regenerateGpsDeviceKey(id, auth.tenant!.id)

    return NextResponse.json({
      success: true,
      gpsDeviceId: result.gpsDeviceId,
      plate: result.plate,
      message: `DeviceKey GPS regenerado para ${result.plate}`,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error al regenerar deviceKey GPS' },
      { status: error.message?.includes('no encontrado') ? 404 : 400 }
    )
  }
}, ['erp:write'])
