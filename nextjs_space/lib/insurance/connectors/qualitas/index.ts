/**
 * QuálitasConnector — Implementación MOCK del InsurerConnector.
 *
 * 🇲🇽 México — Quálitas Compañía de Seguros, S.A. de C.V.
 *
 * Por qué MOCK primero:
 *   - NO requiere Partner Engineering agreement (eso toma 3-6 meses).
 *   - La interfaz `InsurerConnector` queda congelada hoy.
 *   - Cuando llegue el acuerdo, sólo cambian los cuerpos de los métodos
 *     `authenticate/fetchPolicies/issuePolicy/submitClaim` — la firma permanece.
 *   - Los tests y los callers siguen funcionando idéntico.
 *
 * Comportamiento:
 *   - `authenticate` devuelve un token determinstico `qualitas-mock-...` con
 *     expiración de 1h. Cualquier `apiKey` no-vacía es aceptada.
 *   - `fetchPolicies` filtra `MOCK_POLIZAS` por cliente/ramo + paginación.
 *   - `issuePolicy` genera un numeroPoliza único con prefijo `Q-2025-...`
 *     y devuelve un PDF URL mockeado.
 *   - `submitClaim` valida que montoReclamado ≤ sumaAsegurada, devuelve
 *     número de siniestro y SLA en horas.
 *
 * Path al swap por integración real:
 *   1. Reemplazar los cuerpos de los métodos con llamadas `fetch()` al
 *      API real de Quálitas (en cuanto nos den acceso sandbox).
 *   2. Conservar exactamente las firmas, los nombres de campos y los códigos
 *      de `ConnectorError` — nada más cambia.
 *   3. Activar en producción cambiando `metadata.isMock = false`.
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
  QUALITAS_NOMBRE,
  QUALITAS_REGLAMENTO_INTERNO_URL,
  fetchMockPolicies as _fetchMockPoliciesAlias, // alias para dejar claro que viene del mock
} from './mock-data';

const MOCK_METADATA: InsurerMetadata = {
  slug: 'qualitas',
  nombre: QUALITAS_NOMBRE,
  country: 'MX',
  regulatoryId: 'CNSF-S0098-0314-2000', // CNSF de Quálitas
  website: 'https://www.qualitas.com.mx',
  monedaBase: 'MXN',
  supportedRamos: ['AUTO' as const], // Quálitas es especialista en autos
  capabilities: [
    'AUTH_API_KEY' as const,
    'POLICIES_LIST' as const,
    'POLICIES_ISSUE' as const,
    'CLAIMS_SUBMIT' as const,
    'CLAIMS_STATUS' as const,
  ],
  isMock: true,
};

class QualitasConnector implements InsurerConnector {
  readonly metadata = MOCK_METADATA;

  // ── authenticate ────────────────────────────────────────────────────────

  async authenticate(_config: AuthConfig): Promise<AuthResult> {
    // En modo mock, cualquier apiKey no-vacía es aceptada.
    if (!_config.apiKey || _config.apiKey.trim() === '') {
      throw new ConnectorError(
        'AUTH_FAILED',
        'Quálitas (mock) requiere apiKey no-vacía. En modo sandbox real, esto sería tu client_id.',
      );
    }
    return {
      token: `qualitas-mock-token-${Date.now()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
    };
  }

  // ── fetchPolicies ───────────────────────────────────────────────────────

  async fetchPolicies(input: FetchPoliciesInput): Promise<FetchPoliciesResult> {
    if (input.ramo && input.ramo !== 'AUTO') {
      throw new ConnectorError(
        'UNSUPPORTED_CAPABILITY',
        `Quálitas no emite ramo '${input.ramo}'. Ramos soportados: AUTO.`,
      );
    }
    return fetchMockPolicies(input);
  }

  // ── issuePolicy ────────────────────────────────────────────────────────

  async issuePolicy(input: IssuePolicyInput): Promise<IssuePolicyResult> {
    if (!validarTaxId('MX', input.cliente.taxId)) {
      throw new ConnectorError(
        'INVALID_TAX_ID',
        `RFC inválido: '${input.cliente.taxId}'. Quálitas requiere formato mexicano (12-13 chars).`,
      );
    }
    if (input.moneda !== 'MXN') {
      throw new ConnectorError(
        'INVALID_INPUT',
        `Quálitas emite sólo en MXN. Recibida: '${input.moneda}'.`,
      );
    }
    if (input.producto.ramo !== 'AUTO') {
      throw new ConnectorError(
        'INVALID_RAMO',
        `Quálitas sólo emite ramo AUTO. Recibido: '${input.producto.ramo}'.`,
      );
    }
    if (input.sumaAsegurada <= 0 || input.primaAnual <= 0) {
      throw new ConnectorError(
        'INVALID_INPUT',
        'sumaAsegurada y primaAnual deben ser > 0.',
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

  // ── submitClaim ────────────────────────────────────────────────────────

  async submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult> {
    const matched = MOCK_POLIZAS.find((p) => p.externalId === input.externalPolicyId);
    if (!matched) {
      throw new ConnectorError(
        'POLICY_NOT_FOUND',
        `No se encontró la póliza '${input.externalPolicyId}' en Quálitas (mock).`,
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
        `Monto reclamado (${input.montoReclamado} MXN) excede la suma asegurada (${matched.sumaAsegurada} MXN).`,
      );
    }
    return submitMockClaim(input, matched);
  }
}

const connector = new QualitasConnector();
export default connector;
