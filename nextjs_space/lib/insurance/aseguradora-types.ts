/**
 * Tipos TS para los campos JSON de Aseguradora (Bloques 3-6).
 *
 * Los bloques 1-2 son campos escalares en el modelo; los bloques 3-6
 * se guardan como JSONB tipado en la BD. Estos tipos se usan en:
 *  - API routes (/api/insurance/aseguradoras) para validar/aceptar payloads
 *  - Seed de ejemplo (AXA/MAPFRE)
 *  - Futuras páginas de detalle de aseguradora
 */

// ─── Bloque 3: Contacto y Representación Legal ──────────────────────────────

export interface RepresentanteLegal {
  nombre: string;
  documento: string;
  cargo: string;
}

export interface ContactoOperativo {
  cargo: string; // Director de suscripción, siniestros, contabilidad, soporte técnico/IT
  nombre?: string;
  email?: string;
  telefono?: string;
}

// ─── Bloque 4: Parámetros Operativos y Comerciales ──────────────────────────

export type TipoComision = 'inicial' | 'renovacion' | 'sobre_comision';

export interface ModeloComision {
  nombre: string;
  tipo: TipoComision;
  pct: number;
  aplicaA: 'corredor' | 'agente' | 'ambos';
}

export interface CondicionesPago {
  diasGracia: number;
  politicaCancelacion: string; // p.ej. "Sin pago a los 30 días, se cancela la póliza"
  requiereAnticipo?: boolean;
}

export interface LimitesSuscripcion {
  montoMaximoAutomatico: number;
  moneda?: string;
  requiereAprobacionManual: boolean;
}

export interface GestionSiniestros {
  slaRespuestaHoras: number;
  limiteIndemnizacion: number;
  tipoLimite: 'por_poliza' | 'por_evento' | 'deducible';
  deducible?: number;
}

// ─── Bloque 5: Configuración Financiera y Bancaria ──────────────────────────

export interface CuentaBancaria {
  banco: string;
  tipoCuenta: 'operativa' | 'recaudacion' | 'pago_siniestros' | 'comisiones';
  numeroCuenta: string;
  clabe?: string;
  iban?: string;
  swift?: string;
  moneda?: string;
}

// ─── Bloque 6: Integración Técnica y Seguridad ──────────────────────────────

export type FormatoIntercambio = 'JSON' | 'XML' | 'EDI';

export interface IntegracionApi {
  apiKey?: string;
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    tokenUrl?: string;
  };
  endpoints: {
    staging?: string;
    produccion?: string;
  };
  formatos: FormatoIntercambio[];
  certificados?: {
    ssl?: string;
    firmaDigital?: string;
  };
}

// ─── Contenedor completo (lo que acepta POST/PATCH) ─────────────────────────

export interface AseguradoraBloques3a6 {
  // Bloque 2 (complemento): ramos autorizados (lista de strings)
  ramosAutorizados?: string[];
  representanteLegal?: RepresentanteLegal;
  mesaEntradas?: string;
  contactosOperativos?: ContactoOperativo[];
  modelosComision?: ModeloComision[];
  condicionesPago?: CondicionesPago;
  limitesSuscripcion?: LimitesSuscripcion;
  gestionSiniestros?: GestionSiniestros;
  cuentasBancarias?: CuentaBancaria[];
  monedaBase?: string;
  monedaLiquidacion?: string;
  integracionApi?: IntegracionApi;
}

/** Prefijo sentinel que identifica un valor enmascarado (nunca se persiste). */
export const MASK_PREFIX = '••••';

function maskTail(value: string): string {
  return value.length > 4 ? `${MASK_PREFIX}${value.slice(-4)}` : MASK_PREFIX + '••••';
}

/**
 * Enmascara secretos de integración para respuestas GET (nunca exponer API keys).
 * Devuelve el objeto original si no es un objeto válido.
 */
export function maskIntegracionApi(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const api = raw as IntegracionApi;
  const masked = JSON.parse(JSON.stringify(api)) as IntegracionApi;
  if (masked.apiKey) masked.apiKey = maskTail(masked.apiKey);
  if (masked.oauth?.clientSecret) masked.oauth.clientSecret = MASK_PREFIX + '••••••••';
  if (masked.oauth?.clientId) masked.oauth.clientId = maskTail(masked.oauth.clientId);
  if (masked.certificados?.ssl) masked.certificados.ssl = MASK_PREFIX + '••••••••';
  if (masked.certificados?.firmaDigital) masked.certificados.firmaDigital = MASK_PREFIX + '••••••••';
  return masked;
}

/**
 * Prepara integracionApi para guardar vía PATCH: descarta los campos que
 * llegan enmascarados (prefijo MASK_PREFIX) para no sobrescribir los secretos
 * reales almacenados en BD con el valor enmascarado que devolvió el GET.
 *
 * - Si todo el objeto viene enmascarado (o es null) se devuelve tal cual para
 *   que PATCH pueda limpiarlo/ignorarlo según corresponda.
 * - Los campos no-secretos (endpoints, formatos) se conservan.
 */
export function sanitizeIntegracionApiForSave(raw: unknown): Record<string, any> | undefined {
  // No-objetos (strings, números, etc.) son payloads inválidos: se devuelve
  // undefined para que el caller lo omita/limpie en lugar de persistir basura.
  if (!raw || typeof raw !== 'object') return undefined;
  const api = raw as IntegracionApi;
  const cleaned: Record<string, any> = {
    ...(api.endpoints ? { endpoints: api.endpoints } : {}),
    ...(api.formatos ? { formatos: api.formatos } : {}),
  };
  const isMasked = (v: string | undefined) => typeof v === 'string' && v.startsWith(MASK_PREFIX);
  const isSecret = (v: unknown): v is string | null => typeof v === 'string' || v === null;

  // `!== undefined` (no truthy): un null explícito limpia el campo individual,
  // y undefined/no-enviado se omite. Los valores enmascarados se descartan.
  if (api.apiKey !== undefined && isSecret(api.apiKey) && !isMasked(api.apiKey)) cleaned.apiKey = api.apiKey;
  if (api.oauth) {
    const oauth: Record<string, any> = {};
    if (api.oauth.clientId !== undefined && isSecret(api.oauth.clientId) && !isMasked(api.oauth.clientId)) oauth.clientId = api.oauth.clientId;
    if (api.oauth.clientSecret !== undefined && isSecret(api.oauth.clientSecret) && !isMasked(api.oauth.clientSecret)) oauth.clientSecret = api.oauth.clientSecret;
    if (api.oauth.tokenUrl !== undefined) oauth.tokenUrl = api.oauth.tokenUrl;
    if (Object.keys(oauth).length > 0) cleaned.oauth = oauth;
  }
  if (api.certificados) {
    const cert: Record<string, any> = {};
    if (api.certificados.ssl !== undefined && isSecret(api.certificados.ssl) && !isMasked(api.certificados.ssl)) cert.ssl = api.certificados.ssl;
    if (api.certificados.firmaDigital !== undefined && isSecret(api.certificados.firmaDigital) && !isMasked(api.certificados.firmaDigital)) cert.firmaDigital = api.certificados.firmaDigital;
    if (Object.keys(cert).length > 0) cleaned.certificados = cert;
  }

  // Si después de limpiar no queda nada (todo era masked), devolvemos undefined
  // para que el PATCH sepa que NO debe tocar el campo.
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/**
 * Merge seguro para PATCH: combina el `integracionApi` almacenado en BD con el
 * payload entrante (ya saneado), haciendo **deep-merge** de los objetos anidados
 * (`oauth`, `certificados`, `endpoints`) para no perder secretos reales cuando
 * el cliente reenvía SOLO algunos campos enmascarados.
 *
 * Prisma REEMPLAZA el campo Json completo en `update` (no hace merge), así que
 * este helper construye el objeto final que sí se debe persistir.
 *
 * - `incoming === null` → retorna `null` (limpieza explícita de todo el bloque).
 * - Payload sin campos útiles (todo masked) → retorna `undefined` (el caller no
 *   debe tocar el campo: los secretos reales de BD se conservan tal cual).
 */
export function mergeIntegracionApiForSave(
  current: unknown,
  incoming: unknown
): Record<string, any> | null | undefined {
  if (incoming === null) return null;

  const cleaned = sanitizeIntegracionApiForSave(incoming);
  if (cleaned === undefined) return undefined;

  const base = current && typeof current === 'object' ? (current as Record<string, any>) : {};
  const merged: Record<string, any> = { ...base, ...cleaned };

  // Deep-merge de los objetos anidados: si el cliente reenvía p.ej. solo
  // `oauth.clientId` real + `oauth.clientSecret` enmascarado, se conserva el
  // clientSecret real de la BD en lugar de reemplazar el objeto entero.
  for (const key of ['oauth', 'certificados', 'endpoints'] as const) {
    const b = base[key];
    const c = cleaned[key];
    if (b && c && typeof b === 'object' && typeof c === 'object') {
      merged[key] = { ...b, ...c };
    }
  }

  return merged;
}
