export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { chatwootBridgeDe, enviarWhatsAppPorChatwoot } from '@/lib/chatwoot-tenant';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

const soloDigitos = (valor?: string | null) => (valor || '').replace(/[^0-9]/g, '');

/**
 * La deduplicación por texto solo aplica a intentos recientes: si alguien
 * reenvía el mismo texto diez minutos después, es un reenvío legítimo y debe
 * salir, no bloquearse.
 */
const VENTANA_DUPLICADOS_MS = 10 * 60 * 1000;

/**
 * POST - Reintenta un mensaje saliente que quedó en error.
 *
 * Reutiliza el mismo texto y la misma conversación: el timeline no gana una
 * fila nueva, se actualiza la que ya existe. Dos salvaguardas contra duplicar:
 *
 *  1. Claim atómico: solo la petición que consigue pasar el mensaje de `error`
 *     a `pendiente` envía. Un doble clic (o dos pestañas) no manda dos veces.
 *  2. Si ya existe un mensaje saliente posterior con el mismo texto, dentro de
 *     los últimos 10 minutos y con prueba de entrega (entregado/leído o id del
 *     proveedor), el primer intento sí llegó: se marca y no se reenvía. Fuera
 *     de esa ventana el mismo texto es un reenvío legítimo y sale normalmente.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, tenantId: true },
    });
    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }
    const tenantId = user.tenantId;

    const body = await request.json().catch(() => ({}));
    const messageId = String(body?.messageId || '');
    if (!messageId) {
      return NextResponse.json({ error: 'messageId es requerido' }, { status: 400 });
    }

    const mensaje = await prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (!mensaje || mensaje.conversation?.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 });
    }
    if (mensaje.direccion !== 'saliente') {
      return NextResponse.json(
        { error: 'Solo se pueden reintentar mensajes salientes' },
        { status: 400 }
      );
    }
    if (mensaje.estado !== 'error' && mensaje.estado !== 'pendiente') {
      return NextResponse.json(
        { error: `El mensaje ya está en estado "${mensaje.estado}"` },
        { status: 409 }
      );
    }

    const conversacion = mensaje.conversation;

    const telefono =
      conversacion.contactoTelefono ||
      (mensaje.metadatos as any)?.telefono ||
      null;
    const digitos = soloDigitos(telefono);
    if (!digitos) {
      return NextResponse.json(
        { error: 'La conversación no tiene teléfono para reenviar' },
        { status: 400 }
      );
    }

    // 2. ¿Llegó ya con otro intento? Solo dentro de una ventana reciente y solo
    // si el mensaje posterior tiene PRUEBA de haber salido (entregado/leído o
    // id del proveedor). Sin pruebas no se marca nada: se reintenta de verdad.
    const desdeVentana = new Date(Date.now() - VENTANA_DUPLICADOS_MS);
    const dentroDeVentana = mensaje.fechaCreacion >= desdeVentana;

    if (dentroDeVentana) {
      const candidato = await prisma.message.findFirst({
        where: {
          conversationId: conversacion.id,
          direccion: 'saliente',
          contenido: mensaje.contenido,
          estado: { in: ['enviado', 'entregado', 'leido'] },
          id: { not: mensaje.id },
          fechaCreacion: { gte: desdeVentana, gt: mensaje.fechaCreacion },
        },
        orderBy: { fechaCreacion: 'desc' },
        select: { id: true, estado: true, externalRef: true, metadatos: true },
      });

      const tienePrueba = candidato
        ? candidato.estado === 'entregado' ||
          candidato.estado === 'leido' ||
          Boolean(candidato.externalRef) ||
          Boolean((candidato.metadatos as any)?.messageId)
        : false;

      if (candidato && tienePrueba) {
        await prisma.message.update({
          where: { id: mensaje.id },
          data: {
            estado: 'enviado',
            errorMensaje: null,
            metadatos: {
              ...((mensaje.metadatos as any) || {}),
              resueltoPorDuplicado: candidato.id,
              pruebaDuplicado: {
                estado: candidato.estado,
                externalRef: candidato.externalRef || null,
                messageId: (candidato.metadatos as any)?.messageId ?? null,
              },
              resueltoEn: new Date().toISOString(),
              resueltoPor: { id: user.id, email: user.email },
            },
          },
        });
        return NextResponse.json({
          success: true,
          yaEnviado: true,
          estado: 'enviado',
          detalle:
            'Ya había un mensaje con el mismo texto con prueba de entrega: no se duplicó.',
        });
      }
    }

    // 1. Claim atómico: de error a pendiente solo pasa una petición.
    const claim = await prisma.message.updateMany({
      where: { id: mensaje.id, estado: mensaje.estado },
      data: { estado: 'pendiente' },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: 'El mensaje ya se está reintentando', estado: 'pendiente' },
        { status: 409 }
      );
    }

    let enviado = false;
    let errorEnvio: string | undefined;
    let proveedorMessageId: string | undefined;
    let chatwootMessageId: number | undefined;

    // Misma conversación primero por el hub (si está puenteada), luego Evolution.
    const bridge = chatwootBridgeDe(conversacion);
    if (bridge) {
      const porHub = await enviarWhatsAppPorChatwoot({
        tenantId,
        conversacion,
        contenido: mensaje.contenido,
      });
      if (porHub.success) {
        enviado = true;
        chatwootMessageId = porHub.messageId;
      } else {
        errorEnvio = `Hub: ${porHub.error || 'error desconocido'}`;
      }
    }

    if (!enviado) {
      const directo = await sendWhatsAppMessage(telefono as string, mensaje.contenido, tenantId);
      if (directo.success) {
        enviado = true;
        proveedorMessageId = directo.messageId;
      } else {
        errorEnvio = errorEnvio
          ? `${errorEnvio} · Evolution: ${directo.error}`
          : `Evolution: ${directo.error}`;
      }
    }

    const metadatosPrevios: any = (mensaje.metadatos as any) || {};
    const reintentos = Number(metadatosPrevios.reintentos || 0) + 1;

    const actualizado = await prisma.message.update({
      where: { id: mensaje.id },
      data: {
        estado: enviado ? 'enviado' : 'error',
        errorMensaje: enviado ? null : errorEnvio,
        chatwootMessageId: chatwootMessageId ?? mensaje.chatwootMessageId,
        metadatos: {
          ...metadatosPrevios,
          proveedor: chatwootMessageId ? 'chatwoot' : 'evolution',
          messageId: chatwootMessageId ?? proveedorMessageId ?? metadatosPrevios.messageId,
          reintentos,
          ultimoReintentoEn: new Date().toISOString(),
          // Quién reintentó y con qué resultado: auditoría básica sin depender
          // de otra tabla.
          ultimoReintentoPor: { id: user.id, email: user.email },
          ultimoReintentoResultado: enviado ? 'enviado' : 'error',
        },
      },
    });

    if (enviado) {
      await prisma.conversation.update({
        where: { id: conversacion.id },
        data: {
          ultimoMensaje: mensaje.contenido.slice(0, 100),
          fechaUltimoMensaje: new Date(),
        },
      });

      // externalRef del id de Evolution para que los ACK (entregado/leído)
      // actualicen esta misma fila.
      if (!chatwootMessageId && proveedorMessageId) {
        const ref = `evolution_msg_${proveedorMessageId}`;
        const yaExiste = await prisma.message
          .findUnique({ where: { externalRef: ref }, select: { id: true } })
          .catch(() => null);
        if (!yaExiste) {
          await prisma.message
            .update({ where: { id: mensaje.id }, data: { externalRef: ref } })
            .catch(() => undefined);
        }
      }

      return NextResponse.json({
        success: true,
        estado: actualizado.estado,
        proveedor: chatwootMessageId ? 'hub' : 'evolution',
      });
    }

    return NextResponse.json(
      {
        success: false,
        estado: 'error',
        error: errorEnvio || 'No se pudo reenviar el WhatsApp',
      },
      { status: 502 }
    );
  } catch (error: any) {
    console.error('[reintentar] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al reintentar el envío' },
      { status: 500 }
    );
  }
}
