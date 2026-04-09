export const dynamic = 'force-dynamic';

/**
 * Endpoint de diagnóstico para Evolution API
 * Prueba la conectividad y configuración
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://api.dimension.expert';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const results: any = {
      timestamp: new Date().toISOString(),
      config: {
        url: EVOLUTION_API_URL,
        hasApiKey: !!EVOLUTION_API_KEY,
        apiKeyLength: EVOLUTION_API_KEY?.length || 0
      },
      tests: {}
    };

    // Test 1: Verificar conectividad básica
    console.log('🧪 Test 1: Verificando conectividad con Evolution API...');
    try {
      const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
        method: 'GET',
        headers: {
          'apikey': EVOLUTION_API_KEY
        }
      });

      results.tests.connectivity = {
        success: response.ok,
        status: response.status,
        message: response.ok ? 'Conexión exitosa' : 'Error de conexión'
      };

      if (response.ok) {
        const data = await response.json();
        results.tests.connectivity.instanceCount = Array.isArray(data) ? data.length : 0;
        console.log('✅ Test 1 exitoso: ', results.tests.connectivity);
      } else {
        const errorText = await response.text();
        results.tests.connectivity.error = errorText;
        console.log('❌ Test 1 falló:', errorText);
      }
    } catch (error) {
      results.tests.connectivity = {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
      console.log('❌ Test 1 falló con excepción:', error);
    }

    // Test 2: Obtener instancia del usuario si existe
    console.log('🧪 Test 2: Verificando instancia del usuario...');
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          whatsappInstances: true
        }
      });

      const userInstance = user?.whatsappInstances?.[0];
      
      results.tests.userInstance = {
        hasInstance: !!userInstance,
        instanceName: userInstance?.instanceName,
        status: userInstance?.status
      };

      if (userInstance) {
        // Test 2.1: Verificar estado de la instancia en Evolution API
        console.log('🧪 Test 2.1: Verificando estado de instancia en Evolution API...');
        try {
          const statusResponse = await fetch(
            `${EVOLUTION_API_URL}/instance/connectionState/${userInstance.instanceName}`,
            {
              method: 'GET',
              headers: {
                'apikey': EVOLUTION_API_KEY
              }
            }
          );

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            results.tests.userInstance.evolutionStatus = statusData;
            console.log('✅ Test 2.1 exitoso:', statusData);
          } else {
            const errorText = await statusResponse.text();
            results.tests.userInstance.evolutionError = errorText;
            console.log('❌ Test 2.1 falló:', errorText);
          }
        } catch (error) {
          results.tests.userInstance.evolutionError = error instanceof Error ? error.message : 'Error desconocido';
          console.log('❌ Test 2.1 falló con excepción:', error);
        }
      }

      console.log('✅ Test 2 completado:', results.tests.userInstance);
    } catch (error) {
      results.tests.userInstance = {
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
      console.log('❌ Test 2 falló:', error);
    }

    // Test 3: Verificar configuración de webhooks (si hay instancia)
    if (results.tests.userInstance?.instanceName) {
      console.log('🧪 Test 3: Verificando configuración de webhooks...');
      try {
        const webhookResponse = await fetch(
          `${EVOLUTION_API_URL}/webhook/find/${results.tests.userInstance.instanceName}`,
          {
            method: 'GET',
            headers: {
              'apikey': EVOLUTION_API_KEY
            }
          }
        );

        if (webhookResponse.ok) {
          const webhookData = await webhookResponse.json();
          results.tests.webhookConfig = {
            configured: webhookData.enabled,
            url: webhookData.url,
            events: webhookData.events
          };
          console.log('✅ Test 3 exitoso:', results.tests.webhookConfig);
        } else {
          const errorText = await webhookResponse.text();
          results.tests.webhookConfig = {
            configured: false,
            error: errorText
          };
          console.log('❌ Test 3: No hay webhook configurado o error:', errorText);
        }
      } catch (error) {
        results.tests.webhookConfig = {
          configured: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        };
        console.log('❌ Test 3 falló:', error);
      }
    }

    // Test 4: Intentar crear una instancia de prueba (solo si action=create-test)
    if (action === 'create-test') {
      console.log('🧪 Test 4: Creando instancia de prueba...');
      const testInstanceName = `test_${Date.now()}`;
      
      try {
        const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY
          },
          body: JSON.stringify({
            instanceName: testInstanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
          })
        });

        if (createResponse.ok) {
          const createData = await createResponse.json();
          results.tests.createInstance = {
            success: true,
            instanceName: testInstanceName,
            data: createData
          };
          console.log('✅ Test 4 exitoso:', results.tests.createInstance);

          // Intentar eliminar la instancia de prueba
          try {
            await fetch(`${EVOLUTION_API_URL}/instance/delete/${testInstanceName}`, {
              method: 'DELETE',
              headers: {
                'apikey': EVOLUTION_API_KEY
              }
            });
            console.log('✅ Instancia de prueba eliminada');
          } catch (error) {
            console.log('⚠️ No se pudo eliminar instancia de prueba:', error);
          }
        } else {
          const errorText = await createResponse.text();
          results.tests.createInstance = {
            success: false,
            error: errorText
          };
          console.log('❌ Test 4 falló:', errorText);
        }
      } catch (error) {
        results.tests.createInstance = {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        };
        console.log('❌ Test 4 falló con excepción:', error);
      }
    }

    // Test 5: Verificar que la URL de webhook sea accesible
    console.log('🧪 Test 5: Verificando accesibilidad de webhook URL...');
    const webhookBaseUrl = process.env.NEXTAUTH_URL || 'https://volkern.app';
    results.tests.webhookUrl = {
      url: webhookBaseUrl,
      testEndpoint: `${webhookBaseUrl}/api/webhook/evolution/test-instance`
    };

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido en diagnóstico'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Endpoint de diagnóstico de Evolution API',
    usage: 'POST con body: { "action": "basic" | "create-test" }',
    actions: {
      basic: 'Ejecuta tests básicos de conectividad',
      'create-test': 'Ejecuta tests incluyendo creación de instancia de prueba'
    }
  });
}
