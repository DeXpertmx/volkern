export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST - Probar conexión de una integración
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const data = await request.json();
    const { tipo, credenciales } = data;

    if (!tipo || !credenciales) {
      return NextResponse.json(
        { error: 'Tipo y credenciales son requeridos' },
        { status: 400 }
      );
    }

    // Probar la conexión según el tipo
    let resultado;
    try {
      switch (tipo) {
        case 'twilio':
        case 'whatsapp_twilio':
          resultado = await probarTwilio(credenciales);
          break;
        case 'evolution':
          resultado = await probarEvolution(credenciales);
          break;
        case 'anytimebot':
          resultado = await probarAnytimebot(credenciales);
          break;
        case 'meta_pixel':
          resultado = { success: true, mensaje: 'Pixel ID válido (no se puede verificar sin página web)' };
          break;
        case 'ga4':
          resultado = { success: true, mensaje: 'Measurement ID válido (no se puede verificar sin página web)' };
          break;
        case 'mailchimp':
          resultado = await probarMailchimp(credenciales);
          break;
        case 'brevo':
          resultado = await probarBrevo(credenciales);
          break;
        case 'telegram':
          resultado = await probarTelegram(credenciales);
          break;
        case 'meta':
          resultado = await probarMeta(credenciales);
          break;
        case 'stripe_invoicing':
          resultado = { success: true, mensaje: 'Stripe Invoicing habilitado (se usará la configuración general de Stripe)' };
          break;
        case 'square':
          resultado = await probarSquare(credenciales);
          break;
        case 'gocardless':
          resultado = await probarGoCardless(credenciales);
          break;
        default:
          resultado = { success: false, mensaje: 'Tipo de integración no soportado para pruebas' };
      }
    } catch (error: any) {
      resultado = { success: false, mensaje: error.message || 'Error al probar conexión' };
    }

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('Error al probar integración:', error);
    return NextResponse.json(
      { error: 'Error al probar integración' },
      { status: 500 }
    );
  }
}

// Funciones auxiliares para probar cada integración
async function probarTwilio(credenciales: any) {
  const accountSid = credenciales.accountSid || credenciales.account_sid;
  const authToken = credenciales.authToken || credenciales.auth_token;
  
  if (!accountSid || !authToken) {
    return { success: false, mensaje: 'Account SID y Auth Token son requeridos' };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
        }
      }
    );

    if (response.ok) {
      return { success: true, mensaje: 'Conexión a Twilio exitosa' };
    } else {
      return { success: false, mensaje: 'Credenciales de Twilio inválidas' };
    }
  } catch (error) {
    return { success: false, mensaje: 'Error al conectar con Twilio' };
  }
}

async function probarEvolution(credenciales: any) {
  const { api_key, instance_name, api_url } = credenciales;
  
  if (!api_key || !instance_name) {
    return { 
      success: false, 
      mensaje: 'API Key e Instance Name son requeridos' 
    };
  }

  const baseUrl = api_url || 'https://evo.abacus.ai';
  
  console.log('🧪 Probando conexión Evolution API...');
  console.log('📍 URL:', baseUrl);
  console.log('🔑 Instance:', instance_name);

  try {
    // Intentar obtener el estado de la instancia
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${baseUrl}/instance/connectionState/${instance_name}`, {
      method: 'GET',
      headers: {
        'apikey': api_key,
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('📡 Status code:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Respuesta exitosa:', data);
      
      const state = data.instance?.state || data.state || 'unknown';
      
      return { 
        success: true, 
        mensaje: `✅ Conexión exitosa. Estado de la instancia: ${state}`,
        instanceState: state
      };
    } else if (response.status === 404) {
      return { 
        success: false, 
        mensaje: `❌ Instancia "${instance_name}" no encontrada. Verifica el nombre de la instancia.`,
        hint: 'Asegúrate de que el nombre de la instancia sea correcto y esté activa en Evolution API.'
      };
    } else if (response.status === 401 || response.status === 403) {
      return { 
        success: false, 
        mensaje: '❌ API Key inválida o sin permisos. Verifica tus credenciales.'
      };
    } else {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      return { 
        success: false, 
        mensaje: `❌ Error al conectar con Evolution API (HTTP ${response.status})`,
        details: errorText
      };
    }
  } catch (error: any) {
    console.error('❌ Error al probar Evolution API:', error);
    
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        mensaje: '⏱️ Tiempo de espera agotado. La API de Evolution no respondió.',
        hint: 'Verifica que la URL de la API sea correcta y esté accesible.'
      };
    }
    
    return { 
      success: false, 
      mensaje: '❌ Error al conectar con Evolution API',
      details: error.message
    };
  }
}

async function probarMailchimp(credenciales: any) {
  const { apiKey } = credenciales;
  
  // Extraer datacenter del API key (ej: us1, us2, etc)
  const datacenter = apiKey.split('-').pop();
  
  try {
    const response = await fetch(
      `https://${datacenter}.api.mailchimp.com/3.0/ping`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    if (response.ok) {
      return { success: true, mensaje: 'Conexión a Mailchimp exitosa' };
    } else {
      return { success: false, mensaje: 'API Key de Mailchimp inválida' };
    }
  } catch (error) {
    return { success: false, mensaje: 'Error al conectar con Mailchimp' };
  }
}

async function probarBrevo(credenciales: any) {
  const { apiKey } = credenciales;
  
  try {
    const response = await fetch(
      'https://api.brevo.com/v3/account',
      {
        headers: {
          'api-key': apiKey
        }
      }
    );

    if (response.ok) {
      return { success: true, mensaje: 'Conexión a Brevo exitosa' };
    } else {
      return { success: false, mensaje: 'API Key de Brevo inválida' };
    }
  } catch (error) {
    return { success: false, mensaje: 'Error al conectar con Brevo' };
  }
}

async function probarAnytimebot(credenciales: any) {
  const { username } = credenciales;
  
  if (!username) {
    return { success: false, mensaje: 'Username de Anytimebot requerido' };
  }

  // Extract username from URL if full URL was provided
  let cleanUsername = username.trim();
  if (cleanUsername.includes('anytimebot.app')) {
    const match = cleanUsername.match(/anytimebot\.app\/(?:username\/)?([^\/\?]+)/i);
    if (match) {
      cleanUsername = match[1];
    }
  }
  
  console.log(`[Test] Testing Anytimebot username: ${cleanUsername}`);
  
  try {
    // Use the correct API endpoint to verify bot config with longer timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds
    
    const url = `https://anytimebot.app/api/bot/public-config?username=${encodeURIComponent(cleanUsername)}`;
    console.log(`[Test] Fetching: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`[Test] Response status: ${response.status}`);

    if (response.ok) {
      const botConfig = await response.json();
      console.log(`[Test] Bot found: ${botConfig.name}`);
      return { 
        success: true, 
        mensaje: `✅ Bot "${botConfig.name || cleanUsername}" encontrado y conectado`,
        username: cleanUsername,
        botConfig
      };
    } else if (response.status === 404) {
      console.log(`[Test] Bot not found: ${cleanUsername}`);
      return { 
        success: false, 
        mensaje: `❌ Username "${cleanUsername}" no encontrado`,
        hint: 'El username aparece en la URL de tu bot: anytimebot.app/USERNAME'
      };
    } else {
      const errorText = await response.text().catch(() => '');
      console.error(`[Test] Error response: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        mensaje: `Error ${response.status}: ${response.statusText || 'No se pudo verificar el bot'}`
      };
    }
  } catch (error: any) {
    console.error('[Test] Error testing Anytimebot connection:', error);
    if (error.name === 'AbortError') {
      return { 
        success: false, 
        mensaje: '⏱️ La verificación tomó demasiado tiempo. Intenta de nuevo o verifica tu conexión.'
      };
    }
    return { 
      success: false, 
      mensaje: `❌ Error al conectar: ${error.message || 'Error de red'}`
    };
  }
}

async function probarTelegram(credenciales: any) {
  const { bot_token } = credenciales;
  
  if (!bot_token) {
    return { success: false, mensaje: 'Bot Token de Telegram requerido' };
  }
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${bot_token}/getMe`,
      {
        method: 'GET'
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.ok && data.result) {
        return { 
          success: true, 
          mensaje: `✅ Bot "${data.result.username}" conectado exitosamente`,
          botInfo: data.result
        };
      } else {
        return { success: false, mensaje: 'Token inválido' };
      }
    } else {
      return { success: false, mensaje: 'Bot Token de Telegram inválido' };
    }
  } catch (error) {
    return { success: false, mensaje: 'Error al conectar con Telegram' };
  }
}

async function probarMeta(credenciales: any) {
  const { page_access_token, page_id } = credenciales;
  
  if (!page_access_token || !page_id) {
    return { success: false, mensaje: 'Page Access Token y Page ID requeridos' };
  }
  
  try {
    // Verificar el token y obtener info de la página
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${page_id}?fields=name,id&access_token=${page_access_token}`,
      {
        method: 'GET'
      }
    );

    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        mensaje: `✅ Página "${data.name}" conectada exitosamente`,
        pageInfo: data
      };
    } else {
      const error = await response.json();
      return { 
        success: false, 
        mensaje: `Token o Page ID inválidos: ${error.error?.message || 'Error desconocido'}` 
      };
    }
  } catch (error: any) {
    return { 
      success: false, 
      mensaje: `Error al conectar con Meta: ${error.message || 'Error de red'}` 
    };
  }
}

async function probarSquare(credenciales: any) {
  const { accessToken, environment, locationId } = credenciales;
  
  if (!accessToken || !locationId) {
    return { success: false, mensaje: 'Access Token y Location ID requeridos' };
  }

  try {
    const { SquareClient, SquareEnvironment } = await import('square');
    const client = new SquareClient({
      token: accessToken,
      environment: environment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
    });

    // Intentar obtener detalles de locaciones
    const { locations } = await client.locations.list({});
    
    // Verificar si la locationId existe en la lista
    const locationExists = locations?.some(loc => loc.id === locationId);

    if (locationExists) {
      const location = locations?.find(loc => loc.id === locationId);
      return { 
        success: true, 
        mensaje: `✅ Conexión a Square exitosa. Ubicación: ${location?.name || locationId}`,
        locationInfo: location
      };
    } else {
      return { 
        success: false, 
        mensaje: `❌ Conexión exitosa pero no se encontró la ubicación "${locationId}".` 
      };
    }
  } catch (error: any) {
    console.error('Error al probar Square:', error);
    return { 
      success: false, 
      mensaje: `Error al conectar con Square: ${error.message || 'Error de red'}` 
    };
  }
}

async function probarGoCardless(credenciales: any) {
  const { accessToken, environment } = credenciales;
  
  if (!accessToken) {
    return { success: false, mensaje: 'Access Token requerido' };
  }

  try {
    const gocardless = (await import('gocardless-nodejs')).default;
    const { Environments: GCEnvironments } = await import('gocardless-nodejs');
    
    const gcEnvironment = environment === 'live' ? GCEnvironments.Live : GCEnvironments.Sandbox;
    const client = gocardless(accessToken, gcEnvironment);

    // Intentar obtener info del acreedor (creditor)
    const response = await (client.creditors as any).list({});
    const creditors = (response as any).creditors || response;
    
    if (Array.isArray(creditors) && creditors.length > 0) {
      return { 
        success: true, 
        mensaje: `✅ Conexión a GoCardless exitosa. Organización: ${creditors[0].name || 'Desconocida'}`,
        orgInfo: creditors[0]
      };
    } else {
      return { 
        success: true, 
        mensaje: '✅ Conexión a GoCardless exitosa (no se encontraron datos de acreedor aún).' 
      };
    }
  } catch (error: any) {
    console.error('Error al probar GoCardless:', error);
    return { 
      success: false, 
      mensaje: `Error al conectar con GoCardless: ${error.message || 'Error de red'}` 
    };
  }
}
