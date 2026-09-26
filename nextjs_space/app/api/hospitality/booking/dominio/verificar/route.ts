import { NextRequest, NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { hostVerificacionDominio, tokenVerificacionDominio } from '@/lib/hospitality/booking-plantillas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/booking/dominio/verificar
 *
 * Comprueba que el hotel controla el dominio que quiere usar: busca el registro
 * TXT `_volkern-booking.<dominio>` con el valor `volkern-booking=<slug>`. Si está,
 * marca `dominioVerificado = true`; si no, responde el motivo legible (sin DNS,
 * sin dominio configurado) para que el panel lo pinte.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const config = await prisma.hospitalityBookingConfig.findUnique({ where: { tenantId } });
    if (!config?.dominio) {
      return NextResponse.json({ error: 'Primero guarda el dominio que quieres usar.' }, { status: 400 });
    }

    const host = hostVerificacionDominio(config.dominio);
    const esperado = tokenVerificacionDominio(config.slug);

    let registros: string[][];
    try {
      registros = await dns.resolveTxt(host);
    } catch {
      return NextResponse.json({ verificado: false, motivo: 'sin_dns' });
    }

    // resolveTxt devuelve arrays de cadenas por registro: juntarlas (un TXT puede
    // venir troceado) y comparar en minúsculas.
    const valores = registros.map((r) => r.join('').toLowerCase());
    if (!valores.includes(esperado.toLowerCase())) {
      return NextResponse.json({ verificado: false, motivo: 'sin_dns' });
    }

    await prisma.hospitalityBookingConfig.update({
      where: { tenantId },
      data: { dominioVerificado: true },
    });

    return NextResponse.json({ verificado: true });
  } catch (error) {
    console.error('[BookingEngine] Error verificando el dominio:', error);
    return NextResponse.json({ error: 'Error al verificar el dominio' }, { status: 500 });
  }
}
