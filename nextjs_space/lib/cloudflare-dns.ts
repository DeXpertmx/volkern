/**
 * Cloudflare DNS Automation Service
 *
 * Automatiza la creación de registros DNS para dominios de email
 * multi-tenant. Cuando Resend registra un subdominio, devuelve
 * registros DNS (TXT, CNAME, MX) que deben configurarse en Cloudflare.
 *
 * Prerequisito: CLOUDFLARE_API_TOKEN con permisos Zone:DNS:Edit
 * en la zona correspondiente (volkern.app).
 */

// ─── Tipos ───────────────────────────────────────────────────

export interface DnsRecord {
  type: string;      // TXT, CNAME, MX, etc.
  name: string;      // nombre del registro (relativo a la zona)
  content: string;   // valor
  priority?: number; // para MX
  ttl?: number;      // 1 = Auto, 120-7200 normalmente
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

export interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

// ─── Configuración ──────────────────────────────────────────

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

function getApiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN no configurado. ' +
      'Crea un token en https://dash.cloudflare.com/profile/api-tokens ' +
      'con permisos Zone:DNS:Edit para la zona volkern.app'
    );
  }
  return token;
}

// ─── API Calls ──────────────────────────────────────────────

async function cfFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<CloudflareApiResponse<T>> {
  const token = getApiToken();

  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data: CloudflareApiResponse<T> = await response.json();

  if (!data.success) {
    const errorDetail = data.errors?.map(e => `${e.code}: ${e.message}`).join('; ') || 'Unknown error';
    throw new Error(`Cloudflare API error (${response.status}): ${errorDetail}`);
  }

  return data;
}

// ─── Funciones Públicas ──────────────────────────────────────

/**
 * Busca una zona en Cloudflare por nombre de dominio.
 */
export async function getZone(domainName: string): Promise<CloudflareZone | null> {
  const data = await cfFetch<CloudflareZone[]>(
    `/zones?name=${encodeURIComponent(domainName)}&status=active`
  );
  return data.result?.[0] || null;
}

/**
 * Añade un registro DNS a una zona de Cloudflare.
 */
export async function createDnsRecord(
  zoneId: string,
  record: DnsRecord
): Promise<void> {
  const body: Record<string, any> = {
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl ?? 120,
  };

  if (record.priority !== undefined) {
    body.priority = record.priority;
  }

  await cfFetch(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Elimina un registro DNS existente por nombre y tipo.
 */
export async function deleteDnsRecord(
  zoneId: string,
  recordName: string,
  recordType: string
): Promise<void> {
  // Buscar el registro primero
  const searchResult = await cfFetch<any[]>(
    `/zones/${zoneId}/dns_records?type=${recordType}&name=${encodeURIComponent(recordName)}`
  );

  const records = searchResult.result || [];
  for (const r of records) {
    await cfFetch(`/zones/${zoneId}/dns_records/${r.id}`, {
      method: 'DELETE',
    });
  }
}

/**
 * Configura todos los registros DNS necesarios para un dominio de email.
 * Recibe los records que devuelve Resend al registrar un dominio.
 */
export async function configureEmailDnsRecords(
  zoneId: string,
  subdomain: string,
  resendRecords: Array<{
    record: string;   // tipo DNS: TXT, CNAME, MX
    name: string;     // nombre del registro
    value: string;    // valor
    priority?: number;
  }>
): Promise<{ configured: number; failed: number; errors: string[] }> {
  let configured = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const rec of resendRecords) {
    try {
      // Resend devuelve nombres completos (ej: _dmarc.cliente.volkern.app)
      // Cloudflare espera nombres relativos a la zona (ej: _dmarc.cliente)
      // Extraemos la parte relativa quitando el dominio raíz
      let recordName = rec.name;
      // Si el nombre termina en el dominio raíz, lo quitamos para Cloudflare
      const rootDomain = process.env.ROOT_DOMAIN || 'volkern.app';
      const suffix = `.${rootDomain}`;
      if (recordName.endsWith(suffix)) {
        recordName = recordName.slice(0, -suffix.length);
      }
      // Si queda vacío (ej: el root domain itself), usar '@' para Cloudflare
      if (!recordName) {
        recordName = '@';
      }

      await createDnsRecord(zoneId, {
        type: rec.record,
        name: recordName,
        content: rec.value,
        priority: rec.priority,
        ttl: 120,
      });

      configured++;
    } catch (error: any) {
      failed++;
      errors.push(`Failed to create ${rec.record} record for ${rec.name}: ${error.message}`);
    }
  }

  return { configured, failed, errors };
}

/**
 * Obtiene el zone ID de Cloudflare para el dominio raíz.
 * Usa el dominio raíz configurado o 'volkern.app' por defecto.
 */
export async function getRootZoneId(
  rootDomain: string = 'volkern.app'
): Promise<string> {
  const zone = await getZone(rootDomain);
  if (!zone) {
    throw new Error(
      `No se encontró la zona '${rootDomain}' en Cloudflare. ` +
      `Asegúrate de que el dominio está añadido a Cloudflare y el API token tiene acceso.`
    );
  }
  return zone.id;
}
