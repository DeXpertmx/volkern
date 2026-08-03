/**
 * InsurerConnector — Interfaz abstracta para integraciones con aseguradoras
 *
 * Por qué existe: cuando hablamos de Fase 5 del vertical Insurance
 * (TIREA, Quálitas, GNP, AXA, etc.) cada aseguradora expone APIs con
 * shapes incompatibles entre sí. Sin una abstracción, cada consumidor
 * tendría que ramificarse por proveedor.
 *
 * Esta interfaz es el espejo de `AdPlatformConnector` en `lib/ads/types.ts`:
 * - Cada proveedor expone UNA clase que implementa la interfaz.
 * - Un factory `getInsurerConnector(slug)` resuelve connector por nombre canónico.
 * - Las implementaciones pueden ser reales (vs API REST de la aseguradora) o
 *   mockeadas (`MockQualitasConnector`, `MockGnpConnector`, …) — la interfaz
 *   es idéntica para que el caller no ramifique.
 *
 * El "modo mock" es crítico para Fase 5: NO requiere Partner Engineering.
 * Ship primero con mocks deterministas (respuestas realistas), swap por la
 * integración real cuando se firme el acuerdo.
 *
 * Convenciones:
 * - Métodos async retornan Promises que SIEMPRE resuelven o lanzan con
 *   códigos de error tipados (`ConnectorErrorCode`).
 * - Ningún método toca Prisma directamente — el caller (skill o route) debe
 *   mapear el resultado a la tabla interna.
 * - `moneda` siempre presente en respuestas, normalizado vía `Currency`.
 */

import type { Currency } from '@/lib/insurance/currency';

// ─── Aseguradoras soportadas ────────────────────────────────────────────────

export type InsurerSlug =
  | 'qualitas'    // 🇲🇽 México — autos
  | 'gnp'         // 🇲🇽 México — multi-ramo
  | 'axa-mx'      // 🇲🇽 México — multi-ramo
  | 'seguros-monterrey' // 🇲🇽 México — multi-ramo
  | 'tirea'       // 🇪🇸 España — estándar ficheros
  | 'fiva'        // 🇪🇸 España — normativa
  | 'eiac';       // 🇪🇸 España — mediadores

export const VALID_INSURER_SLUGS: InsurerSlug[] = [
  'qualitas',
  'gnp',
  'axa-mx',
  'seguros-monterrey',
  'tirea',
  'fiva',
  'eiac',
];

export type InsurerCountry = 'MX' | 'ES';

export type InsurerCapability =
  | 'AUTH_OAUTH'      // OAuth 2.0 flow
  | 'AUTH_API_KEY'    // API key en header
  | 'POLICIES_LIST'   // fetchPolicies soportado
  | 'POLICIES_ISSUE'  // issuePolicy soportado
  | 'CLAIMS_SUBMIT'   // submitClaim soportado
  | 'CLAIMS_STATUS'   // consultar estado de un siniestro
  | 'WEBHOOK_IN'      // webhook entrante (Fase 5.3+)
  | 'WEBHOOK_OUT';    // webhook saliente (Fase 5.3+)

export type InsurerRam =
  | 'AUTO'
  | 'HOGAR'
  | 'VIDA'
  | 'SALUD'
  | 'GASTOS_MEDICOS'
  | 'EMPRESARIAL'
  | 'RESPONSABILIDAD_CIVIL'
  | 'INCENDIO'
  | 'TRANSPORTE'
  | 'AHORRO'
  | 'JUBILACION'
  | 'OTROS';

// ─── InsurerMetadata ────────────────────────────────────────────────────────

export interface InsurerMetadata {
  slug: InsurerSlug;
  /** Nombre comercial oficial */
  nombre: string;
  country: InsurerCountry;
  /** ID ante el regulador (CNSF en México / DGSFP en España). Solo referencia. */
  regulatoryId: string;
  /** Página oficial (sin scraping). */
  website: string;
  /** Moneda base con la que la aseguradora emite pólizas. */
  monedaBase: Currency;
  /** Ramos que la aseguradora está legalmente habilitada a emitir. */
  supportedRamos: readonly InsurerRam[];
  /** Capacidades implementadas hoy (no prometidas en roadmap). */
  capabilities: readonly InsurerCapability[];
  /**
   * Si `true`, la integración actual es MOCK — no llama al partner real.
   * Útil para que la UI muestre una insignia "Sandbox" antes del go-live.
   */
  isMock: boolean;
}

// ─── Inputs / outputs por método ───────────────────────────────────────────

export interface AuthConfig {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** Sandbox vs producción (algunos conectores separan bases URLs). */
  environment?: 'sandbox' | 'production';
}

export interface AuthResult {
  /** Token opaco o bearer que usar en calls subsiguientes. */
  token: string;
  expiresAt: Date;
  /** Si aplica, refresh token nuevo. */
  refreshToken?: string;
}

export interface FetchPoliciesInput {
  clienteId?: string;
  /** Si llega, filtra por el ID externo de la aseguradora. */
  aseguradoraId?: string;
  ramo?: InsurerRam;
  page?: number;
  limit?: number;
}

export interface ExternalPolicy {
  /** ID del partner (no del Poliza interno de Volkern). */
  externalId: string;
  numeroPoliza: string;
  clienteId: string;
  clienteNombre: string;
  ramo: InsurerRam;
  /** Producto del catálogo del partner. */
  productoNombre: string;
  sumaAsegurada: number;
  primaAnual: number;
  moneda: Currency;
  fechaInicio: Date;
  fechaVencimiento: Date;
  estado: 'ACTIVA' | 'PROXIMA_A_VENCER' | 'VENCIDA' | 'CANCELADA' | 'EN_TRAMITE';
  /** URL al PDF de la póliza original en el partner, si aplica. */
  documentoUrl?: string;
}

export interface FetchPoliciesResult {
  policies: ExternalPolicy[];
  total: number;
  page: number;
  totalPages: number;
}

export interface IssuePolicyInput {
  cliente: {
    nombre: string;
    /** RFC (México) o NIF/CIF/NIE (España). Validar antes de llamar. */
    taxId: string;
    email: string;
    telefono?: string;
    direccion?: string;
    codigoPostal?: string;
  };
  producto: {
    ramo: InsurerRam;
    nombre: string;
    /** ID del producto en el catálogo del partner (no confundir con ProductoSeguro interno). */
    externalProductId: string;
  };
  /** Suma asegurada en la moneda destino. */
  sumaAsegurada: number;
  /** Prima anual en la misma moneda. */
  primaAnual: number;
  fechaInicio: Date;
  fechaVencimiento: Date;
  /** Moneda. Si difiere de la monedaBase del partner, el partner rechaza. */
  moneda: Currency;
  /** Notas libres para el broker. */
  notas?: string;
}

export interface IssuePolicyResult {
  externalId: string;
  numeroPoliza: string;
  primaAnual: number;
  /** 1 si primera emisión, >1 si renovación. */
  emision: number;
  documentoUrl: string;
  /** Mensaje legible para mostrar al broker. */
  mensaje: string;
}

export interface SubmitClaimInput {
  externalPolicyId: string;
  descripcion: string;
  fechaSuceso: Date;
  montoReclamado: number;
  /** Lista opcional de URLs a fotos/PDFs que respaldan la reclamación. */
  adjuntos?: string[];
}

export interface SubmitClaimResult {
  externalClaimId: string;
  /** Estado devuelto por el partner al abrir el expediente. */
  estado: 'RECIBIDO' | 'EN_VALIDACION' | 'APROBADO' | 'PAGADO' | 'RECHAZADO';
  /** Estimación inicial de indemnización (si el partner la calcula). */
  montoEstimadoIndemnizacion?: number;
  /** SLA en horas que el partner da para respuesta. */
  slaRespuestaHoras: number;
  mensaje: string;
}

// ─── Interface ──────────────────────────────────────────────────────────────

export interface InsurerConnector {
  /** Metadata inmutable de la aseguradora. */
  readonly metadata: InsurerMetadata;

  /**
   * Autentica contra el partner y devuelve un token reutilizable.
   * Lanza con `ConnectorErrorCode.AUTH_FAILED` en cualquier fallo.
   */
  authenticate(config: AuthConfig): Promise<AuthResult>;

  /**
   * Lista las pólizas del partner para un cliente Volkern.
   * Útil para el flujo de "importar cartera del partner".
   */
  fetchPolicies(input: FetchPoliciesInput): Promise<FetchPoliciesResult>;

  /**
   * Emite una póliza contra el partner. El partner devuelve su propio
   * numeroPoliza + documento PDF. Mapear a Poliza interno por `numeroPoliza`.
   */
  issuePolicy(input: IssuePolicyInput): Promise<IssuePolicyResult>;

  /**
   * Abre un expediente de siniestro contra una póliza del partner.
   * Mapear a Siniestro interno por `externalClaimId` en una migration posterior.
   */
  submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult>;
}

// ─── Errores tipados ────────────────────────────────────────────────────────

export type ConnectorErrorCode =
  | 'AUTH_FAILED'
  | 'INVALID_TAX_ID'
  | 'INVALID_RAMO'
  | 'POLICY_NOT_FOUND'
  | 'POLICY_EXPIRED'
  | 'CLAIM_AMOUNT_EXCEEDS_COVERAGE'
  | 'RATE_LIMIT'
  | 'PARTNER_DOWN'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INVALID_INPUT'
  | 'INTERNAL';

export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Resuelve un InsurerConnector por slug canónico.
 *
 * Por qué lazy: las implementaciones mock requieren state (datos
 * determinsticos por seed); cargarlas eagerly impactaría el cold-start
 * del bundle. El caller (skill) llama `getInsurerConnector(slug)` cuando
 * necesita hablar con una aseguradora específica.
 *
 * Tira con `ConnectorError(UNKNOWN_INSURER)` si el slug no está en
 * `VALID_INSURER_SLUGS`.
 */
export async function getInsurerConnector(slug: string): Promise<InsurerConnector> {
  if (!VALID_INSURER_SLUGS.includes(slug as InsurerSlug)) {
    throw new ConnectorError(
      'INTERNAL' as ConnectorErrorCode, // usamos INTERNAL para errores de configuración
      `InsurerConnector no implementado para slug='${slug}'. ` +
      `Slugs válidos: ${VALID_INSURER_SLUGS.join(', ')}.`,
    );
  }
  switch (slug as InsurerSlug) {
    case 'qualitas':
      return (await import('./qualitas')).default;
    case 'gnp':
      return (await import('./gnp')).default;
    // Próximos commits: axa-mx, seguros-monterrey, tirea, fiva, eiac
    default:
      throw new ConnectorError(
        'INTERNAL' as ConnectorErrorCode,
        `Connector '${slug}' pendiente de implementación (siguiente commit).`,
      );
  }
}

// ─── Helpers compartidos (sin acoplar a implementación) ────────────────────

/** Valida RFC mexicano (13 caracteres) o NIF español (8-9 caracteres alfanuméricos). */
export function validarTaxId(country: InsurerCountry, taxId: string): boolean {
  if (!taxId) return false;
  const cleaned = taxId.trim().toUpperCase().replace(/\s/g, '');
  if (country === 'MX') {
    // RFC persona moral: 12 chars. Persona física: 13 chars.
    return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(cleaned);
  }
  if (country === 'ES') {
    // NIF: 8 dígitos + letra. CIF: letra + 7 dígitos + letra o dígito. NIE: X/Y/Z + 7 dígitos + letra.
    return /^([0-9XYZ]\d{7}[A-Z])|([A-HNP-SUVW][0-9]{7}[A-Z0-9])$/.test(cleaned);
  }
  return false;
}

/** Slug canónico del partner desde un dominio o nombre comercial. Heurística rápida. */
export function inferirInsurerSlug(nombre: string): InsurerSlug | null {
  const n = nombre.toLowerCase().trim();
  if (n.includes('quálitas') || n.includes('qualitas')) return 'qualitas';
  if (n.includes('gnp')) return 'gnp';
  if (n.includes('axa') && (n.includes('méxico') || n.includes('mx'))) return 'axa-mx';
  if (n.includes('monterrey')) return 'seguros-monterrey';
  if (n.includes('tirea')) return 'tirea';
  if (n.includes('fiva')) return 'fiva';
  if (n.includes('eiac')) return 'eiac';
  return null;
}
