export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { obtenerTokenChatwootTenant } from '@/lib/chatwoot-tenant';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

type Paso = { id: string; titulo: string; ok: boolean; detalle: string };

const soloDigitos = (valor?: string | null) => (valor || '').replace(/[^0-9]/g, '');

/**
 * POST - Diagnóstico del hub: valida servidor, token de agente, cuenta e inbox
 * y, si se pide, manda un mensaje de prueba indicando por qué vía salió
 * (hub/Chatwoot o Evolution). No escribe en el timeline del CRM: es una prueba
 * de infraestructura, no una conversación con un cliente.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });
    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }
    const tenantId = user.tenantId;

    const body = await request.json().catch(() => ({}));
    const numero = String(body?.numero || '').trim();
    const enviar = Boolean(body?.enviar);
    const mensaje = String(
      body?.mensaje || 'Prueba de Volkern: mensajería saliente funcionando.'
    ).trim();

    if (enviar) {
      const digitos = soloDigitos(numero);
      if (digitos.length < 7 || digitos.length > 15) {
        return NextResponse.json(
          { error: 'Indica un número de prueba válido (7 a 15 dígitos)' },
          { status: 400 }
        );
      }
    }

    const pasos: Paso[] = [];
    const agregar = (id: string, titulo: string, ok: boolean, detalle: string) =>
      pasos.push({ id, titulo, ok, detalle });

    // 1. Configuración del hub
    const hub = await prisma.messagingHubConfig.findUnique({
      where: { tenantId },
      select: { chatwootAccountId: true, whatsappInboxId: true, chatwootAgentToken: true },
    });

    if (!hub) {
      agregar('config', 'Configuración del hub', false, 'El tenant no tiene configuración de hub.');
      return NextResponse.json({ ok: false, pasos, verificadoEn: new Date().toISOString() });
    }

    const accountId = hub.chatwootAccountId ?? null;
    agregar(
      'config',
      'Configuración del hub',
      Boolean(accountId),
      accountId
        ? `Cuenta ${accountId} · inbox ${hub.whatsappInboxId ?? 'sin asignar'}`
        : 'La cuenta del hub no está asignada: los envíos no pueden usar Chatwoot.'
    );

    // 2. Servidor de Chatwoot configurado en la plataforma
    const servidorOk = Boolean(process.env.CHATWOOT_BASE_URL);
    agregar(
      'servidor',
      'Servidor de Chatwoot',
      servidorOk,
      servidorOk
        ? 'Variable CHATWOOT_BASE_URL presente en el servidor.'
        : 'Falta CHATWOOT_BASE_URL: el cliente de Chatwoot está deshabilitado.'
    );

    // 3. Token de agente (canal → config del hub)
    const token = await obtenerTokenChatwootTenant(tenantId, accountId ?? 0);
    agregar(
      'token',
      'Token de agente',
      Boolean(token),
      token
        ? hub.chatwootAgentToken
          ? 'Token de agente guardado en Configuración → Hub.'
          : 'Token de agente tomado del canal de WhatsApp.'
        : 'No hay token de agente. El token del bot no sirve: Chatwoot responde 401 al enviar.'
    );

    let perfil: any = null;
    if (servidorOk && token) {
      try {
        perfil = await chatwootApi.getProfile(token);
        agregar(
          'perfil',
          'Autenticación del token',
          true,
          `Token válido: ${perfil?.name || perfil?.email || `usuario ${perfil?.id}`}`
        );
      } catch (error: any) {
        const detalle = String(error?.message || error);
        const esBot = /bot|401|403/i.test(detalle);
        agregar(
          'perfil',
          'Autenticación del token',
          false,
          esBot
            ? `Chatwoot rechazó el token (¿token del bot o caducado?): ${detalle.slice(0, 200)}`
            : `No se pudo validar el token: ${detalle.slice(0, 200)}`
        );
      }
    }

    // 4 y 5. Cuenta e inbox (con el token del agente: valida pertenencia real)
    let inbox: any = null;
    if (perfil && accountId) {
      try {
        const { payload } = await chatwootApi.listInboxes(accountId, token);
        const inboxes = Array.isArray(payload) ? payload : [];

        agregar(
          'cuenta',
          'Acceso a la cuenta',
          true,
          `El token puede ver ${inboxes.length} inbox(es) de la cuenta ${accountId}.`
        );

        const inboxId = hub.whatsappInboxId;
        inbox = inboxId ? inboxes.find((i: any) => Number(i.id) === Number(inboxId)) : null;

        if (!inboxId) {
          agregar(
            'inbox',
            'Inbox de WhatsApp',
            false,
            'La configuración no tiene whatsappInboxId asignado.'
          );
        } else if (!inbox) {
          agregar(
            'inbox',
            'Inbox de WhatsApp',
            false,
            `El inbox ${inboxId} no aparece entre los accesibles: el agente no es miembro o el inbox no existe.`
          );
        } else {
          agregar(
            'inbox',
            'Inbox de WhatsApp',
            true,
            `Inbox ${inbox.id}: ${inbox.name} (${inbox.channel_type || 'sin canal'}).`
          );
        }
      } catch (error: any) {
        agregar(
          'cuenta',
          'Acceso a la cuenta',
          false,
          `El token no puede leer la cuenta ${accountId}: ${String(error?.message || error).slice(0, 200)}`
        );
      }
    }

    const puedeEnviarPorHub = Boolean(perfil && accountId && inbox);
    const resultado: any = {
      ok: pasos.every((p) => p.ok),
      pasos,
      verificadoEn: new Date().toISOString(),
    };

    if (!enviar) {
      return NextResponse.json(resultado);
    }

    // 6. Envío de prueba: hub primero, Evolution como respaldo (igual que un envío real)
    const digitos = soloDigitos(numero);
    let motivoHub: string | undefined;

    if (puedeEnviarPorHub) {
      try {
        const conversacion = await chatwootApi.getOrCreateConversation(
          accountId as number,
          inbox.id,
          digitos,
          token
        );
        const enviado = await chatwootApi.sendMessage(
          accountId as number,
          conversacion.id,
          mensaje,
          token,
          { messageType: 'outgoing', contentAttributes: { volkernOrigin: 'diagnostico' } }
        );
        resultado.envio = {
          proveedor: 'hub',
          ok: true,
          detalle: `Enviado por el inbox del hub (conversación ${conversacion.id} de Chatwoot).`,
          conversationId: conversacion.id,
          messageId: enviado?.id ?? null,
        };
        return NextResponse.json(resultado);
      } catch (error: any) {
        motivoHub = String(error?.message || error).slice(0, 300);
      }
    } else {
      motivoHub = 'El hub no está listo (revisa los pasos en rojo).';
    }

    const directo = await sendWhatsAppMessage(numero, mensaje, tenantId);
    if (directo.success) {
      resultado.envio = {
        proveedor: 'evolution',
        ok: true,
        detalle: 'El hub no pudo enviar: el mensaje salió por el WhatsApp del negocio (Evolution).',
        motivoHub,
        messageId: directo.messageId ?? null,
      };
    } else {
      resultado.envio = {
        proveedor: null,
        ok: false,
        detalle: `No salió por ningún canal. ${directo.error || 'Error desconocido'}`,
        motivoHub,
      };
    }

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error('Error en diagnóstico del hub:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al diagnosticar el hub' },
      { status: 500 }
    );
  }
}
