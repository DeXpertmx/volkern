export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST - Recibir webhooks de servicios externos
export async function POST(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { tenantId } = params;

    // Verificar que el tenant existe
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // Obtener headers y payload
    const headers: any = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      payload = { raw: await request.text() };
    }

    // Crear log del webhook
    const webhookLog = await prisma.webhookLog.create({
      data: {
        tenantId,
        direccion: 'entrante',
        metodo: request.method,
        url: request.url,
        headers,
        payload,
        estado: 'exitoso',
        procesadoEn: new Date()
      }
    });

    // Aquí se puede agregar lógica personalizada para procesar el webhook
    // según el servicio (identificar por headers, payload, etc.)
    await procesarWebhook(tenantId, headers, payload, webhookLog.id);

    return NextResponse.json({
      success: true,
      message: 'Webhook recibido',
      id: webhookLog.id
    });
  } catch (error) {
    console.error('Error al procesar webhook:', error);
    
    // Intentar registrar el error
    try {
      await prisma.webhookLog.create({
        data: {
          tenantId: params.tenantId,
          direccion: 'entrante',
          metodo: request.method,
          url: request.url,
          headers: {},
          payload: { error: 'Error al procesar' },
          estado: 'fallido',
          errorMensaje: error instanceof Error ? error.message : 'Error desconocido'
        }
      });
    } catch (logError) {
      console.error('Error al registrar webhook fallido:', logError);
    }

    return NextResponse.json(
      { error: 'Error al procesar webhook' },
      { status: 500 }
    );
  }
}

// GET - Obtener logs de webhooks
export async function GET(
  request: Request,
  { params }: { params: { tenantId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');

    const webhookLogs = await prisma.webhookLog.findMany({
      where: { tenantId: params.tenantId },
      orderBy: { fechaCreacion: 'desc' },
      take: limit,
      skip
    });

    const total = await prisma.webhookLog.count({
      where: { tenantId: params.tenantId }
    });

    return NextResponse.json({
      logs: webhookLogs,
      total,
      limit,
      skip
    });
  } catch (error) {
    console.error('Error al obtener logs de webhooks:', error);
    return NextResponse.json(
      { error: 'Error al obtener logs' },
      { status: 500 }
    );
  }
}

// Función auxiliar para procesar el webhook según el servicio
async function procesarWebhook(
  tenantId: string,
  headers: any,
  payload: any,
  webhookLogId: string
) {
  // Identificar el servicio por headers o payload
  
  // Stripe
  if (headers['stripe-signature']) {
    await procesarWebhookStripe(tenantId, payload, webhookLogId);
    return;
  }

  // Twilio
  if (headers['x-twilio-signature']) {
    await procesarWebhookTwilio(tenantId, payload, webhookLogId);
    return;
  }

  // Mailchimp
  if (headers['user-agent']?.includes('MailChimp.com')) {
    await procesarWebhookMailchimp(tenantId, payload, webhookLogId);
    return;
  }

  // Por defecto, solo registrar
  console.log('Webhook recibido sin procesamiento específico:', {
    tenantId,
    headers,
    payload
  });
}

async function procesarWebhookStripe(
  tenantId: string,
  payload: any,
  webhookLogId: string
) {
  // Aquí se puede agregar lógica para procesar eventos de Stripe
  console.log('Procesando webhook de Stripe:', payload.type);
  
  // Ejemplo: crear una nota en el lead cuando se recibe un pago
  if (payload.type === 'payment_intent.succeeded') {
    // Buscar el lead por el email del customer
    // Crear una nota con el pago recibido
  }
}

async function procesarWebhookTwilio(
  tenantId: string,
  payload: any,
  webhookLogId: string
) {
  console.log('Procesando webhook de Twilio:', payload);
  
  // Aquí se puede procesar mensajes SMS entrantes
  if (payload.MessageSid) {
    // Registrar el mensaje en conversaciones
  }
}

async function procesarWebhookMailchimp(
  tenantId: string,
  payload: any,
  webhookLogId: string
) {
  console.log('Procesando webhook de Mailchimp:', payload);
  
  // Aquí se puede sincronizar cambios de Mailchimp
  // (nuevo suscriptor, desuscripción, etc.)
}
