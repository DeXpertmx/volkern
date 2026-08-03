/**
 * GnpConnector — Implementación MOCK del InsurerConnector.
 *
 * 🇲🇽 México — Grupo Nacional Provincial, S.A.B.
 *
 * Por qué MOCK primero:
 *   - NO requiere Partner Engineering agreement (eso toma 3-6 meses).
 *   - La interfaz `InsurerConnector` queda congelada hoy.
 *   - Cuando llegue el acuerdo, sólo cambian los cuerpos de los métodos
 *     `authenticate/fetchPolicies/issuePolicy/submitClaim` — la firma permanece.
 *   - Los tests y los callers siguen funcionando idéntico.
 *
 * Diferencia arquitectónica vs Quálitas (commit f750f83):
 *   - Quálitas: mono-ramo (sólo AUTO). Se valida que fetchPolicies rechace
 *     cualquier ramo distinto con UNSUPPORTED_CAPABILITY.
 *   - GNP: multi-ramo (6 ramos). Se valida que el connector acepte cualquiera
 *     de los soportados y aplique las mismas reglas de moneda/sum/fecha.
 *   Esto demuestra que la interfaz `InsurerConnector` no está acoplada ni
 *   al país ni a un número fijo de ramos.
 *
 * Path al swap por integración real:
 *   1. Reemplazar los cuerpos de los métodos con llamadas `fetch()` al
 *      API real de GNP (en cuanto nos den acceso sandbox).
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
  GNP_NOMBRE,
  GNP_REGLAMENTO_INTERNO_URL,
  GNP_SUPPORTED_RAMOS,
} from './mock-data';

const MOCK_METADATA: InsurerMetadata = {
  slug: 'gnp',
  nombre: GNP_NOMBRE,
  country: 'MX',
  regulatoryId: 'CNSF-S0049-0314-2000', // CNSF de GNP
  website: 'https://www.gnp.com.mx',
  monedaBase: 'MXN',
  supportedRamos: GNP_SUPPORTED_RAMOS,
  capabilities: [
    'AUTH_API_KEY',
    'POLICIES_LIST',
    'POLICIES_ISSUE',
    'CLAIMS_SUBMIT',
    'CLAIMS_STATUS',
  ],
  isMock: true,
};

class GnpConnector implements InsurerConnector {
  readonly metadata = MOCK_METADATA;

  // ── authenticate ────────────────────────────────────────────────────────

  async authenticate(_config: AuthConfig): Promise<AuthResult> {
    // En modo mock, cualquier apiKey no-vacía es aceptada.
    if (!_config.apiKey || _config.apiKey.trim() === '') {
      throw new ConnectorError(
        'AUTH_FAILED',
        'GNP (mock) requiere apiKey no-vacía. En modo sandbox real, esto sería tu número de agente GNP + contrato de comisionista.',
      );
    }
    // Token determinstico `gnp-mock-token-...`
    return {
      token: `gnp-mock-token-${Date.now()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
    };
  }

  // ── fetchPolicies ───────────────────────────────────────────────────────

  async fetchPolicies(input: FetchPoliciesInput): Promise<FetchPoliciesResult> {
    // GNP acepta CUALQUIER ramo de su catálogo (multi-ramo).
    if (input.ramo && !this.metadata.supportedRamos.includes(input.ramo)) {
      throw new ConnectorError(
        'UNSUPPORTED_CAPABILITY',
        `GNP no emite ramo '${input.ramo}'. Ramos soportados: ${this.metadata.supportedRamos.join(', ')}.`,
      );
    }
    return fetchMockPolicies(input);
  }

  // ── issuePolicy ─────────────────────────────────────────────────────────

  async issuePolicy(input: IssuePolicyInput): Promise<IssuePolicyResult> {
    if (!validarTaxId('MX', input.cliente.taxId)) {
      throw new ConnectorError(
        'INVALID_TAX_ID',
        `RFC inválido: '${input.cliente.taxId}'. GNP requiere formato mexicano (12-13 chars).`,
      );
    }
    if (input.moneda !== 'MXN') {
      throw new ConnectorError(
        'INVALID_INPUT',
        `GNP emite sólo en MXN. Recibida: '${input.moneda}'.`,
      );
    }
    if (!this.metadata.supportedRamos.includes(input.producto.ramo)) {
      throw new ConnectorError(
        'INVALID_RAMO',
        `GNP no emite ramo '${input.producto.ramo}'. Ramos soportados: ${this.metadata.supportedRamos.join(', ')}.`,
      );
    }
    // SALUD y GASTOS_MÉDICOS no tienen "suma asegurada" numérica (su modelo
    // de negocio es por servicios/topes anuales). Para esos ramos, exigir
    // sumaAsegurada > 0 sería un falso rechazo. Para los demás ramos sí.
    const RamosSinCoberturaNumerica = ['SALUD', 'GASTOS_MEDICOS'];
    const validarSumaAseg = !RamosSinCoberturaNumerica.includes(input.producto.ramo);
    if (validarSumaAseg && input.sumaAsegurada <= 0) {
      throw new ConnectorError(
        'INVALID_INPUT',
        `sumaAsegurada debe ser > 0 para ramo ${input.producto.ramo} (no aplica a SALUD o GASTOS_MEDICOS).`,
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
        `No se encontró la póliza '${input.externalPolicyId}' en GNP (mock).`,
      );
    }
    if (matched.estado === 'VENCIDA' || matched.estado === 'CANCELADA') {
      throw new ConnectorError(
        'POLICY_EXPIRED',
        `La póliza '${matched.numeroPoliza}' está en estado ${matched.estado}, no acepta siniestros.`,
      );
    }
    // Pólizas VIDA / SALUD / GM tienen sumaAsegurada=0; salta el check de cobertura.
    if (
      matched.sumaAsegurada > 0 &&
      input.montoReclamado > matched.sumaAsegurada
    ) {
      throw new ConnectorError(
        'CLAIM_AMOUNT_EXCEEDS_COVERAGE',
        `Monto reclamado (${input.montoReclamado} MXN) excede la suma asegurada (${matched.sumaAsegurada} MXN).`,
      );
    }
    return submitMockClaim(input, matched);
  }
}

const connector = new GnpConnector();
export default connector;
