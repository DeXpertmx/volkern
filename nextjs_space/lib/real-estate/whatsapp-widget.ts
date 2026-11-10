import { prisma } from '@/lib/db';
import { PLATFORM_INSTANCE_ROW_ID } from '@/lib/evolution-instances';

/**
 * Número que atiende el botón de WhatsApp de la ficha del widget.
 *
 * La regla vive en el servidor para que el panel, la API pública del widget y
 * la ficha usen el mismo criterio: primero el WhatsApp del negocio y, si el
 * negocio no tiene uno configurado, el número del sistema (plataforma). El
 * resultado solo elige quién opera; encender o apagar el botón es un ajuste
 * aparte (`widgetWhatsappBoton`).
 */
export type OrigenWhatsAppWidget = 'empresa' | 'sistema';

export interface WhatsAppWidget {
  numero: string | null;
  origen: OrigenWhatsAppWidget | null;
}

/** Deja solo los dígitos y descarta valores que no son un teléfono útil. */
export function digitarNumero(valor: unknown): string | null {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos : null;
}

export async function resolverWhatsAppWidget(tenantId: string): Promise<WhatsAppWidget> {
  // 1. WhatsApp del negocio conectado desde Configuración.
  let estadoInstancia: string | null = null;

  try {
    const instancia = await prisma.tenantWhatsAppInstance.findUnique({
      where: { tenantId },
      select: { phoneNumber: true, status: true },
    });
    estadoInstancia = instancia?.status ?? null;
    if (instancia?.status === 'connected') {
      const numero = digitarNumero(instancia.phoneNumber);
      if (numero) return { numero, origen: 'empresa' };
    }
  } catch (error) {
    console.warn('[WhatsApp widget] Instancia del negocio no disponible:', error);
  }

  // 2. Canal de WhatsApp del tenant: el webhook no siempre llega a guardar el
  //    número en la instancia, así que el canal hace de respaldo. Una
  //    instancia desconectada no debe ofrecer el botón del negocio.
  if (estadoInstancia === null || estadoInstancia === 'connected') {
    try {
      const canal = await prisma.channel.findFirst({
        where: { tenantId, type: 'whatsapp', isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { config: true },
      });
      const config = canal?.config as { phoneNumber?: unknown } | null;
      const numero = digitarNumero(config?.phoneNumber);
      if (numero) return { numero, origen: 'empresa' };
    } catch (error) {
      console.warn('[WhatsApp widget] Canal de WhatsApp no disponible:', error);
    }
  }

  // 3. Número del sistema: la ficha lo usa cuando el negocio no tiene uno
  //    propio, para que el visitante siempre pueda escribir.
  try {
    const plataforma = await prisma.platformWhatsAppInstance.findUnique({
      where: { id: PLATFORM_INSTANCE_ROW_ID },
      select: { phoneNumber: true, status: true },
    });
    if (plataforma?.status === 'connected') {
      const numero = digitarNumero(plataforma.phoneNumber);
      if (numero) return { numero, origen: 'sistema' };
    }
  } catch (error) {
    console.warn('[WhatsApp widget] Número del sistema no disponible:', error);
  }

  return { numero: null, origen: null };
}
