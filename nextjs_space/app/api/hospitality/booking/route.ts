export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import {
  codigoEmbedBooking,
  guardarConfigBooking,
  leerConfigBooking,
  monedaPublicada,
  urlEmbedBooking,
  urlPublicaBooking,
} from '@/lib/hospitality/booking-config';
import { estadoDeCobroDelTenant } from '@/lib/hospitality/booking-payments';
import { getEnlaceAppUrl } from '@/lib/hospitality/compliance-link';

/**
 * Configuración del Booking Engine del tenant.
 *
 * GET devuelve la configuración, el estado real de la cuenta de cobro (para poder
 * avisar en la pantalla de que el cobro online no está disponible en vez de
 * dejarlo como una casilla sin efecto), los enlaces publicados y las propiedades
 * del tenant con su número de unidades.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const [config, cobro, propiedades, unidades] = await Promise.all([
      leerConfigBooking(tenantId),
      estadoDeCobroDelTenant(tenantId),
      prisma.hospitalityProperty.findMany({
        where: { tenantId },
        select: { id: true, nombre: true, ciudad: true, estado: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.hospitalityUnit.groupBy({ by: ['propertyId'], where: { tenantId }, _count: { _all: true } }),
    ]);

    const unidadesPorPropiedad = new Map(unidades.map((u) => [u.propertyId, u._count._all]));
    const appUrl = getEnlaceAppUrl();
    const moneda = monedaPublicada(config || {}, auth.tenant!.moneda);

    return NextResponse.json({
      config,
      moneda,
      monedaTenant: auth.tenant!.moneda ?? null,
      cobro,
      enlaces: config
        ? {
            publica: urlPublicaBooking(appUrl, config.slug),
            embed: urlEmbedBooking(appUrl, config.slug),
            codigo: codigoEmbedBooking(appUrl, config.slug, config.titulo),
          }
        : null,
      propiedades: propiedades.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        ciudad: p.ciudad,
        estado: p.estado,
        unidades: unidadesPorPropiedad.get(p.id) || 0,
        publicada: (config?.propiedadesPublicadas || []).includes(p.id),
      })),
    });
  } catch (error) {
    console.error('[BookingEngine] Error leyendo la configuración:', error);
    return NextResponse.json({ error: 'Error al leer la configuración' }, { status: 500 });
  }
}

/**
 * PUT guarda la configuración.
 *
 * Body: { slug, titulo?, descripcion?, emailContacto?, telefonoContacto?, moneda?,
 *         politicaCancelacion?, anticipoPorcentaje?, tarifaLimpieza?,
 *         requierePagoOnline?, propiedadesPublicadas?, activo? }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;
    const tenantId = auth.tenant!.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
    }

    // El dominio guardado hace falta para saber si cambió (y reverificar DNS).
    const configActual = await leerConfigBooking(tenantId);

    const resultado = await guardarConfigBooking(tenantId, auth.tenant!.moneda, {
      slug: String((body as Record<string, unknown>).slug || ''),
      titulo: (body as Record<string, unknown>).titulo as string | undefined,
      descripcion: (body as Record<string, unknown>).descripcion as string | undefined,
      emailContacto: (body as Record<string, unknown>).emailContacto as string | undefined,
      telefonoContacto: (body as Record<string, unknown>).telefonoContacto as string | undefined,
      moneda: (body as Record<string, unknown>).moneda as string | undefined,
      politicaCancelacion: (body as Record<string, unknown>).politicaCancelacion as string | undefined,
      anticipoPorcentaje: (body as Record<string, unknown>).anticipoPorcentaje,
      tarifaLimpieza: (body as Record<string, unknown>).tarifaLimpieza,
      requierePagoOnline: (body as Record<string, unknown>).requierePagoOnline === true,
      propiedadesPublicadas: Array.isArray((body as Record<string, unknown>).propiedadesPublicadas)
        ? ((body as Record<string, unknown>).propiedadesPublicadas as string[]).filter(
            (id) => typeof id === 'string'
          )
        : [],
      activo: (body as Record<string, unknown>).activo !== false,
      plantilla: (body as Record<string, unknown>).plantilla,
      personalizacion: (body as Record<string, unknown>).personalizacion,
      dominio: (body as Record<string, unknown>).dominio,
      dominioActual: configActual?.dominio ?? null,
    });

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'actualizar',
      'hospitality_booking_config',
      resultado.config.id,
      `Configuración del Booking Engine actualizada (/${resultado.config.slug}, ${resultado.config.propiedadesPublicadas.length} propiedades publicadas)`
    ).catch(() => {});

    return NextResponse.json({ ok: true, config: resultado.config });
  } catch (error) {
    console.error('[BookingEngine] Error guardando la configuración:', error);
    return NextResponse.json({ error: 'Error al guardar la configuración' }, { status: 500 });
  }
}
