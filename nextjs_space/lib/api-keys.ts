import crypto from 'crypto';

/**
 * Genera una API key única con formato: vk_prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * @returns Objeto con la key original y el hash
 */
export function generateApiKey(type: 'prod' | 'live' = 'prod'): { key: string; keyHash: string; prefix: string } {
  // Generar 32 bytes aleatorios y convertir a hex
  const randomBytes = crypto.randomBytes(32);
  const keyBody = randomBytes.toString('hex'); // 64 caracteres hex
  
  const prefixStr = type === 'prod' ? 'vk_prod_' : 'vk_live_';
  
  // Formato: vk_[type]_[64 caracteres hex]
  const key = `${prefixStr}${keyBody}`;
  
  // Hash SHA256 de la key completa
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  // Prefix para identificación (primeros 8 caracteres después del prefix estructural)
  const prefix = `${prefixStr}${keyBody.substring(0, 8)}`;
  
  return { key, keyHash, prefix };
}

/**
 * Genera el hash SHA256 de una API key para comparación
 * @param key - La API key a hashear
 * @returns Hash SHA256 de la key
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Valida el formato de una API key
 * @param key - La API key a validar
 * @returns true si el formato es válido
 */
export function isValidApiKeyFormat(key: string): boolean {
  // Debe empezar con vk_prod_ o vk_live_ seguido de 64 caracteres hexadecimales
  const regex = /^vk_(prod|live)_[0-9a-f]{64}$/i;
  return regex.test(key);
}

/**
 * Scopes disponibles para las API keys
 */
export const AVAILABLE_SCOPES = [
  // Leads
  'leads:read',
  'leads:write',
  'leads:delete',
  
  // Contacts
  'contacts:read',
  'contacts:write',
  'contacts:delete',
  
  // Deals
  'deals:read',
  'deals:write',
  'deals:delete',
  
  // Messages
  'messages:read',
  'messages:write',
  
  // Tasks
  'tasks:read',
  'tasks:write',
  'tasks:delete',
  
  // Automations
  'automations:read',
  'automations:write',
  'automations:delete',
  
  // Appointments / Citas
  'appointments:read',
  'appointments:write',
  'appointments:delete',
  'citas:read',
  'citas:write',
  'citas:create',
  'citas:delete',
  
  // Campaigns
  'campaigns:read',
  'campaigns:write',
  
  // Analytics
  'analytics:read',
  
  // Webhooks
  'webhooks:read',
  'webhooks:write',
  'webhooks:delete',

  // Agent Skills
  'agent:skill',

  // MCP Server
  'mcp:read',     // Listar tools disponibles
  'mcp:execute',  // Ejecutar tools
  'mcp:admin',    // Gestión y configuración de MCP

  // ========== INTEGRACIONES EXISTENTES ==========
  
  // Mensajería (WhatsApp, Telegram, etc.)
  'messaging:read',
  'messaging:write',
  'messaging:send',
  
  // Telephony (llamadas)
  'telephony:read',
  'telephony:write',
  'telephony:calls',
  
  // Facturación (Stripe, Holded)
  'invoices:read',
  'invoices:write',
  'invoices:create',
  'billing:read',
  'billing:write',
  
  // Google Calendar
  'calendar:read',
  'calendar:write',
  'calendar:webhook',
  
  // Social Media (Instagram, Facebook)
  'social:read',
  'social:write',
  'social:publish',
  
  // n8n / Automations
  'n8n:read',
  'n8n:write',
  'n8n:execute',
  
  // Inventario
  'inventory:read',
  'inventory:write',
  'inventory:adjust',
  
  // Proyectos
  'projects:read',
  'projects:write',
  
  // RRHH / Payroll
  'hr:read',
  'hr:write',
  'payroll:read',
  'payroll:write',
  
  // ERP Produção
  'production:read',
  'production:write',
  
  // Contabilidad
  'accounting:read',
  'accounting:write',
] as const;

export type ApiKeyScope = typeof AVAILABLE_SCOPES[number];

/**
 * Verifica si una API key tiene un scope específico
 * @param scopes - Lista de scopes de la API key
 * @param requiredScope - El scope requerido
 * @returns true si tiene el scope
 */
export function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope);
}

/**
 * Verifica si una API key tiene cualquiera de los scopes requeridos
 * @param scopes - Lista de scopes de la API key
 * @param requiredScopes - Lista de scopes requeridos (al menos uno)
 * @returns true si tiene al menos uno de los scopes
 */
export function hasAnyScope(scopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.some(scope => scopes.includes(scope));
}

/**
 * Extrae la API key del header de una request
 * Soporta dos formatos:
 * - X-API-Key: vk_prod_...
 * - Authorization: Bearer vk_prod_...
 * @param request - La request de Next.js
 * @returns La API key o null si no se encuentra
 */
export function extractApiKeyFromRequest(request: Request): string | null {
  // Intentar obtener de X-API-Key header
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader) {
    return apiKeyHeader;
  }
  
  // Intentar obtener de Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remover 'Bearer '
  }
  
  return null;
}
