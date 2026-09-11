export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conectividad/propiedades
 *
 * Observabilidad de la integración POR PROPIEDAD (plan maestro §29).
 *
 * Devuelve, para cada propiedad de Hospitality:
 *   • estado del mapping de conectividad y su código externo (hotelCode);
 *   • último webhook recibido (acción, canal, estado);
 *   • último push de inventario/tarifas y último fetch de reconciliación;
 *   • último error con su causa y contadores de errores.
 *
 * Es mucho más útil que un "Connected" global: permite ver qué propiedad
 * concreta está fallando y desde cuándo no se sincroniza.
 *
 * Nunca expone payloads de petición (pueden contener datos de negocio).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

async function requireSuperadmin() {
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

interface EventoResumen {
  fecha: Date;
  tipo: string;
  estado: string;
  detalle?: string | null;
}

export async function GET(_req: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const properties = await prisma.hospitalityProperty.findMany({
      select: {
        id: true,
        nombre: true,
        tenantId: true,
        tenant: { select: { nombre: true } },
        mappings: {
          where: { provider: 'channel_connectivity' },
          select: { externalPropertyId: true, estado: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const propertyIds = properties.map((p) => p.id);

    const [
      erroresSyncPorPropiedad,
      ultimosSync,
      webhookTotales,
      webhookErrores,
      ultimosWebhooks,
    ] = await Promise.all([
      // Contadores de error de push por propiedad (histórico).
      prisma.hospitalitySyncLog.groupBy({
        by: ['propertyId'],
        where: { propertyId: { in: propertyIds }, estado: 'error' },
        _count: { _all: true },
      }),
      // Últimos eventos de sincronización para derivar último push / fetch / error.
      prisma.hospitalitySyncLog.findMany({
        where: { propertyId: { in: propertyIds } },
        orderBy: { fechaCreacion: 'desc' },
        take: 400,
        select: {
          propertyId: true,
          tipo: true,
          estado: true,
          httpStatus: true,
          errorMensaje: true,
          fechaCreacion: true,
        },
      }),
      // Webhooks recibidos por código de propiedad.
      prisma.hospitalityWebhookEvent.groupBy({
        by: ['hotelCode'],
        _count: { _all: true },
      }),
      // Webhooks fallidos / sin mapping por código de propiedad (histórico).
      prisma.hospitalityWebhookEvent.groupBy({
        by: ['hotelCode'],
        where: { estado: { in: ['error', 'sin_mapping'] } },
        _count: { _all: true },
      }),
      // Últimos webhooks para conocer acción/canal/estado del más reciente.
      prisma.hospitalityWebhookEvent.findMany({
        orderBy: { fechaCreacion: 'desc' },
        take: 400,
        select: {
          hotelCode: true,
          action: true,
          channel: true,
          estado: true,
          errorMensaje: true,
          fechaCreacion: true,
        },
      }),
    ]);

    // Reducción en memoria: primer registro por clave = el más reciente.
    const ultimoPushPorPropiedad = new Map<string, EventoResumen>();
    const ultimoFetchPorPropiedad = new Map<string, EventoResumen>();
    const ultimoErrorSyncPorPropiedad = new Map<string, EventoResumen>();
    for (const log of ultimosSync) {
      const pid = log.propertyId;
      if (!pid) continue;
      const base: EventoResumen = {
        fecha: log.fechaCreacion,
        tipo: log.tipo,
        estado: log.estado,
        detalle: log.errorMensaje ?? (log.httpStatus ? `HTTP ${log.httpStatus}` : null),
      };
      if (log.tipo === 'reconciliacion') {
        if (!ultimoFetchPorPropiedad.has(pid)) ultimoFetchPorPropiedad.set(pid, base);
      } else if (log.tipo === 'reservacion_prueba') {
        // Prueba del onboarding (§31): no es un push a canales, no debe
        // aparecer como "último push" en la observabilidad.
        continue;
      } else if (!ultimoPushPorPropiedad.has(pid)) {
        ultimoPushPorPropiedad.set(pid, base);
      }
      if (log.estado === 'error' && !ultimoErrorSyncPorPropiedad.has(pid)) {
        ultimoErrorSyncPorPropiedad.set(pid, base);
      }
    }

    const totalWebhooksPorHotel = new Map<string, number>(
      webhookTotales.map((w) => [w.hotelCode ?? '', w._count._all]),
    );
    const erroresWebhookPorHotel = new Map<string, number>(
      webhookErrores.map((w) => [w.hotelCode ?? '', w._count._all]),
    );
    const ultimoWebhookPorHotel = new Map<
      string,
      { fecha: Date; action: string; channel: string | null; estado: string; error?: string | null }
    >();
    for (const ev of ultimosWebhooks) {
      const code = ev.hotelCode ?? '';
      if (code && !ultimoWebhookPorHotel.has(code)) {
        ultimoWebhookPorHotel.set(code, {
          fecha: ev.fechaCreacion,
          action: ev.action,
          channel: ev.channel,
          estado: ev.estado,
          error: ev.errorMensaje,
        });
      }
    }

    const erroresSyncMap = new Map<string, number>(
      erroresSyncPorPropiedad.map((e) => [e.propertyId ?? '', e._count._all]),
    );

    const rows = properties.map((p) => {
      const hotelCode = p.mappings[0]?.externalPropertyId ?? null;
      const webhook = hotelCode ? ultimoWebhookPorHotel.get(hotelCode) ?? null : null;
      const errorSync = ultimoErrorSyncPorPropiedad.get(p.id) ?? null;
      return {
        propertyId: p.id,
        property: p.nombre,
        tenant: p.tenant?.nombre ?? p.tenantId,
        hotelCode,
        mappingEstado: p.mappings[0]?.estado ?? 'sin_mapping',
        ultimoWebhook: webhook
          ? {
              fecha: webhook.fecha,
              action: webhook.action,
              channel: webhook.channel,
              estado: webhook.estado,
              error: webhook.error ?? null,
            }
          : null,
        ultimoPush: ultimoPushPorPropiedad.get(p.id) ?? null,
        ultimoFetch: ultimoFetchPorPropiedad.get(p.id) ?? null,
        ultimoError: errorSync,
        contadorErrores: erroresSyncMap.get(p.id) ?? 0,
        webhooksTotales: hotelCode ? totalWebhooksPorHotel.get(hotelCode) ?? 0 : 0,
        webhooksFallidos: hotelCode ? erroresWebhookPorHotel.get(hotelCode) ?? 0 : 0,
      };
    });

    return NextResponse.json({ propiedades: rows, generadoEn: new Date().toISOString() });
  } catch (error) {
    console.error('Error obteniendo estado por propiedad:', error);
    return NextResponse.json({ error: 'Error al obtener estado por propiedad' }, { status: 500 });
  }
}
