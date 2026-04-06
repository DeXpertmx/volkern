export const dynamic = 'force-dynamic';
/**
 * Anytimebot Webhook Test Endpoint
 * Permite probar la sincronización de citas sin depender de Anytimebot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Check if Anytimebot integration exists for this tenant
    const integration = await prisma.anytimebotIntegration.findUnique({
      where: { tenantId: user.tenantId },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'No se encontró integración de Anytimebot configurada' },
        { status: 404 }
      );
    }

    // Generate test payload
    const testPayload = {
      eventType: 'BOOKING_CREATED',
      id: `test-${Date.now()}`,
      clientName: 'Cliente de Prueba',
      clientEmail: 'test@volkern.com',
      clientPhone: '+52 55 1234 5678',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      time: '10:00',
      duration: 60,
      notes: 'Cita de prueba desde el panel de Volkern CRM',
    };

    console.log('\n========== TEST WEBHOOK TRIGGERED ==========');
    console.log('Test payload:', JSON.stringify(testPayload, null, 2));

    // Call the actual webhook endpoint
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/anytimebot/citas`;
    console.log('Calling webhook:', webhookUrl);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();

    console.log('Webhook response:', {
      status: response.status,
      success: result.success,
      citaId: result.citaId,
      leadId: result.leadId,
    });
    console.log('========== TEST COMPLETED ==========\n');

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Prueba exitosa - Cita creada correctamente',
        testPayload,
        webhookResponse: result,
        citaId: result.citaId,
        leadId: result.leadId,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'El webhook falló',
          testPayload,
          webhookResponse: result,
        },
        { status: response.status }
      );
    }
  } catch (error) {
    console.error('Error in test endpoint:', error);
    return NextResponse.json(
      {
        error: 'Error al ejecutar prueba',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to show test instructions
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/webhooks/anytimebot/test',
    method: 'POST',
    description: 'Endpoint para probar la sincronización de citas de Anytimebot',
    authentication: 'Required - debe estar autenticado',
    usage: 'Envía un POST request para simular la creación de una cita desde Anytimebot',
    examplePayload: {
      eventType: 'BOOKING_CREATED',
      id: 'test-123',
      clientName: 'Cliente de Prueba',
      clientEmail: 'test@example.com',
      clientPhone: '+52 55 1234 5678',
      date: '2026-01-15',
      time: '10:00',
      duration: 60,
      notes: 'Cita de prueba',
    },
  });
}
