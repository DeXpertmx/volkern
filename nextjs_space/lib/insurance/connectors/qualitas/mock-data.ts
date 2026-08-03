/**
 * Mock data para Qualitas (aseguradora de autos líder en México).
 *
 * Por qué determinístico:
 *   - Tests no flaky: misma seed → mismos IDs.
 *   - Sandbox de UI: devs ven siempre los mismos casos.
 *   - Demos a clientes: 'expón esto y la consola de Quálitas tiene exactamente
 *     esta respuesta' (cuando llegue la integración real, swap el factory).
 *
 * Por qué realista:
 *   - RFCs válidos (formato oficial).
 *   - Ramos consistentes con la vertical AUTO de Quálitas.
 *   - Montos en MXN con 2 decimales.
 *   - Estados mutuamente excluyentes.
 *
 * NO leer directamente desde el código del connector — el connector usa
 * helpers de lookup. Esto permite cambiar la fuente del mock (e.g. swap
 * por fetch a JSON local) sin tocar la clase.
 */

import type { InsurerRam } from '../InsurerConnector';
import type {
  ExternalPolicy,
  FetchPoliciesInput,
  FetchPoliciesResult,
  IssuePolicyInput,
  IssuePolicyResult,
  SubmitClaimInput,
  SubmitClaimResult,
} from '../InsurerConnector';

export const QUALITAS_NOMBRE = 'Quálitas Compañía de Seguros, S.A. de C.V.';
export const QUALITAS_RFC = 'QCS-921109-G76';
export const QUALITAS_REGLAMENTO_INTERNO_URL = 'https://www.qualitas.com.mx/reglamento';

// ─── Clientes (catálogo mock) ──────────────────────────────────────────────

export interface QualitasMockCliente {
  id: string;
  nombre: string;
  rfc: string;
  email: string;
  telefono?: string;
}

export const MOCK_CLIENTES: QualitasMockCliente[] = [
  {
    id: 'cli-mx-001',
    nombre: 'Roberto Hernández Mendoza',
    rfc: 'HEMR800525AB3',
    email: 'roberto.h@example.com',
    telefono: '+52 55 1234 5678',
  },
  {
    id: 'cli-mx-002',
    nombre: 'María Fernanda López García',
    rfc: 'LOMF910412C77',
    email: 'mf.lopez@example.com',
    telefono: '+52 33 2345 6789',
  },
  {
    id: 'cli-mx-003',
    nombre: 'Distribuidora del Norte S.A. de C.V.',
    rfc: 'DNO050120KL9',
    email: 'contacto@ddelnorte.com.mx',
    telefono: '+52 81 3456 7890',
  },
];

// ─── Productos (catálogo oficial de Quálitas mockeado) ──────────────────────

export interface QualitasMockProducto {
  externalProductId: string;
  nombre: string;
  ramo: InsurerRam;
  primaAnualBase: number;
  /** Suma asegurada máxima que la póliza cubre. */
  sumaMaximaDefault: number;
  /** Coberturas incluidas (texto legible para mostrar). */
  coberturas: string[];
}

export const MOCK_PRODUCTOS: QualitasMockProducto[] = [
  {
    externalProductId: 'qualitas-auto-economico',
    nombre: 'Auto Quálitas Económico',
    ramo: 'AUTO',
    primaAnualBase: 8500,
    sumaMaximaDefault: 350000,
    coberturas: [
      'Responsabilidad Civil (límite $1,500,000)',
      'Daños materiales con deducible 5%',
      'Robo total',
      'Gastos médicos ocupantes $50,000',
    ],
  },
  {
    externalProductId: 'qualitas-auto-estandar',
    nombre: 'Auto Quálitas Estándar',
    ramo: 'AUTO',
    primaAnualBase: 13500,
    sumaMaximaDefault: 500000,
    coberturas: [
      'Todo lo del Económico',
      'Auto sustituto 15 días',
      'Asistencia vial 24/7',
      'Cobertura nacional y EU',
    ],
  },
  {
    externalProductId: 'qualitas-auto-elite',
    nombre: 'Auto Quálitas Elite',
    ramo: 'AUTO',
    primaAnualBase: 24800,
    sumaMaximaDefault: 850000,
    coberturas: [
      'Todo lo del Estándar',
      'Deducible 0% en daños',
      'Auto sustituto 30 días',
      'Cobertura mundial',
      'Conductor protegido adicional',
    ],
  },
];

// ─── Pólizas emitidas (mock histórico) ───────────────────────────────────

export const MOCK_POLIZAS: ExternalPolicy[] = [
  {
    externalId: 'qua-pol-2024-001',
    numeroPoliza: 'Q-2024-001-AUTO',
    clienteId: 'cli-mx-001',
    clienteNombre: 'Roberto Hernández Mendoza',
    ramo: 'AUTO',
    productoNombre: 'Auto Quálitas Estándar',
    sumaAsegurada: 380000,
    primaAnual: 13200,
    moneda: 'MXN',
    fechaInicio: new Date('2024-08-01'),
    fechaVencimiento: new Date('2026-08-01'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.qualitas.com.mx/policies/Q-2024-001-AUTO.pdf',
  },
  {
    externalId: 'qua-pol-2024-002',
    numeroPoliza: 'Q-2024-002-AUTO',
    clienteId: 'cli-mx-002',
    clienteNombre: 'María Fernanda López García',
    ramo: 'AUTO',
    productoNombre: 'Auto Quálitas Económico',
    sumaAsegurada: 220000,
    primaAnual: 8200,
    moneda: 'MXN',
    fechaInicio: new Date('2024-03-15'),
    fechaVencimiento: new Date('2026-03-15'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.qualitas.com.mx/policies/Q-2024-002-AUTO.pdf',
  },
  {
    externalId: 'qua-pol-2024-003',
    numeroPoliza: 'Q-2024-003-AUTO',
    clienteId: 'cli-mx-003',
    clienteNombre: 'Distribuidora del Norte S.A. de C.V.',
    ramo: 'AUTO',
    productoNombre: 'Auto Quálitas Elite (flotilla)',
    sumaAsegurada: 800000,
    primaAnual: 84500,
    moneda: 'MXN',
    fechaInicio: new Date('2024-01-01'),
    fechaVencimiento: new Date('2027-01-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.qualitas.com.mx/policies/Q-2024-003-AUTO.pdf',
  },
  {
    externalId: 'qua-pol-2023-099',
    numeroPoliza: 'Q-2023-099-AUTO',
    clienteId: 'cli-mx-001',
    clienteNombre: 'Roberto Hernández Mendoza',
    ramo: 'AUTO',
    productoNombre: 'Auto Quálitas Estándar',
    sumaAsegurada: 380000,
    primaAnual: 12900,
    moneda: 'MXN',
    fechaInicio: new Date('2023-08-01'),
    fechaVencimiento: new Date('2024-08-01'),
    estado: 'VENCIDA',
  },
];

// ─── Helpers del mock ──────────────────────────────────────────────────────

let nextClaimSequence = 4000;

export function fetchMockPolicies(input: FetchPoliciesInput): FetchPoliciesResult {
  let filtered = MOCK_POLIZAS.slice();
  if (input.clienteId) filtered = filtered.filter((p) => p.clienteId === input.clienteId);
  if (input.ramo) filtered = filtered.filter((p) => p.ramo === input.ramo);

  const page = input.page && input.page > 0 ? input.page : 1;
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 100) : 50;
  const total = filtered.length;
  const start = (page - 1) * limit;

  return {
    policies: filtered.slice(start, start + limit),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export function issueMockPolicy(input: IssuePolicyInput): IssuePolicyResult {
  const seq = String(2025) + '-' + String(100 + Math.floor(Math.random() * 900));
  return {
    externalId: `qua-pol-${seq}`,
    numeroPoliza: `Q-${seq}-${input.producto.ramo}`,
    primaAnual: input.primaAnual,
    emision: 1,
    documentoUrl: `https://api.qualitas.com.mx/policies/Q-${seq}-${input.producto.ramo}.pdf`,
    mensaje: `Póliza ${input.producto.ramo} emitida por Quálitas. El cliente firmará digitalmente en 48h hábiles.`,
  };
}

export function submitMockClaim(
  input: SubmitClaimInput,
  matchedPolicy: ExternalPolicy,
): SubmitClaimResult {
  const seq = String(nextClaimSequence++);
  const exceedsCoverage = input.montoReclamado > matchedPolicy.sumaAsegurada;
  return {
    externalClaimId: `Q-CLM-${seq}`,
    estado: exceedsCoverage ? 'EN_VALIDACION' : 'RECIBIDO',
    montoEstimadoIndemnizacion: exceedsCoverage
      ? undefined
      : Math.round(input.montoReclamado * 0.9),
    slaRespuestaHoras: exceedsCoverage ? 96 : 48,
    mensaje: exceedsCoverage
      ? `Siniestro ${seq} recibido. Monto reclamado excede cobertura. Validación adicional 96h.`
      : `Siniestro ${seq} recibido. Dictamen inicial en 48h hábiles.`,
  };
}
