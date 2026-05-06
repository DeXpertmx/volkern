export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { sendSMS } from '@/lib/sms';

/**
 * POST /api/integraciones/twilio/test
 * Prueba la conexión de Twilio SMS
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const { phoneNumber, testMessage } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Número de teléfono requerido para prueba' },
        { status: 400 }
      );
    }

    // Verificar integración primero
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'twilio',
        conectado: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Twilio SMS no está conectado' },
        { status: 400 }
      );
    }

    // Intentar enviar SMS de prueba
    const message = testMessage || '🔔 Mensaje de prueba desde Volkern CRM';
    const success = await sendSMS(phoneNumber, message, user.tenantId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `SMS enviado correctamente a ${phoneNumber}`,
      });
    } else {
      return NextResponse.json(
        { error: 'Error al enviar SMS' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error testing Twilio SMS:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
