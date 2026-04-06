export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { testPlaudernChat, getPlaudernBots, checkPlaudernHealth } from '@/lib/plaudern';

/**
 * POST - Probar integración de Plaudern
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { testType, apiKey, botId, message, integrationId } = body;

    // Si no se proporciona apiKey, usar la integración existente
    let finalApiKey = apiKey;
    let finalBotId = botId;
    let finalIntegrationId = integrationId || 'volkern-prod';

    if (!finalApiKey) {
      const integration = await prisma.plaudernIntegration.findUnique({
        where: { tenantId: user.tenantId },
      });

      if (!integration) {
        return NextResponse.json(
          { error: 'No hay integración configurada' },
          { status: 400 }
        );
      }

      finalApiKey = integration.apiKey;
      finalBotId = integration.botId;
      // Use tenant-specific integration ID if configured
      if (integration.botName) {
        finalIntegrationId = integration.botName.toLowerCase().replace(/\s+/g, '-');
      }
    }

    if (!finalApiKey) {
      return NextResponse.json(
        { error: 'API Key requerida' },
        { status: 400 }
      );
    }

    // Diferentes tipos de prueba
    switch (testType) {
      case 'connection':
        try {
          // Probar conexión básica con integration ID
          console.log(`🔍 Testing Plaudern connection with Integration ID: ${finalIntegrationId}`);
          
          // 1. Health check (NO requiere autenticación)
          const health = await checkPlaudernHealth(finalIntegrationId);
          console.log(`✓ Health check passed:`, health);
          
          // 2. Listar bots (SÍ requiere autenticación con JWT)
          const bots = await getPlaudernBots(finalApiKey, finalIntegrationId);
          console.log(`✓ Found ${bots.length} bots`);

          return NextResponse.json({
            success: true,
            message: 'Conexión exitosa con Plaudern',
            integrationId: finalIntegrationId,
            health,
            bots: bots.map(bot => ({
              id: bot.id,
              name: bot.name,
              status: bot.status,
            })),
          });
        } catch (error: any) {
          console.error('❌ Error en prueba de conexión:', error);
          return NextResponse.json({
            success: false,
            error: 'Error al conectar con Plaudern',
            details: error.message,
            hint: 'Verifica que tu API Key (JWT Token) sea correcta, que tenga los permisos necesarios y que el servicio de Plaudern esté disponible. El token debe empezar con "eyJ..." y tener formato JWT válido.',
          }, { status: 400 });
        }

      case 'chat':
        try {
          // Probar chat con IA
          if (!message) {
            return NextResponse.json(
              { error: 'Mensaje requerido para probar chat' },
              { status: 400 }
            );
          }

          const chatResponse = await testPlaudernChat(
            finalApiKey,
            message,
            finalBotId,
            finalIntegrationId
          );

          return NextResponse.json({
            success: true,
            message: 'Chat probado exitosamente',
            integrationId: finalIntegrationId,
            response: chatResponse.response,
            sources: chatResponse.sources,
          });
        } catch (error: any) {
          console.error('Error en prueba de chat:', error);
          return NextResponse.json({
            success: false,
            error: 'Error al probar el chat',
            details: error.message,
            hint: 'Asegúrate de que tu API Key (JWT Token) tenga los permisos necesarios.',
          }, { status: 400 });
        }

      default:
        return NextResponse.json(
          { error: 'Tipo de prueba no válido' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error testing Plaudern:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error al probar integración de Plaudern',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
