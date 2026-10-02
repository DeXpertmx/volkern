import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mcp/docs
 * 
 * Documentación de integración del MCP Server de Volkern
 * Endpoint público que cualquier persona puede acceder para ver cómo usar el API
 */
export async function GET() {
  const docs = {
    name: 'Volkern MCP Server',
    version: '2.0.0',
    baseUrl: 'https://volkern.app/api/mcp',
    description: 'API para conectar agentes IA y automatización con Volkern CRM',
    
    authentication: {
      header: 'X-API-Key',
      format: 'vk_prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      example: 'vk_prod_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      note: 'Crea una API Key desde Volkern → Configuración → API Keys',
      requiredScopes: {
        list: 'mcp:read',
        execute: 'mcp:execute'
      },
      tenantIdentification: {
        description: 'El tenant se determina automáticamente de la API Key, pero puedes sobrescribirlo:',
        header: 'X-Tenant-ID',
        headerAlt: 'X-Impersonate-Tenant-Id',
        example: {
          header: 'X-Tenant-ID: tenant-abc123',
          note: 'Útil para agencias que gestionan múltiples tenants'
        }
      }
    },
    
    endpoints: {
      listTools: {
        method: 'GET',
        path: '/api/mcp',
        description: 'Obtener lista de todas las tools disponibles',
        example: {
          request: 'curl -H "X-API-Key: vk_prod_..." https://volkern.app/api/mcp',
          response: {
            success: true,
            server: { name: 'volkern-crm', version: '2.0.0' },
            tools: [{ name: 'create_contact', description: 'Crear un nuevo contacto', inputSchema: { type: 'object' } }]
          }
        }
      },
      executeTool: {
        method: 'POST',
        path: '/api/mcp',
        description: 'Ejecutar una tool del MCP',
        formats: [
          {
            name: 'Simple (recomendado)',
            example: {
              tool: 'create_contact',
              arguments: {
                nombre: 'Juan Pérez',
                email: 'juan@ejemplo.com',
                telefono: '+5215551234567',
                tenantId: 'tenant-123'
              }
            }
          },
          {
            name: 'JSON-RPC 2.0',
            example: {
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'create_contact',
                arguments: { nombre: 'Juan', email: 'juan@test.com', tenantId: 'xxx' }
              },
              id: 1
            }
          }
        ]
      }
    },
    
    supportedPlatforms: {
      n8n: {
        description: 'Usa HTTP Request node',
        config: {
          url: 'https://volkern.app/api/mcp',
          method: 'POST',
          headers: { 'X-API-Key': 'vk_prod_...', 'Content-Type': 'application/json' },
          body: '{{json()}}'
        }
      },
      zapier: {
        description: 'Usa Webhook → HTTP Request',
        config: {
          url: 'https://volkern.app/api/mcp',
          auth: { type: 'Basic', username: '', password: 'vk_prod_...' }
        }
      },
      make: {
        description: 'Usa HTTP Module',
        config: {
          url: 'https://volkern.app/api/mcp',
          method: 'POST',
          headers: { 'X-API-Key': 'vk_prod_...' }
        }
      },
      claudeDesktop: {
        description: 'Configura en settings.json',
        config: {
          command: 'npx',
          args: ['-y', '@volkern/mcp-server'],
          env: { VOLKERN_API_KEY: 'vk_prod_...' }
        }
      },
      customAgent: {
        description: 'Cualquier agente que soporte REST API',
        config: {
          url: 'https://volkern.app/api/mcp',
          headers: { 'X-API-Key': 'vk_prod_...' }
        }
      }
    },
    
    availableScopes: {
      basic: ['leads:read', 'leads:write', 'contacts:read', 'contacts:write', 'messages:read', 'messages:write'],
      deals: ['deals:read', 'deals:write', 'deals:delete'],
      tasks: ['tasks:read', 'tasks:write', 'tasks:delete'],
      automations: ['automations:read', 'automations:write', 'automations:delete'],
      appointments: ['appointments:read', 'appointments:write', 'citas:read', 'citas:write'],
      marketing: ['campaigns:read', 'campaigns:write'],
      analytics: ['analytics:read'],
      webhooks: ['webhooks:read', 'webhooks:write', 'webhooks:delete'],
      mcp: ['mcp:read', 'mcp:execute', 'mcp:admin'],
      integrations: {
        messaging: ['messaging:read', 'messaging:write', 'messaging:send'],
        telephony: ['telephony:read', 'telephony:write', 'telephony:calls'],
        billing: ['invoices:read', 'invoices:write', 'invoices:create', 'billing:read', 'billing:write'],
        calendar: ['calendar:read', 'calendar:write', 'calendar:webhook'],
        social: ['social:read', 'social:write', 'social:publish'],
        n8n: ['n8n:read', 'n8n:write', 'n8n:execute'],
        inventory: ['inventory:read', 'inventory:write', 'inventory:adjust'],
        projects: ['projects:read', 'projects:write'],
        hr: ['hr:read', 'hr:write', 'payroll:read', 'payroll:write'],
        production: ['production:read', 'production:write'],
        accounting: ['accounting:read', 'accounting:write']
      }
    },
    
    availableTools: {
      contacts: ['create_contact', 'update_contact', 'get_contact', 'find_contact_by_email'],
      leads: ['create_lead', 'get_lead', 'find_lead_by_email', 'convert_lead'],
      conversations: ['create_conversation', 'get_conversation', 'get_or_create_conversation', 'send_message', 'close_conversation'],
      tasks: ['create_task', 'complete_task', 'get_tasks_by_lead', 'get_pending_tasks'],
      notes: ['create_note', 'get_notes_by_lead'],
      bookings: ['create_booking', 'confirm_booking', 'cancel_booking', 'get_bookings_by_lead', 'get_upcoming_bookings'],
      deals: ['create_deal', 'update_deal', 'get_deal', 'list_deals', 'prequalify_lead'],
      catalog: ['export_catalog', 'get_catalog_field_definitions', 'get_catalog_item', 'search_catalog'],
      finance: ['create_supplier', 'create_expense', 'analyze_burn_rate'],
      inventory: ['adjust_stock', 'get_inventory_health'],
      projects: ['get_project_profitability'],
      hr: ['talent_retention_risk', 'get_employee_confidential_data', 'get_hr_daily_brief', 'authorize_bulk_expenses'],
      production: ['calculate_production_cost'],
      quality: ['detect_quality_anomalies'],
      marketing: ['generate_marketing_copy', 'analyze_marketing_sentiment', 'suggest_campaign_optimization', 'generate_web_creator_block', 'generate_seo_metadata']
    },
    
    errorCodes: {
      401: 'API Key inválida o sin permisos suficientes',
      403: 'Scope requerido no disponible',
      429: 'Rate limit excedido (100 req/min)',
      500: 'Error interno del servidor'
    },
    
    rateLimits: {
      requests: 100,
      window: '1 minute',
      per: 'API Key'
    },
    
    support: {
      email: 'soporte@volkern.app',
      docs: 'https://docs.volkern.app'
    }
  };

  return NextResponse.json(docs);
}