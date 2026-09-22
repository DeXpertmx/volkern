/**
 * Registro de viajeros — API de operación (RD 933/2021).
 *
 * GET  /api/hospitality/registro-viajeros
 *   Estado del registro de viajeros del tenant: configuración (sin secretos),
 *   cuántas comunicaciones hay en cada estado, propiedades sin código de
 *   establecimiento y las últimas comunicaciones con su lote y su error.
 *
 * POST /api/hospitality/registro-viajeros
 *   { accion: 'configurar' }  credenciales y códigos de catálogo del arrendador
 *   { accion: 'completar' }   datos de los viajeros que el canal no envió + envío
 *   { accion: 'enlace' }      enlace de check-in del huésped (para reenviarlo)
 *   { accion: 'enviar' }      parte de viajeros (PV) de una reserva; con
 *                             `tipo: 'RH'` emite la reserva de hospedaje
 *   { accion: 'consultar' }   consulta los lotes pendientes (alta asíncrona)
 *   { accion: 'anular' }      anula una comunicación ya registrada
 *
 * La comunicación va SIEMPRE al web service oficial del Ministerio del
 * Interior (SES Hospedajes, interfaz v3.1.2): no hay agregadores de terceros.
 * El envío automático lo hace el cron `hospitality-registro-viajeros`, que
 * cumple el plazo de 24 h; estas acciones existen para configurar y para
 * resolver los casos que necesitan una persona (datos incompletos, reenvíos).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  ESTADO_REGISTRO,
  ESTADOS_PROPIEDAD_REGISTRO,
  anularComunicacion,
  consultarLotesPendientes,
  enviarRegistroDeReserva,
  enviarReservaHospedaje,
  estadoRegistroViajeros,
  saveMirConfig,
} from '@/lib/hospitality/registro-viajeros-service';
import { enlaceCheckinDeReserva } from '@/lib/hospitality/checkin-service';
import { TIPOS_PREGUNTA } from '@/lib/hospitality/checkin-preguntas';
import type { EntornoMIR, PersonaMIR } from '@/lib/hospitality/registro-viajeros';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const estado = await estadoRegistroViajeros(tenantId);

    // Propiedades con su código de establecimiento: sin él el Ministerio no
    // puede casar la comunicación con el inmueble.
    //
    // Entran las dos situaciones reales del inmueble: «activa» (en configuración)
    // y «conectada» (publicada, ya vendiendo). Filtrar solo por «activa» dejaba
    // fuera precisamente la que emite partes —y por tanto su código no se podía
    // informar ni aparecía en el aviso de «sin código»—.
    const propiedades = await prisma.hospitalityProperty.findMany({
      where: { tenantId, estado: { in: [...ESTADOS_PROPIEDAD_REGISTRO] } },
      select: { id: true, nombre: true, codigoEstablecimientoMIR: true },
      orderBy: { nombre: 'asc' },
      take: 100,
    });

    // Preguntas personalizadas del check-in: la config completa del hotel
    // (incluye inactivas, para poder reactivarlas) en su orden.
    const preguntas = await prisma.hospitalityCheckinPregunta.findMany({
      where: { tenantId },
      orderBy: [{ orden: 'asc' }, { fechaCreacion: 'asc' }],
      take: 100,
    });

    return NextResponse.json({
      ...estado,
      propiedades,
      propiedadesSinCodigo: propiedades.filter((p) => !p.codigoEstablecimientoMIR),
      preguntas,
    });
  } catch (error: unknown) {
    console.error('[Registro de viajeros] Error en GET:', error);
    return NextResponse.json({ error: 'Error obteniendo el estado del registro de viajeros' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const accion = String(body.accion ?? '').trim();

    switch (accion) {
      case 'configurar': {
        const config = await saveMirConfig(tenantId, {
          codigoArrendador: body.codigoArrendador as string | undefined,
          aplicacion: body.aplicacion as string | undefined,
          entorno: body.entorno as EntornoMIR | undefined,
          usuario: body.usuario as string | undefined,
          password: body.password as string | undefined,
          tipoPagoDefecto: body.tipoPagoDefecto as string | undefined,
          mapaTiposPago: body.mapaTiposPago as Record<string, string> | undefined,
          activo: typeof body.activo === 'boolean' ? body.activo : undefined,
        });

        // El código de establecimiento lo asigna el Ministerio a cada inmueble
        // en el registro: sin él no se puede enviar el parte de esa propiedad.
        const propiedades = body.propiedades as Array<{ id: string; codigoEstablecimientoMIR: string }> | undefined;
        if (Array.isArray(propiedades)) {
          for (const propiedad of propiedades) {
            if (!propiedad?.id) continue;
            await prisma.hospitalityProperty.updateMany({
              where: { id: propiedad.id, tenantId },
              data: { codigoEstablecimientoMIR: (propiedad.codigoEstablecimientoMIR ?? '').trim() || null },
            });
          }
        }

        return NextResponse.json({ ok: true, configurado: !!config.codigoArrendador });
      }

      case 'pregunta_crear':
      case 'pregunta_actualizar': {
        // Las respuestas del huésped viven en la reserva y NUNCA viajan al XML
        // del parte (XSD cerrado del Ministerio): esto es config del hotel.
        const esCrear = accion === 'pregunta_crear';
        const texto = (v: unknown) => String(v ?? '').trim().slice(0, 250);
        const es = texto(body.es);
        const en = texto(body.en);
        if (!es && !en) {
          return NextResponse.json(
            { error: 'La pregunta necesita texto (en español; se reutiliza en inglés si falta)' },
            { status: 400 }
          );
        }
        const tipoCrudo = String(body.tipo ?? 'texto');
        const tipo = (TIPOS_PREGUNTA as readonly string[]).includes(tipoCrudo) ? tipoCrudo : 'texto';
        let opciones: Prisma.InputJsonValue | null = null;
        if (tipo === 'opcion') {
          const limpiar = (v: unknown) =>
            Array.isArray(v)
              ? [...new Set(v.map((o) => String(o ?? '').trim()).filter(Boolean))].slice(0, 12)
              : [];
          const listaEs = limpiar(body.opcionesEs);
          const listaEn = limpiar(body.opcionesEn);
          const finalesEs = listaEs.length > 0 ? listaEs : listaEn;
          const finalesEn = listaEn.length > 0 ? listaEn : listaEs;
          if (finalesEs.length === 0) {
            return NextResponse.json(
              { error: 'Una pregunta de opción necesita al menos una opción' },
              { status: 400 }
            );
          }
          opciones = { es: finalesEs, en: finalesEn };
        }
        const datos = {
          tipo,
          es,
          en: en || es,
          // Sin opciones (texto/número/fecha), JsonNull — Prisma no acepta
          // `null` crudo en campos Json anulables.
          opciones: opciones ?? Prisma.JsonNull,
          requerida: body.requerida === true,
          activa: typeof body.activa === 'boolean' ? body.activa : true,
          orden: Number.isFinite(Number(body.orden)) ? Math.trunc(Number(body.orden)) : 0,
        };
        const datosCrear: Prisma.HospitalityCheckinPreguntaUncheckedCreateInput = { tenantId, ...datos };
        const datosActualizar: Prisma.HospitalityCheckinPreguntaUncheckedUpdateInput = datos;
        if (esCrear) {
          const creada = await prisma.hospitalityCheckinPregunta.create({
            data: datosCrear,
          });
          return NextResponse.json({ ok: true, pregunta: creada });
        }
        const id = String(body.id ?? '').trim();
        if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
        const existente = await prisma.hospitalityCheckinPregunta.findFirst({ where: { id, tenantId } });
        if (!existente) return NextResponse.json({ error: 'Pregunta no encontrada' }, { status: 404 });
        const actualizada = await prisma.hospitalityCheckinPregunta.update({
          where: { id: existente.id },
          data: datosActualizar,
        });
        return NextResponse.json({ ok: true, pregunta: actualizada });
      }

      case 'pregunta_eliminar': {
        // Baja lógica: si el hotel la borra de verdad, las respuestas ya
        // guardadas en reservas quedarían huérfanas; desactivarla las conserva
        // y la pregunta desaparece del formulario.
        const id = String(body.id ?? '').trim();
        if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
        const borrada = await prisma.hospitalityCheckinPregunta.updateMany({
          where: { id, tenantId },
          data: { activa: false },
        });
        return NextResponse.json({ ok: borrada.count > 0 });
      }

      case 'completar': {
        // El canal no manda documento ni dirección: los completa el operador en
        // el check-in. Se guardan en `guestData.viajeros` (formato que lee el
        // módulo) y se envía de inmediato, sin esperar al siguiente barrido.
        const reservaId = String(body.reservaId ?? '').trim();
        const viajeros = body.viajeros as PersonaMIR[] | undefined;
        if (!reservaId) return NextResponse.json({ error: 'Falta reservaId' }, { status: 400 });
        if (!Array.isArray(viajeros) || viajeros.length === 0) {
          return NextResponse.json({ error: 'Faltan los datos de los viajeros' }, { status: 400 });
        }

        const reserva = await prisma.hospitalityReservation.findFirst({
          where: { id: reservaId, tenantId },
          select: { id: true, guestData: true },
        });
        if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

        const guestData = ((reserva.guestData as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
        await prisma.hospitalityReservation.update({
          where: { id: reserva.id },
          data: {
            guestData: { ...guestData, viajeros } as unknown as Prisma.InputJsonValue,
          },
        });

        const envio = await enviarRegistroDeReserva(tenantId, reservaId);
        return NextResponse.json({ ok: envio.estado !== ESTADO_REGISTRO.error, ...envio });
      }

      case 'enlace': {
        // Enlace de check-in del huésped: el hotel puede reenviárselo cuando el
        // parte está incompleto (sobre todo en reservas de canal, donde el
        // huésped no pasó por la web). Se genera si la reserva aún no lo tenía.
        const reservaId = String(body.reservaId ?? '').trim();
        if (!reservaId) return NextResponse.json({ error: 'Falta reservaId' }, { status: 400 });
        const enlace = await enlaceCheckinDeReserva(tenantId, reservaId);
        if (!enlace) {
          return NextResponse.json(
            { error: 'La reserva no existe o ya no está activa' },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true, ...enlace });
      }

      case 'enviar': {
        const reservaId = String(body.reservaId ?? '').trim();
        if (!reservaId) return NextResponse.json({ error: 'Falta reservaId' }, { status: 400 });
        // `tipo` decide qué comunicación se emite: el parte de viajeros (PV, al
        // entrar) o la reserva de hospedaje (RH, al reservar).
        const tipo = String(body.tipo ?? 'PV').toUpperCase();
        const envio =
          tipo === 'RH'
            ? await enviarReservaHospedaje(tenantId, reservaId)
            : await enviarRegistroDeReserva(tenantId, reservaId);
        return NextResponse.json({ ok: envio.estado !== ESTADO_REGISTRO.error, ...envio });
      }

      case 'consultar': {
        const resultado = await consultarLotesPendientes(tenantId);
        return NextResponse.json({ ok: true, ...resultado });
      }

      case 'anular': {
        const comunicacionId = String(body.comunicacionId ?? '').trim();
        if (!comunicacionId) return NextResponse.json({ error: 'Falta comunicacionId' }, { status: 400 });
        const resultado = await anularComunicacion(tenantId, comunicacionId);
        return NextResponse.json(resultado);
      }

      default:
        return NextResponse.json(
          {
            error:
              "Acción no válida. Usa 'configurar', 'completar', 'enlace', 'enviar', 'consultar' o 'anular'.",
          },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error('[Registro de viajeros] Error en POST:', error);
    return NextResponse.json({ error: 'Error procesando el registro de viajeros' }, { status: 500 });
  }
}
