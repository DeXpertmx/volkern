export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/hospitality/puesta-en-marcha
 *
 * Los clientes de Hospitality con su puesta en marcha a medias, de un vistazo y
 * cross-tenant: qué roles del catálogo les faltan, cuántas propiedades y
 * unidades tienen, y por dónde sigue cada uno. Es la vista de triaje del
 * operador; el detalle de un cliente concreto sigue en
 * `GET /api/admin/hospitality/alta?tenantId=...`.
 *
 * Entra quien tiene Hospitality de verdad (override de la vertical, una
 * propiedad o los roles del catálogo) — NO por entitlement del plan, porque casi
 * todos los planes incluyen la vertical y la tabla acabaría listando a todo el
 * mundo. Los que tienen datos con el módulo apagado salen marcados: eso es una
 * avería, no un onboarding pendiente.
 *
 * Sólo Superadmin. Sólo lee (cuatro consultas fijas, no una por cliente).
 *
 * Respuestas:
 *   200 { ok: true, generadoEn, totales: { tenants, pendientes, listos, apagados },
 *         truncado, tenants: [{ tenantId, tenant, plan, desde, moduloApagado,
 *         roles: { catalogo, alDia, pendientes }, propiedades: { total, unidades,
 *         primera }, enlaceWizard, faltantes, listo }] }
 *   401 No autorizado   → sin sesión.
 *   403 Acceso denegado → sesión sin rol Superadmin.
 *
 * Params opcionales:
 *   ?tope=N  → máximo de clientes a devolver (por defecto 200). Si hay más,
 *              `truncado` lo dice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { listarPuestasEnMarchaHospitality } from '@/lib/provisioning/hospitality-alta';

// Unión explícita (sin propiedades opcionales): con `error?: undefined` la
// comprobación `'error' in auth` no estrecha el tipo y `return auth.error`
// queda como posiblemente indefinido.
async function requireSuperadmin(): Promise<
  { error: NextResponse } | { user: { id: string } }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user || user.role?.nombre !== 'Superadmin') {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const crudo = new URL(request.url).searchParams.get('tope');
    // `tope` es opcional: sin él manda el del módulo, y un valor que no sea
    // número cae en el mismo default en lugar de devolver todo.
    const tope = crudo === null ? undefined : Number(crudo);

    const resultado = await listarPuestasEnMarchaHospitality({ tope });
    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({ ok: true, ...resultado.listado });
  } catch (error) {
    console.error('[Hospitality] Error listando las puestas en marcha:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al listar las puestas en marcha' },
      { status: 500 }
    );
  }
}
