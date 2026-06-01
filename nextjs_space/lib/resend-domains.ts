/**
 * Resend Domain Management Service
 *
 * Gestiona dominios/subdominios de email multi-tenant via API de Resend.
 * Cada tenant obtiene su propio subdominio (ej: cliente.volkern.app)
 * y los registros DNS se configuran automáticamente vía Cloudflare.
 *
 * API Resend: https://resend.com/docs/api-reference/domains/introduction
 */

const RESEND_API_BASE = 'https://api.resend.com';

interface ResendCredentials {
  apiKey: string;
}

let credentials: ResendCredentials | null = null;

function loadCredentials(): ResendCredentials {
  if (credentials) return credentials;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY no configurada en variables de entorno');
  }

  credentials = { apiKey };
  return credentials;
}

// ─── Tipos ───────────────────────────────────────────────────

export interface ResendDnsRecord {
  record: string;    // TXT, CNAME, MX
  name: string;      // host/name del registro
  value: string;     // valor del registro
  priority?: number; // solo para MX
  ttl?: string;      // time-to-live
}

export interface ResendDomain {
  id: string;
  name: string;       // dominio completo ej: cliente.volkern.app
  status: string;     // not_started, pending, verified, failed
  records: ResendDnsRecord[];
  createdAt: string;
  region?: string;
}

export interface ResendDomainResponse {
  id: string;
  name: string;
  status: string;
  records: ResendDnsRecord[];
  created_at: string;
  region?: string;
}

// ─── API Calls ───────────────────────────────────────────────

async function resendFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const creds = loadCredentials();
  const url = `${RESEND_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${creds.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage: string;
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed.message || parsed.error || errorBody;
    } catch {
      errorMessage = errorBody;
    }
    throw new Error(`Resend API error (${response.status}): ${errorMessage}`);
  }

  return response.json();
}

// ─── Funciones Públicas ──────────────────────────────────────

/**
 * Registra un nuevo dominio/subdominio en Resend.
 * 
 * @param name - Dominio completo ej: "cliente.volkern.app"
 * @param region - Región opcional (us-east-1, eu-west-1, sa-east-1)
 * @returns Dominio creado con registros DNS para configurar
 */
export async function registerDomain(
  name: string,
  region: string = 'eu-west-1'
): Promise<ResendDomain> {
  const data = await resendFetch<ResendDomainResponse>('/domains', {
    method: 'POST',
    body: JSON.stringify({ name, region }),
  });

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    records: data.records,
    createdAt: data.created_at,
    region: data.region,
  };
}

/**
 * Lista todos los dominios registrados en Resend.
 */
export async function listDomains(): Promise<ResendDomain[]> {
  const data = await resendFetch<{ data: ResendDomainResponse[] }>('/domains');
  return (data.data || []).map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    records: d.records,
    createdAt: d.created_at,
    region: d.region,
  }));
}

/**
 * Verifica un dominio en Resend.
 * Los registros DNS deben estar configurados antes de llamar a esto.
 */
export async function verifyDomain(domainId: string): Promise<ResendDomain> {
  const data = await resendFetch<ResendDomainResponse>(`/domains/${domainId}/verify`, {
    method: 'POST',
  });

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    records: data.records,
    createdAt: data.created_at,
    region: data.region,
  };
}

/**
 * Obtiene detalles de un dominio por su ID.
 */
export async function getDomain(domainId: string): Promise<ResendDomain> {
  const data = await resendFetch<ResendDomainResponse>(`/domains/${domainId}`);
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    records: data.records,
    createdAt: data.created_at,
    region: data.region,
  };
}

/**
 * Elimina un dominio de Resend.
 */
export async function deleteDomain(domainId: string): Promise<void> {
  await resendFetch<{ deleted: boolean }>(`/domains/${domainId}`, {
    method: 'DELETE',
  });
}

/**
 * Obtiene la dirección from para un tenant.
 * Ejemplo: "Volkern <noreply@dexpert.volkern.app>"
 * 
 * @param tenantName - Nombre del tenant (ej: "DeXpert")
 * @param subdomain - Subdominio del tenant (ej: "dexpert")
 * @param rootDomain - Dominio raíz (ej: "volkern.app")
 * @returns Dirección from formateada
 */
export function getTenantFromAddress(
  tenantName: string,
  subdomain: string,
  rootDomain: string = 'volkern.app'
): string {
  const emailDomain = `${subdomain}.${rootDomain}`;
  return `${tenantName} <noreply@${emailDomain}>`;
}

/**
 * Construye el dominio de email para un tenant.
 */
export function buildTenantEmailDomain(
  subdomain: string,
  rootDomain: string = 'volkern.app'
): string {
  return `${subdomain}.${rootDomain}`;
}
