export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST - Enviar un payload de prueba al webhook
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Verificar que el webhook existe y pertenece al tenant
    const webhook = await prisma.incomingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook no encontrado' },
        { status: 404 }
      );
    }

    // Payload de prueba
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      nombre: 'Juan Pérez',
      email: 'juan.perez@example.com',
      telefono: '+52 55 1234 5678',
      empresa: 'Empresa de Prueba',
      notas: 'Este es un mensaje de prueba desde el dashboard de Volkern CRM',
      mensaje: 'Hola, me interesa obtener más información sobre sus servicios'
    };

    // Llamar al webhook
    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/${webhook.id}`;
    
    console.log('Enviando payload de prueba a:', webhookUrl);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Volkern-Test-Client/1.0'
      },
      body: JSON.stringify(testPayload)
    });

    const responseData = await response.json();

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      message: response.ok ? 'Webhook de prueba enviado exitosamente' : 'Error al procesar webhook de prueba',
      testPayload,
      response: responseData
    });

  } catch (error: any) {
    console.error('Error probando webhook:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Error al probar webhook', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
