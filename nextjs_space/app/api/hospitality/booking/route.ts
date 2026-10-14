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
 * GET devuelve la configuración —incluidos plantilla, personalización y
 * dominio propio—, el estado real de la cuenta de cobro (para poder
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
 *         requierePagoOnline?, propiedadesPublicadas?, activo?, plantilla?,
 *         personalizacion?, dominio? }
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

    // Solo lo que el cliente MANDA viaja a la configuración: lo ausente se queda
    // como está. El panel guarda el aspecto (plantilla, colores, dominio) sin
    // mandar el resto, y tratar lo ausente como un valor por defecto borraba el
    // título, las políticas y las propiedades publicadas en cada guardado.
    const cuerpo = body as Record<string, unknown>;
    const presente = (clave: string) => Object.prototype.hasOwnProperty.call(cuerpo, clave);
    const texto = (clave: string) =>
      presente(clave) ? (cuerpo[clave] as string | undefined | null) : undefined;

    const resultado = await guardarConfigBooking(tenantId, auth.tenant!.moneda, {
      slug: String(cuerpo.slug || ''),
      titulo: texto('titulo'),
      descripcion: texto('descripcion'),
      emailContacto: texto('emailContacto'),
      telefonoContacto: texto('telefonoContacto'),
      moneda: texto('moneda'),
      politicaCancelacion: texto('politicaCancelacion'),
      anticipoPorcentaje: presente('anticipoPorcentaje') ? cuerpo.anticipoPorcentaje : undefined,
      tarifaLimpieza: presente('tarifaLimpieza') ? cuerpo.tarifaLimpieza : undefined,
      requierePagoOnline: presente('requierePagoOnline')
        ? cuerpo.requierePagoOnline === true
        : undefined,
      // Lista de publicadas: ausente = no tocar; presente pero sin forma de lista
      // = no tocar tampoco (mandar basura no puede despublicar la página).
      propiedadesPublicadas: Array.isArray(cuerpo.propiedadesPublicadas)
        ? (cuerpo.propiedadesPublicadas as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : undefined,
      activo: presente('activo') ? cuerpo.activo !== false : undefined,
      plantilla: cuerpo.plantilla,
      personalizacion: cuerpo.personalizacion,
      dominio: cuerpo.dominio,
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
