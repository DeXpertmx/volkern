export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/incidencias?propertyId=...
 *
 * Incidencias de conectividad del tenant: reservas que el proveedor envió y NO
 * se pudieron registrar porque su `roomCode` no estaba vinculado a ninguna
 * unidad (guardia de resolución del webhook, ver
 * docs/hospitality-connectivity-contract.md).
 *
 * `incidencias` incluye los grupos que ya tienen vínculo pero cuyas reservas
 * siguen sin registrarse: son justo los que el operador puede reenviar con
 * POST /api/hospitality/incidencias/reintentar. Los grupos cuyas reservas ya
 * están registradas solo se cuentan en `resueltas`.
 *
 * La lógica vive en `lib/hospitality/incidencias.ts` porque la comparten el
 * reenvío y la vinculación automática.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { listarIncidencias, listarNoShowsCanal } from '@/lib/hospitality/incidencias';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'mantenimiento.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId')?.trim() || null;

    // Filtro del panel: los eventos que el canal reportó como no-show van
    // aparte (el importe emitido de cada penalización es lo que el operador
    // viene a ver), y el resto son las incidencias de siempre.
    if (searchParams.get('tipo') === 'no_show') {
      const nos = await listarNoShowsCanal(auth.tenant!.id, propertyId);
      if (!nos.ok) return NextResponse.json({ error: nos.error }, { status: nos.status });
      return NextResponse.json({
        noShows: nos.noShows,
        resumen: nos.resumen,
        generadoEn: new Date().toISOString(),
      });
    }

    const resultado = await listarIncidencias(auth.tenant!.id, propertyId);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({
      incidencias: resultado.incidencias,
      resumen: resultado.resumen,
      generadoEn: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error obteniendo incidencias de conectividad:', error);
    return NextResponse.json({ error: 'Error al obtener las incidencias' }, { status: 500 });
  }
}
