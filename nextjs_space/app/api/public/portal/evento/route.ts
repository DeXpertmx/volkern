export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { getPlantillaPortal } from '@/lib/real-estate/portal-plantilla';
import { esEventoPortal } from '@/lib/real-estate/portal-eventos';

/**
 * POST /api/public/portal/evento
 *
 * Registra una visita o un clic del portal público. Deliberadamente solo guarda
 * `tenantId`, tipo, plantilla y propiedad: ningún dato del visitante, ni IP ni
 * identificador de sesión. Un evento fallido nunca debe afectar a la página, así
 * que el cliente lo envía sin esperar respuesta.
 *
 * La plantilla se resuelve aquí y no se acepta la del cliente: así el informe no
 * se puede sesgar desde el navegador.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const tipo = body?.tipo;
    if (!esEventoPortal(tipo)) {
      return NextResponse.json({ error: 'Evento no válido' }, { status: 400 });
    }

    // El beacon siempre manda el slug público; no se acepta id de tenant para
    // que el único modo de escribir sea el portal que se está viendo.
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    if (!slug) {
      return NextResponse.json({ error: 'Se requiere slug del tenant' }, { status: 400 });
    }

    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // El limitador necesita el tenant en la petición, igual que el formulario
    // público: sin esta cabecera responde 401 antes de contar el evento.
    const limite = await applyRateLimit(
      new NextRequest(req.url, { headers: { 'x-tenant-id': tenant.id } }),
      { action: 'api_request_hour', customLimit: 300 }
    );
    if (limite) return limite;

    // La propiedad debe ser de esta cuenta: un id ajeno no se registra.
    const propiedadId =
      typeof body?.propiedadId === 'string' && body.propiedadId
        ? (
            await globalPrisma.catalogoItem.findFirst({
              where: { id: body.propiedadId, tenantId: tenant.id, tipo: 'inmueble' },
              select: { id: true },
            })
          )?.id ?? null
        : null;

    const plantilla = await getPlantillaPortal(tenant.id);

    await globalPrisma.portalEvento.create({
      data: { tenantId: tenant.id, tipo, plantilla, propiedadId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // La analítica nunca rompe el portal: se responde 204 y se registra el fallo.
    console.error('[Portal Analytics] Error al registrar evento:', error);
    return new NextResponse(null, { status: 204 });
  }
}
