export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { esPoliticaNoShow } from '@/lib/hospitality/no-show';
import {
  esPoliticaSalidaAnticipada,
  politicaSalidaAnticipadaEfectiva,
} from '@/lib/hospitality/checkout';
import { notificarCambioSalidaAnticipada } from '@/lib/hospitality/checkout-avisos';
import { esHoldHorasValidas } from '@/lib/hospitality/holds';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

async function getProperty(tenantId: string, id: string) {
  return prisma.hospitalityProperty.findFirst({
    where: { id, tenantId },
    include: { units: { orderBy: { nombre: 'asc' } }, _count: { select: { reservations: true } } },
  });
}

// GET /api/hospitality/properties/[id] — detalle (con unidades)
export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(_req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const property = await getProperty(auth.tenant!.id, id);
    if (!property) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    return NextResponse.json({ property });
  } catch (error) {
    console.error('Error obteniendo propiedad:', error);
    return NextResponse.json({ error: 'Error al obtener propiedad' }, { status: 500 });
  }
}

// PATCH /api/hospitality/properties/[id] — actualizar
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const data = await req.json();
    const {
      nombre, descripcion, codigo, zona, direccion, ciudad, estadoProvincia,
      pais, cp, latitud, longitud, fotos, timezone, estado, politicaNoShow,
      politicaSalidaAnticipada, holdHoras, detalleAlojamiento,
      distancias, indicaciones, mapaPersonalizadoUrl,
    } = data || {};

    // La política de no-show decide cuánto se cobra: si llega, tiene que ser
    // válida (el módulo puro es el único que define las opciones).
    if (politicaNoShow !== undefined && !esPoliticaNoShow(politicaNoShow)) {
      return NextResponse.json(
        { error: 'Política de no-show inválida. Valores: ninguna, primera_noche, estancia_completa.' },
        { status: 400 }
      );
    }

    // Apagador de salida anticipada (A/B): si llega, tiene que ser válida (el
    // módulo puro checkout es el único que define las opciones).
    if (politicaSalidaAnticipada !== undefined && !esPoliticaSalidaAnticipada(politicaSalidaAnticipada)) {
      return NextResponse.json(
        { error: 'Política de salida anticipada inválida. Valores: cerrar_estancia, salida_real.' },
        { status: 400 }
      );
    }

    // Ventana de caducidad de holds: entero entre 0 (sin caducidad) y 720 h.
    if (holdHoras !== undefined && !esHoldHorasValidas(holdHoras)) {
      return NextResponse.json(
        { error: 'Horas de retención de holds inválidas. Entero entre 0 (sin caducidad) y 720.' },
        { status: 400 }
      );
    }

    // Las fotos admiten dos formas: URLs sueltas (dialog rápido, clientes
    // antiguos) y objetos { url, titulo?, portada? } (editor por secciones).
    // Cuando llegan URLs puras y en BD hay objetos ricos, se conservan los
    // metadatos (título/portada) casando por URL y por posición: sin esto,
    // un guardado del dialog rápido machacaría el trabajo del editor.
    let fotosFinales: Prisma.InputJsonValue[] | null = null;
    if (fotos !== undefined) {
      if (!Array.isArray(fotos)) {
        fotosFinales = null; // Prisma.DbNull, como siempre
      } else {
        const previas = Array.isArray(existing.fotos) ? (existing.fotos as unknown[]) : [];
        const ricaDe = (i: number): Prisma.InputJsonValue => {
          const entrada = fotos[i];
          const previa = previas[i];
          if (entrada && typeof entrada === 'object') return entrada as Prisma.InputJsonValue;
          if (typeof entrada !== 'string') return entrada as Prisma.InputJsonValue;
          const mismaUrl =
            previa && typeof previa === 'object' && (previa as { url?: unknown }).url === entrada;
          const rica = mismaUrl
            ? previa
            : previas.find(
                (f) => f && typeof f === 'object' && (f as { url?: unknown }).url === entrada
              );
          if (rica && typeof rica === 'object') return rica as Prisma.InputJsonValue;
          return { url: entrada } as Prisma.InputJsonValue;
        };
        // Solo se enriquece si las fotos nuevas son todas strings: el editor
        // envía la forma completa y debe pasar tal cual.
        const todasStrings = fotos.every((f) => typeof f === 'string');
        const previasConMeta = previas.some((f) => f && typeof f === 'object');
        fotosFinales = todasStrings && previasConMeta ? fotos.map((_, i) => ricaDe(i)) : (fotos as Prisma.InputJsonValue[]);
      }
    }

    // Ubicación enriquecida (benchmark Airbnb): distancias a transporte,
    // indicaciones multi-idioma y mapa personalizado. Se sanea igual que el
    // detalle: el JSONB acepta cualquier forma y un mapa corrupto rompería la
    // ficha. `null` limpia; forma inválida no toca nada.
    const decimalesSanos = (valor: unknown): Record<string, number> => {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
      const salida: Record<string, number> = {};
      for (const [clave, n] of Object.entries(valor as Record<string, unknown>)) {
        const num = Number(n);
        if (clave.length > 0 && Number.isFinite(num) && num > 0) salida[clave] = Math.round(num * 100) / 100;
      }
      return salida;
    };
    let distanciasFinal: Prisma.InputJsonValue | null | undefined;
    if (distancias !== undefined) {
      if (distancias === null) {
        distanciasFinal = null;
      } else if (distancias && typeof distancias === 'object' && !Array.isArray(distancias)) {
        const d = distancias as Record<string, unknown>;
        const valores = decimalesSanos(d);
        const unidad = d.unidad === 'millas' ? 'millas' : 'km';
        distanciasFinal =
          Object.keys(valores).length > 0
            ? ({ ...valores, unidad } as Prisma.InputJsonValue)
            : null;
      }
    }
    let indicacionesFinal: Prisma.InputJsonValue | null | undefined;
    if (indicaciones !== undefined) {
      if (indicaciones === null) {
        indicacionesFinal = null;
      } else if (indicaciones && typeof indicaciones === 'object' && !Array.isArray(indicaciones)) {
        const limpias: Record<string, string> = {};
        for (const [idioma, texto] of Object.entries(indicaciones as Record<string, unknown>)) {
          if (typeof idioma === 'string' && idioma.trim() && typeof texto === 'string' && texto.trim()) {
            limpias[idioma.trim().slice(0, 8)] = texto;
          }
        }
        indicacionesFinal =
          Object.keys(limpias).length > 0 ? (limpias as Prisma.InputJsonValue) : null;
      }
    }
    const mapaFinal =
      mapaPersonalizadoUrl !== undefined
        ? typeof mapaPersonalizadoUrl === 'string' && mapaPersonalizadoUrl.trim()
          ? mapaPersonalizadoUrl.trim()
          : null
        : undefined;

    const sesEntrante = (data as { sesHospedajes?: unknown }).sesHospedajes;
    const sesHospedajesFinal =
      sesEntrante !== undefined && sesEntrante !== null && typeof sesEntrante === 'object'
        ? { ...((existing.sesHospedajes as Record<string, unknown>) || {}), ...(sesEntrante as Record<string, unknown>) }
        : undefined;

    // Detalle declarado del alojamiento (Vista global del editor): habitaciones,
    // camas y servicios según los catálogos del editor. Se sanea antes de
    // persistir: el JSONB acepta cualquier forma y un mapa corrupto rompería
    // los contadores. `null` limpia el detalle; forma inválida no toca nada.
    const contadoresSanos = (valor: unknown): Record<string, number> => {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
      const salida: Record<string, number> = {};
      for (const [clave, n] of Object.entries(valor as Record<string, unknown>)) {
        const num = Number(n);
        if (clave.length > 0 && Number.isInteger(num) && num >= 0) salida[clave] = num;
      }
      return salida;
    };
    let detalleFinal: Prisma.InputJsonValue | null | undefined;
    if (detalleAlojamiento !== undefined) {
      if (detalleAlojamiento === null) {
        detalleFinal = null;
      } else if (detalleAlojamiento && typeof detalleAlojamiento === 'object' && !Array.isArray(detalleAlojamiento)) {
        const d = detalleAlojamiento as Record<string, unknown>;
        const habitaciones = contadoresSanos(d.habitaciones);
        const camas = contadoresSanos(d.camas);
        const servicios = Array.isArray(d.servicios)
          ? d.servicios.filter((s): s is string => typeof s === 'string')
          : [];
        detalleFinal =
          Object.keys(habitaciones).length > 0 ||
          Object.keys(camas).length > 0 ||
          servicios.length > 0
            ? ({ habitaciones, camas, servicios } as Prisma.InputJsonValue)
            : null;
      }
    }

    const property = await prisma.hospitalityProperty.update({
      where: { id: existing.id },
      data: {
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(descripcion !== undefined ? { descripcion } : {}),
        ...(codigo !== undefined ? { codigo } : {}),
        ...(zona !== undefined ? { zona } : {}),
        ...(direccion !== undefined ? { direccion } : {}),
        ...(ciudad !== undefined ? { ciudad } : {}),
        ...(estadoProvincia !== undefined ? { estadoProvincia } : {}),
        ...(pais !== undefined ? { pais } : {}),
        ...(cp !== undefined ? { cp } : {}),
        ...(latitud !== undefined ? { latitud: latitud === null || latitud === '' ? null : Number(latitud) } : {}),
        ...(longitud !== undefined ? { longitud: longitud === null || longitud === '' ? null : Number(longitud) } : {}),
        ...(fotosFinales !== undefined ? { fotos: fotosFinales === null ? Prisma.DbNull : fotosFinales } : {}),
        ...(sesHospedajesFinal ? { sesHospedajes: sesHospedajesFinal as Prisma.InputJsonValue } : {}),
        ...(detalleFinal !== undefined
          ? { detalleAlojamiento: detalleFinal === null ? Prisma.DbNull : detalleFinal }
          : {}),
        ...(distanciasFinal !== undefined
          ? { distancias: distanciasFinal === null ? Prisma.DbNull : distanciasFinal }
          : {}),
        ...(indicacionesFinal !== undefined
          ? { indicaciones: indicacionesFinal === null ? Prisma.DbNull : indicacionesFinal }
          : {}),
        ...(mapaFinal !== undefined ? { mapaPersonalizadoUrl: mapaFinal } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(estado !== undefined ? { estado } : {}),
        ...(politicaNoShow !== undefined ? { politicaNoShow } : {}),
        ...(politicaSalidaAnticipada !== undefined ? { politicaSalidaAnticipada } : {}),
        ...(holdHoras !== undefined ? { holdHoras: Number(holdHoras) } : {}),
      },
    });

    // El apagador cambia el criterio de liberación de noches A PARTIR DEL
    // PRÓXIMO check-out: los operadores del tenant se enteran del cambio y
    // desde cuándo aplica (nunca rompe la respuesta: es un aviso).
    if (
      politicaSalidaAnticipada !== undefined &&
      politicaSalidaAnticipada !== existing.politicaSalidaAnticipada
    ) {
      await notificarCambioSalidaAnticipada({
        tenantId: auth.tenant!.id,
        propertyId: property.id,
        property: property.nombre,
        antes: politicaSalidaAnticipadaEfectiva(existing.politicaSalidaAnticipada),
        despues: politicaSalidaAnticipada,
      }).catch((e: unknown) =>
        console.error('[Hospitality] Error al notificar el cambio de política:', e)
      );
    }

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_property',
      property.id,
      `Propiedad "${property.nombre}" actualizada`
    ).catch(() => {});

    return NextResponse.json({ property });
  } catch (error) {
    console.error('Error actualizando propiedad:', error);
    return NextResponse.json({ error: 'Error al actualizar propiedad' }, { status: 500 });
  }
}

// DELETE /api/hospitality/properties/[id] — eliminar
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    await prisma.hospitalityProperty.delete({ where: { id: existing.id } });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_property',
      existing.id,
      `Propiedad "${existing.nombre}" eliminada`
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error eliminando propiedad:', error);
    return NextResponse.json({ error: 'Error al eliminar propiedad' }, { status: 500 });
  }
}