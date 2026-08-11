/**
 * TIREAConnector — Implementación MOCK del InsurerConnector.
 *
 * 🇪🇸 España — TIREA (Tecnología de la Información y Redes para las
 * Entidades Aseguradoras, S.A.), operador del estándar de ficheros del
 * mercado asegurador español.
 *
 * Por qué MOCK primero (igual que Quálitas y GNP):
 *   - NO requiere Partner Engineering agreement (eso toma 3-6 meses).
 *   - La interfaz `InsurerConnector` queda congelada hoy.
 *   - Cuando llegue el acuerdo, sólo cambian los cuerpos de los métodos
 *     `authenticate/fetchPolicies/issuePolicy/submitClaim` — la firma
 *     permanece. Los tests y los callers siguen funcionando idéntico.
 *
 * Diferencia de integración vs México:
 *   - Quálitas/GNP exponen APIs REST. TIREA NO: es el operador del
 *     **estándar de ficheros** (ficheros de cartera, expedientes de
 *     siniestros y el FIVA de vehículos). El swap real será SFTP +
 *     generador/parser de ficheros, NO fetch().
 *   - Gracias a la interfaz, el caller no sabe (ni le importa) que el
 *     mock habla "ficheros": el factory devuelve un InsurerConnector.
 *
 * Diferencia de mercado vs los mocks mexicanos:
 *   - Moneda base EUR (MXN en México). `validarTaxId('ES', …)` valida
 *     NIF/CIF/NIE.
 *   - Todos los ramos españoles tienen capital asegurado numérico, así
 *     que `sumaAsegurada > 0` se exige en TODOS los ramos (a diferencia
 *     de GNP, que exime a SALUD/GASTOS_MEDICOS).
 */

import {
  ConnectorError,
  validarTaxId,
  type InsurerConnector,
  type InsurerMetadata,
  type AuthConfig,
  type AuthResult,
  type FetchPoliciesInput,
  type FetchPoliciesResult,
  type IssuePolicyInput,
  type IssuePolicyResult,
  type SubmitClaimInput,
  type SubmitClaimResult,
} from '../InsurerConnector';
import {
  MOCK_POLIZAS,
  fetchMockPolicies,
  issueMockPolicy,
  submitMockClaim,
  TIREA_NOMBRE,
  TIREA_REGULATORY_ID,
  TIREA_WEBSITE,
  TIREA_SUPPORTED_RAMOS,
} from './mock-data';

const MOCK_METADATA: InsurerMetadata = {
  slug: 'tirea',
  nombre: TIREA_NOMBRE,
  country: 'ES',
  regulatoryId: TIREA_REGULATORY_ID,
  website: TIREA_WEBSITE,
  monedaBase: 'EUR',
  supportedRamos: TIREA_SUPPORTED_RAMOS,
  capabilities: [
    'AUTH_API_KEY',
    'POLICIES_LIST',
    'POLICIES_ISSUE',
    'CLAIMS_SUBMIT',
    'CLAIMS_STATUS',
  ],
  isMock: true,
};

class TIREAConnector implements InsurerConnector {
  readonly metadata = MOCK_METADATA;

  // ── authenticate ────────────────────────────────────────────────────────

  async authenticate(config: AuthConfig): Promise<AuthResult> {
    // En modo mock, cualquier apiKey no-vacía es aceptada. En la
    // integración real TIREA autentica por certificado digital / acceso
    // SFTP — el mock lo abstrae detrás de la misma interfaz.
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new ConnectorError(
        'AUTH_FAILED',
        'TIREA (mock) requiere apiKey no-vacía. En modo sandbox real, esto sería tu certificado de acceso al estándar de ficheros.',
      );
    }
    return {
      token: `tirea-mock-token-${Date.now()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
    };
  }

  // ── fetchPolicies ───────────────────────────────────────────────────────

  async fetchPolicies(input: FetchPoliciesInput): Promise<FetchPoliciesResult> {
    if (input.ramo && !this.metadata.supportedRamos.includes(input.ramo)) {
      throw new ConnectorError(
        'UNSUPPORTED_CAPABILITY',
        `TIREA no cubre ramo '${input.ramo}'. Ramos soportados: ${this.metadata.supportedRamos.join(', ')}.`,
      );
    }
    return fetchMockPolicies(input);
  }

  // ── issuePolicy ─────────────────────────────────────────────────────────

  async issuePolicy(input: IssuePolicyInput): Promise<IssuePolicyResult> {
    if (!validarTaxId('ES', input.cliente.taxId)) {
      throw new ConnectorError(
        'INVALID_TAX_ID',
        `NIF/CIF inválido: '${input.cliente.taxId}'. TIREA requiere formato español (NIF 8 dígitos + letra, NIE X/Y/Z + 7 dígitos + letra, o CIF letra + 7 dígitos + control).`,
      );
    }
    if (input.moneda !== 'EUR') {
      throw new ConnectorError(
        'INVALID_INPUT',
        `TIREA emite sólo en EUR. Recibida: '${input.moneda}'.`,
      );
    }
    if (!this.metadata.supportedRamos.includes(input.producto.ramo)) {
      throw new ConnectorError(
        'INVALID_RAMO',
        `TIREA no cubre ramo '${input.producto.ramo}'. Ramos soportados: ${this.metadata.supportedRamos.join(', ')}.`,
      );
    }
    // Todos los ramos del mercado español tienen capital asegurado numérico
    // (a diferencia de SALUD/GASTOS_MEDICOS de GNP). Exigimos suma > 0 siempre.
    if (input.sumaAsegurada <= 0) {
      throw new ConnectorError(
        'INVALID_INPUT',
        `sumaAsegurada debe ser > 0 para ramo ${input.producto.ramo} (todo ramo español tiene capital asegurado numérico).`,
      );
    }
    if (input.primaAnual <= 0) {
      throw new ConnectorError(
        'INVALID_INPUT',
        'primaAnual debe ser > 0.',
      );
    }
    if (input.fechaVencimiento <= input.fechaInicio) {
      throw new ConnectorError(
        'INVALID_INPUT',
        'fechaVencimiento debe ser posterior a fechaInicio.',
      );
    }
    return issueMockPolicy(input);
  }

  // ── submitClaim ─────────────────────────────────────────────────────────

  async submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult> {
    const matched = MOCK_POLIZAS.find((p) => p.externalId === input.externalPolicyId);
    if (!matched) {
      throw new ConnectorError(
        'POLICY_NOT_FOUND',
        `No se encontró la póliza '${input.externalPolicyId}' en TIREA (mock).`,
      );
    }
    if (matched.estado === 'VENCIDA' || matched.estado === 'CANCELADA') {
      throw new ConnectorError(
        'POLICY_EXPIRED',
        `La póliza '${matched.numeroPoliza}' está en estado ${matched.estado}, no acepta siniestros.`,
      );
    }
    if (input.montoReclamado > matched.sumaAsegurada) {
      throw new ConnectorError(
        'CLAIM_AMOUNT_EXCEEDS_COVERAGE',
        `Capital reclamado (${input.montoReclamado} EUR) excede el capital asegurado (${matched.sumaAsegurada} EUR).`,
      );
    }
    return submitMockClaim(input, matched);
  }
}

const connector = new TIREAConnector();
export default connector;
