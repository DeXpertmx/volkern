/**
 * Mock data para TIREA — Tecnología de la Información y Redes para las
 * Entidades Aseguradoras, S.A. (España).
 *
 * Diferencia clave vs los conectores de México (Quálitas f750f83, GNP e0455f0):
 *   - TIREA NO expone REST: es el operador del **estándar de ficheros** del
 *     mercado asegurador español (ficheros de cartera, siniestros y el FIVA
 *     de vehículos). El mock emula la misma interfaz `InsurerConnector`
 *     (porque el caller no debe ramificar), y cuando llegue la integración
 *     real el swap será un SFTP + generador/parser de ficheros.
 *   - Moneda base EUR (vs MXN de los mocks mexicanos). Demuestra que la
 *     interfaz escala de país: `validarTaxId('ES', …)` ya valida NIF/CIF/NIE.
 *   - Todos los ramos del mercado español tienen "capital asegurado"
 *     numérico (a diferencia de SALUD/GASTOS_MEDICOS de GNP que son 0).
 *     Por eso el connector exige sumaAsegurada > 0 en TODOS los ramos.
 *
 * Por qué determinístico:
 *   - Tests no flaky: misma seed → mismos IDs.
 *   - Sandbox de UI: devs ven siempre los mismos casos.
 *
 * NO leer directamente desde el código del connector — el connector usa
 * helpers de lookup. Esto permite cambiar la fuente del mock (e.g. swap
 * por un lector de ficheros TIREA) sin tocar la clase.
 */

import type {
  InsurerRam,
  ExternalPolicy,
  FetchPoliciesInput,
  FetchPoliciesResult,
  IssuePolicyInput,
  IssuePolicyResult,
  SubmitClaimInput,
  SubmitClaimResult,
} from '../InsurerConnector';

// ─── Constantes del partner ────────────────────────────────────────────────

export const TIREA_NOMBRE =
  'TIREA — Tecnología de la Información y Redes para las Entidades Aseguradoras, S.A.';
// TIREA es el operador del estándar de ficheros del sector. El regulator
// español es la DGSFP; el ID es solo referencia (mock).
export const TIREA_REGULATORY_ID = 'DGSFP (España) — estándar de ficheros';
export const TIREA_WEBSITE = 'https://www.tirea.es';
export const TIREA_SUPPORTED_RAMOS = [
  'AUTO',
  'HOGAR',
  'VIDA',
  'SALUD',
  'RESPONSABILIDAD_CIVIL',
  'TRANSPORTE',
] as const;

// ─── Clientes (catálogo mock TIREA, NIF/CIF españoles) ─────────────────────

export interface TireaMockCliente {
  id: string;
  nombre: string;
  /** NIF (persona física) o CIF (persona jurídica) español. */
  taxId: string;
  email: string;
  telefono?: string;
}

export const MOCK_CLIENTES: TireaMockCliente[] = [
  {
    id: 'cli-es-001',
    nombre: 'Transportes del Ebro S.L.',
    taxId: 'B62738101', // CIF: B + 7 dígitos + control
    email: 'operaciones@transportesdelebro.es',
    telefono: '+34 976 123 456',
  },
  {
    id: 'cli-es-002',
    nombre: 'Marta Sánchez Ortega',
    taxId: '45329018K', // NIF: 8 dígitos + letra
    email: 'marta.sanchez@example.com',
    telefono: '+34 650 111 222',
  },
  {
    id: 'cli-es-003',
    nombre: 'Inmobiliaria Mediterránea S.A.',
    taxId: 'A58394827', // CIF
    email: 'seguros@inmobmediterranea.es',
    telefono: '+34 96 555 444',
  },
  {
    id: 'cli-es-004',
    nombre: 'Javier Martín Ruiz',
    taxId: '50123456X', // NIF
    email: 'javier.martin@example.com',
    telefono: '+34 620 333 444',
  },
];

// ─── Productos (catálogo por ramo, mercado español) ────────────────────────

export interface TireaMockProducto {
  externalProductId: string;
  nombre: string;
  ramo: InsurerRam;
  primaAnualBase: number; // EUR
  sumaMaximaDefault: number; // EUR
  coberturas: string[];
}

export const MOCK_PRODUCTOS: TireaMockProducto[] = [
  // AUTO (multirriesgo, al estilo del seguro español)
  { externalProductId: 'tirea-auto-multirriesgo', nombre: 'Auto TIREA Multirriesgo', ramo: 'AUTO', primaAnualBase: 480, sumaMaximaDefault: 30000,
    coberturas: ['Responsabilidad Civil obligatoria y voluntaria', 'Daños propios con franquicia 150 €', 'Asistencia en carretera 24/7', 'Defensa jurídica'] },
  { externalProductId: 'tirea-auto-todo-riesgo', nombre: 'Auto TIREA Todo Riesgo', ramo: 'AUTO', primaAnualBase: 820, sumaMaximaDefault: 45000,
    coberturas: ['Cobertura amplia sin franquicia en lunas', 'Vehículo de sustitución 15 días', 'Daños por fenómenos atmosféricos', 'Cobertura en toda la UE'] },
  // HOGAR
  { externalProductId: 'tirea-hogar-plus', nombre: 'Hogar TIREA Plus', ramo: 'HOGAR', primaAnualBase: 235, sumaMaximaDefault: 300000,
    coberturas: ['Incendio, rayos y explosión', 'Daños por agua', 'Robo con fuerza', 'Responsabilidad civil familiar'] },
  // VIDA
  { externalProductId: 'tirea-vida-temporal', nombre: 'Vida TIREA Temporal 15', ramo: 'VIDA', primaAnualBase: 340, sumaMaximaDefault: 150000,
    coberturas: ['Fallecimiento por cualquier causa', 'Muerte accidental (doble capital)', 'Invalidez permanente absoluta', 'Cobertura mundial'] },
  // SALUD
  { externalProductId: 'tirea-salud-completa', nombre: 'Salud TIREA Completa', ramo: 'SALUD', primaAnualBase: 1180, sumaMaximaDefault: 200000,
    coberturas: ['Cuadro médico nacional', 'Hospitalización y cirugía', 'Medicina preventiva', 'Urgencias 24/7 en Europa'] },
  // RESPONSABILIDAD_CIVIL
  { externalProductId: 'tirea-rc-profesional', nombre: 'RC Profesional TIREA', ramo: 'RESPONSABILIDAD_CIVIL', primaAnualBase: 590, sumaMaximaDefault: 500000,
    coberturas: ['Errores y omisiones profesionales', 'Daños a terceros', 'Costes de defensa jurídica', 'Franquicia opcional 1.000 €'] },
  // TRANSPORTE
  { externalProductId: 'tirea-transporte-mercancias', nombre: 'Transporte TIREA Mercancías', ramo: 'TRANSPORTE', primaAnualBase: 1480, sumaMaximaDefault: 200000,
    coberturas: ['Mercancías en tránsito nacional e internacional', 'Responsabilidad civil del porteador', 'Rotura y humedad', 'Almacenaje cubierto 30 días'] },
];

// ─── Pólizas emitidas (mock histórico, mercado español) ────────────────────

export const MOCK_POLIZAS: ExternalPolicy[] = [
  {
    externalId: 'tirea-pol-2024-001',
    numeroPoliza: 'TIREA-2024-001-ES-AUTO',
    clienteId: 'cli-es-002',
    clienteNombre: 'Marta Sánchez Ortega',
    ramo: 'AUTO',
    productoNombre: 'Auto TIREA Multirriesgo',
    sumaAsegurada: 35000,
    primaAnual: 470,
    moneda: 'EUR',
    fechaInicio: new Date('2024-06-01'),
    fechaVencimiento: new Date('2026-06-01'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.tirea.es/files/TIREA-2024-001-ES-AUTO.pdf',
  },
  {
    externalId: 'tirea-pol-2024-002',
    numeroPoliza: 'TIREA-2024-002-ES-HOGAR',
    clienteId: 'cli-es-003',
    clienteNombre: 'Inmobiliaria Mediterránea S.A.',
    ramo: 'HOGAR',
    productoNombre: 'Hogar TIREA Plus',
    sumaAsegurada: 300000,
    primaAnual: 230,
    moneda: 'EUR',
    fechaInicio: new Date('2024-01-15'),
    fechaVencimiento: new Date('2027-01-15'),
    estado: 'ACTIVA',
  },
  {
    externalId: 'tirea-pol-2024-003',
    numeroPoliza: 'TIREA-2024-003-ES-VIDA',
    clienteId: 'cli-es-002',
    clienteNombre: 'Marta Sánchez Ortega',
    ramo: 'VIDA',
    productoNombre: 'Vida TIREA Temporal 15',
    sumaAsegurada: 150000,
    primaAnual: 335,
    moneda: 'EUR',
    fechaInicio: new Date('2024-03-01'),
    fechaVencimiento: new Date('2039-03-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.tirea.es/files/TIREA-2024-003-ES-VIDA.pdf',
  },
  {
    externalId: 'tirea-pol-2024-004',
    numeroPoliza: 'TIREA-2024-004-ES-SALUD',
    clienteId: 'cli-es-004',
    clienteNombre: 'Javier Martín Ruiz',
    ramo: 'SALUD',
    productoNombre: 'Salud TIREA Completa',
    sumaAsegurada: 200000,
    primaAnual: 1150,
    moneda: 'EUR',
    fechaInicio: new Date('2024-09-01'),
    fechaVencimiento: new Date('2025-09-01'),
    estado: 'VENCIDA',
  },
  {
    externalId: 'tirea-pol-2024-005',
    numeroPoliza: 'TIREA-2024-005-ES-RC',
    clienteId: 'cli-es-001',
    clienteNombre: 'Transportes del Ebro S.L.',
    ramo: 'RESPONSABILIDAD_CIVIL',
    productoNombre: 'RC Profesional TIREA',
    sumaAsegurada: 500000,
    primaAnual: 580,
    moneda: 'EUR',
    fechaInicio: new Date('2024-05-01'),
    fechaVencimiento: new Date('2026-05-01'),
    estado: 'PROXIMA_A_VENCER',
  },
  {
    externalId: 'tirea-pol-2024-006',
    numeroPoliza: 'TIREA-2024-006-ES-TRANS',
    clienteId: 'cli-es-001',
    clienteNombre: 'Transportes del Ebro S.L.',
    ramo: 'TRANSPORTE',
    productoNombre: 'Transporte TIREA Mercancías',
    sumaAsegurada: 180000,
    primaAnual: 1460,
    moneda: 'EUR',
    fechaInicio: new Date('2024-02-01'),
    fechaVencimiento: new Date('2026-02-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.tirea.es/files/TIREA-2024-006-ES-TRANS.pdf',
  },
  {
    externalId: 'tirea-pol-2024-007',
    numeroPoliza: 'TIREA-2024-007-ES-AUTO',
    clienteId: 'cli-es-004',
    clienteNombre: 'Javier Martín Ruiz',
    ramo: 'AUTO',
    productoNombre: 'Auto TIREA Todo Riesgo',
    sumaAsegurada: 28000,
    primaAnual: 790,
    moneda: 'EUR',
    fechaInicio: new Date('2024-11-15'),
    fechaVencimiento: new Date('2026-11-15'),
    estado: 'ACTIVA',
  },
  {
    externalId: 'tirea-pol-2023-099',
    numeroPoliza: 'TIREA-2023-099-ES-HOGAR',
    clienteId: 'cli-es-003',
    clienteNombre: 'Inmobiliaria Mediterránea S.A.',
    ramo: 'HOGAR',
    productoNombre: 'Hogar TIREA Plus',
    sumaAsegurada: 300000,
    primaAnual: 225,
    moneda: 'EUR',
    fechaInicio: new Date('2023-01-15'),
    fechaVencimiento: new Date('2024-01-15'),
    estado: 'VENCIDA',
  },
];

// ─── Helpers del mock ──────────────────────────────────────────────────────

let nextClaimSequence = 7000;
let nextIssueSequence = 300;

/** Código corto de ramo para números de póliza y ficheros (estilo TIREA). */
export function ramoCode(ramo: InsurerRam): string {
  switch (ramo) {
    case 'RESPONSABILIDAD_CIVIL':
      return 'RC';
    case 'TRANSPORTE':
      return 'TRANS';
    default:
      return ramo;
  }
}

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
  const seq = String(nextIssueSequence++).padStart(3, '0');
  const code = ramoCode(input.producto.ramo);
  return {
    externalId: `tirea-pol-2025-${seq}`,
    numeroPoliza: `TIREA-2025-${seq}-ES-${code}`,
    primaAnual: input.primaAnual,
    emision: 1,
    documentoUrl: `https://api.tirea.es/files/TIREA-2025-${seq}-ES-${code}.pdf`,
    mensaje: `Póliza ${code} emitida vía estándar de ficheros TIREA (fichero de cartera ES-2025). Documento disponible en el repositorio de TIREA.`,
  };
}

export function submitMockClaim(
  input: SubmitClaimInput,
  matchedPolicy: ExternalPolicy,
): SubmitClaimResult {
  const seq = String(nextClaimSequence++);
  const hasNumericCoverage = matchedPolicy.sumaAsegurada > 0;
  const exceedsCoverage =
    hasNumericCoverage && input.montoReclamado > matchedPolicy.sumaAsegurada;
  return {
    externalClaimId: `TIREA-CLM-${seq}`,
    estado: exceedsCoverage ? 'EN_VALIDACION' : 'RECIBIDO',
    montoEstimadoIndemnizacion: exceedsCoverage
      ? undefined
      : Math.round(input.montoReclamado * 0.85),
    slaRespuestaHoras: exceedsCoverage ? 96 : 48,
    mensaje: exceedsCoverage
      ? `Expediente ${seq} recibido. Capital reclamado excede el capital asegurado. Validación adicional 96h.`
      : `Expediente ${seq} recibido vía fichero TIREA. Dictamen inicial en 48h hábiles.`,
  };
}
