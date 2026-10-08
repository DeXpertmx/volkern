export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/hospitality/alta
 *
 * Prepara un cliente de Hospitality recién creado: roles del catálogo y primera
 * propiedad vacía. Es el último paso del alta guiada del panel de plataforma —
 * el wizard de partner crea el tenant con su plan y su vertical, y esto lo deja
 * utilizable para el cliente.
 *
 * Sólo Superadmin: da de alta estructura en una cuenta ajena.
 *
 * Body:
 *   {
 *     tenantId: string,                  // requerido — el cliente recién creado
 *     propiedad: {
 *       nombre: string,                  // requerido
 *       ciudad?, pais?, zona?,           // opcionales
 *       timezone?                        // IANA; si falta, el default del esquema
 *     }
 *   }
 *
 * Respuestas:
 *   200 { ok: true, tenant, roles: { creados, completados, catalogo },
 *         propiedad: { id, nombre, estado, creada } }
 *   400 VALIDACIÓN      → falta tenantId, falta el nombre o la zona no es IANA.
 *   401 No autorizado   → sin sesión.
 *   403 Acceso denegado → sesión sin rol Superadmin.
 *   404 NOT_FOUND       → el cliente no existe.
 *
 * Idempotente: repetir la llamada no duplica roles ni propiedades.
 *
 * GET /api/admin/hospitality/alta?tenantId=...
 *
 * Estado de la puesta en marcha de un cliente que YA existe: qué roles del
 * catálogo faltan o están incompletos, qué propiedades tiene (y con cuántas
 * unidades), y por dónde continuar el onboarding. Existe porque el alta guiada
 * del wizard de partner solo cubre el tenant recién creado: cuando el cliente
 * lleva meses registrado, el operador necesita ver el hueco antes de pasarle la
 * puerta. Sólo lee.
 *
 * Respuestas GET:
 *   200 { ok: true, tenant, roles: { catalogo, alDia, detalle, completos },
 *         propiedades: [{ id, nombre, ciudad, pais, estado, unidades,
 *                         enlaceWizard }], enlaceWizard, listo }
 *   400 VALIDACIÓN      → falta tenantId.
 *   401 No autorizado / 403 Acceso denegado.
 *   404 NOT_FOUND       → el cliente no existe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  estadoPuestaEnMarchaHospitality,
  enlaceWizardHospitality,
  prepararTenantHospitality,
} from '@/lib/provisioning/hospitality-alta';

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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const resultado = await prepararTenantHospitality({
      tenantId: body?.tenantId,
      propiedad: body?.propiedad ?? {},
      actorUserId: auth.user.id,
    });

    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({
      ok: true,
      tenant: resultado.tenant,
      roles: resultado.roles,
      propiedad: resultado.propiedad,
      // El enlace que el operador le pasa al cliente para que termine por su
      // cuenta: unidades, tarifas, mapping y las pruebas de la capa.
      enlaceWizard: enlaceWizardHospitality(resultado.propiedad.id),
    });
  } catch (error) {
    console.error('[Hospitality] Error en el alta de cliente:', error);
    return NextResponse.json({ error: 'Error al preparar el cliente' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const tenantId = new URL(request.url).searchParams.get('tenantId');
    const resultado = await estadoPuestaEnMarchaHospitality(tenantId ?? '');

    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }

    return NextResponse.json({ ok: true, ...resultado.estado });
  } catch (error) {
    console.error('[Hospitality] Error consultando la puesta en marcha:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al consultar la puesta en marcha' },
      { status: 500 }
    );
  }
}
