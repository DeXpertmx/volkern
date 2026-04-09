import { NextRequest, NextResponse } from 'next/server';
import { createSystemContext } from '@/lib/skills/context';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { tenantId, message } = await request.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId requerido' }, { status: 400 });
    }

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    const result = await notifyByTelegram(
      message || '🔔 *Notificación de Prueba*\n\nEste es un mensaje de prueba del sistema Volkern.',
      createSystemContext(tenantId)
    );

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Error sending test notification:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Usa POST con { tenantId, message } para enviar una notificación de prueba' 
  });
}
