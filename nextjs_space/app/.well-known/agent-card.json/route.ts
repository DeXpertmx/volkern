export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'

/**
 * /.well-known/agent-card.json — A2A Protocol Agent Card (spec 1.0).
 *
 * Tarjeta de descubrimiento agente-a-agente del agente Volkern (CRM/ERP).
 * El agente se comunica por HTTP+JSON sobre la Skills API (JSON-RPC-like):
 * POST /api/skills/user/{userId}/execute con una API key (header x-api-key
 * o Authorization: Bearer vk_*). Cada skill listada es una capacidad real
 * del sistema (ver lib/skills/index.ts).
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  const card = {
    name: 'Volkern CRM/ERP Agent',
    description:
      'Agente de Volkern (CRM/ERP multi-tenant) que ejecuta operaciones de negocio por chat: contactos y leads, tareas, citas y bookings, gastos y facturación, inventario, RRHH, producción y marketing. Interactúa enviando mensajes JSON-RPC a la Skills API con una API key de tenant.',
    version: '1.0.0',
    protocolVersion: '1.0',
    url: `${baseUrl}/api/skills/user/{userId}/execute`,
    documentationUrl: `${baseUrl}/docs/developers`,
    provider: {
      organization: 'Volkern',
      url: baseUrl,
    },
    supportedInterfaces: [
      {
        url: `${baseUrl}/api/skills/user/{userId}/execute`,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      extendedAgentCard: false,
      extensions: [
        {
          uri: 'https://github.com/google-agentic-commerce/AP2/tree/v0.1.0',
          description: 'Volkern actúa como agente merchant para flujos de comercio iniciados por agentes.',
          required: true,
          params: {
            roles: ['merchant'],
          },
        },
      ],
    },
    defaultInputModes: ['text/plain', 'text/markdown', 'application/json'],
    defaultOutputModes: ['text/plain', 'text/markdown', 'application/json'],
    skills: [
      {
        id: 'tasks',
        name: 'Gestión de tareas',
        description:
          'Crea, completa, reprograma y consulta tareas (pendientes, vencidas, de hoy) del usuario, con botones inline de Telegram.',
        tags: ['tareas', 'tasks', 'seguimiento', 'agenda'],
        examples: ['crea una tarea para llamar a Juan mañana a las 10', 'qué tareas tengo vencidas', 'completa la tarea de enviar propuesta'],
      },
      {
        id: 'leads',
        name: 'Gestión de leads y contactos',
        description:
          'Crea, actualiza, busca y convierte leads y contactos del CRM, registra interacciones y detecta ausencia de respuesta.',
        tags: ['leads', 'contactos', 'crm', 'ventas'],
        examples: ['crea un lead para María López con email maria@empresa.com', 'registra una llamada con Juan', 'qué leads están sin respuesta'],
      },
      {
        id: 'bookings',
        name: 'Citas y bookings',
        description:
          'Agenda, confirma y cancela citas (Google Meet/Calendar), consulta las próximas y resuelve la disponibilidad del usuario.',
        tags: ['citas', 'bookings', 'agenda', 'calendar'],
        examples: ['agenda una reunión por Google Meet con Ana mañana a las 4pm', 'qué citas tengo esta semana', 'cancela mi cita de mañana'],
      },
      {
        id: 'expenses',
        name: 'Gastos y proveedores',
        description:
          'Registra gastos, crea y lista proveedores, autoriza gastos pendientes (individuales o en lote) y resume gastos por autorizar.',
        tags: ['gastos', 'expenses', 'proveedores', 'finanzas'],
        examples: ['registra un gasto de 120€ en suministros', 'qué gastos están pendientes de autorizar', 'autoriza todos los gastos pendientes'],
      },
      {
        id: 'invoicing',
        name: 'Facturación',
        description:
          'Crea, rectifica y cancela facturas con sello Veri*factu, consulta el estado fiscal y las integraciones de facturación.',
        tags: ['facturas', 'invoices', 'verifactu', 'facturacion'],
        examples: ['crea una factura de 500€ para María', 'qué facturas están pendientes', 'estado fiscal de la factura F-00042'],
      },
      {
        id: 'inventory',
        name: 'Inventario',
        description:
          'Ajusta stock de productos, consulta la salud del inventario y procesa consumos de materiales con registro auditable.',
        tags: ['inventario', 'inventory', 'stock', 'almacen'],
        examples: ['mueve la caja de jabones del almacén 1 al 2', 'qué productos están por debajo del stock mínimo'],
      },
      {
        id: 'payroll',
        name: 'Nómina y RRHH',
        description:
          'Ejecuta nómina sellada con envío a AEAT, aprueba vacaciones por voz, detecta anomalías de presencia y gestiona altas de empleados.',
        tags: ['nomina', 'rrhh', 'payroll', 'empleados'],
        examples: ['ejecuta la nómina de julio', 'aprueba mis vacaciones', 'detecta anomalías de presencia esta semana'],
      },
      {
        id: 'email',
        name: 'Email y comunicaciones',
        description:
          'Envía emails desde Telegram con la firma del usuario y su link de booking, gestiona conversaciones y sincroniza WhatsApp/Chatwoot.',
        tags: ['email', 'comunicaciones', 'mensajes', 'whatsapp'],
        examples: ['envía un email a Alejandra agradeciendo la reunión', 'qué mensajes tengo sin asignar'],
      },
    ],
    securitySchemes: {
      apiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key de tenant con formato vk_prod_/vk_live_ + 64 hex. Se emite en /dashboard/developers y se muestra una sola vez.',
      },
      bearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'La misma API key como Authorization: Bearer vk_*.',
      },
    },
    security: [{ apiKeyHeader: [] }, { bearer: [] }],
  }

  return NextResponse.json(card, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
