export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { checkInstanceStatus } from '@/lib/evolution-instances';

type Estado = 'conectada' | 'desconectada' | 'sin_instancia' | 'error';

/**
 * Caché corta por instancia: las fichas de lead/contacto piden este estado al
 * montarse y no conviene golpear Evolution en cada visita. 30 s es suficiente
 * para que un agente que acaba de reconectar vea el cambio al recargar.
 */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; payload: any }>();

/**
 * GET - Estado de la instancia de WhatsApp del negocio, para mostrarlo en la
 * ficha antes de intentar enviar. Nunca devuelve error de proveedor como 500:
 * la UI necesita pintar "desconectada" y explicar el motivo.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const instance = await prisma.tenantWhatsAppInstance.findUnique({
      where: { tenantId: user.tenantId },
      select: { instanceName: true, phoneNumber: true, status: true },
    });

    if (!instance) {
      return NextResponse.json({
        estado: 'sin_instancia' as Estado,
        detalle: 'El negocio no tiene un WhatsApp configurado.',
        ajustes: '/dashboard/configuracion/whatsapp-negocio',
        verificadoEn: new Date().toISOString(),
      });
    }

    const enCache = cache.get(instance.instanceName);
    if (enCache && Date.now() - enCache.at < CACHE_MS) {
      return NextResponse.json(enCache.payload);
    }

    const chequeo = await checkInstanceStatus(instance.instanceName).catch(() => null);

    const estado: Estado = chequeo?.success
      ? chequeo.status === 'connected'
        ? 'conectada'
        : 'desconectada'
      : 'error';

    const payload = {
      estado,
      detalle:
        estado === 'conectada'
          ? 'La instancia del negocio está conectada.'
          : estado === 'desconectada'
            ? 'La instancia del negocio está desconectada: los envíos pueden fallar.'
            : chequeo?.error || 'No se pudo consultar el estado de la instancia.',
      instanceName: instance.instanceName,
      phoneNumber: instance.phoneNumber ?? null,
      estadoEvolution: chequeo?.data?.instance?.state ?? chequeo?.data?.state ?? null,
      ajustes: '/dashboard/configuracion/whatsapp-negocio',
      verificadoEn: new Date().toISOString(),
    };

    // Los errores no se cachean: pueden ser un corte momentáneo con Evolution.
    if (chequeo?.success) {
      cache.set(instance.instanceName, { at: Date.now(), payload });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error al consultar estado de WhatsApp del negocio:', error);
    return NextResponse.json(
      {
        estado: 'error' as Estado,
        detalle: 'Error al consultar estado',
        ajustes: '/dashboard/configuracion/whatsapp-negocio',
        verificadoEn: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
