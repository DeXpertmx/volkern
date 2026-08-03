/**
 * Mock data para GNP (Grupo Nacional Provincial, S.A.B.).
 *
 * Diferencia clave vs Quálitas (commit f750f83):
 *   - Quálitas: especialista en AUTO (1 ramo).
 *   - GNP: multi-ramo (AUTO + HOGAR + VIDA + SALUD + GASTOS_MEDICOS + EMPRESARIAL).
 *
 * Por qué determinístico:
 *   - Tests no flaky: misma seed → mismos IDs.
 *   - Sandbox de UI: devs ven siempre los mismos casos.
 *   - Validación de la interfaz multi-ramo: si un día se añade un ramo más
 *     al plan, simplemente se añade a `supportedRamos` de la metadata.
 *
 * NO leer directamente desde el código del connector — el connector usa
 * helpers de lookup. Esto permite cambiar la fuente del mock (e.g. swap
 * por fetch a JSON local) sin tocar la clase.
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

export const GNP_NOMBRE = 'Grupo Nacional Provincial, S.A.B.';
export const GNP_RFC = 'GNP921109DP9'; // RFC genérico (12 chars persona moral simulada)
export const GNP_REGLAMENTO_INTERNO_URL = 'https://www.gnp.com.mx/reglamento';
export const GNP_SUPPORTED_RAMOS = [
  'AUTO',
  'HOGAR',
  'VIDA',
  'SALUD',
  'GASTOS_MEDICOS',
  'EMPRESARIAL',
] as const;

// ─── Clientes (catálogo mock GNP) ──────────────────────────────────────────

export interface GnpMockCliente {
  id: string;
  nombre: string;
  rfc: string;
  email: string;
  telefono?: string;
}

export const MOCK_CLIENTES: GnpMockCliente[] = [
  {
    id: 'cli-mx-101',
    nombre: 'Transportes Vargas S.A. de C.V.',
    rfc: 'TVA050120KL9',
    email: 'contacto@transportesvargas.com.mx',
    telefono: '+52 55 1111 2222',
  },
  {
    id: 'cli-mx-102',
    nombre: 'Laura Beatriz Mendoza Rivera',
    rfc: 'MERL801115AB3',
    email: 'laura.mendoza@example.com',
    telefono: '+52 33 2222 3333',
  },
  {
    id: 'cli-mx-103',
    nombre: 'Juan Pablo Reyes Aguilar',
    rfc: 'REAJ900302CD7',
    email: 'juan.reyes@example.com',
    telefono: '+52 81 3333 4444',
  },
  {
    id: 'cli-mx-104',
    nombre: 'María José Fuentes López',
    rfc: 'FULM870523EF2',
    email: 'mj.fuentes@example.com',
    telefono: '+52 55 4444 5555',
  },
  {
    id: 'cli-mx-105',
    nombre: 'Constructora del Pacífico S.A. de C.V.',
    rfc: 'CPA120815GH6',
    email: 'seguros@constructorapacifico.mx',
    telefono: '+52 33 5555 6666',
  },
  {
    id: 'cli-mx-106',
    nombre: 'Editorial Letra Grande S.C.',
    rfc: 'ELG950420JK4',
    email: 'admin@letragrande.mx',
    telefono: '+52 55 6666 7777',
  },
  {
    id: 'cli-mx-107',
    nombre: 'Carlos Andrés Domínguez Torres',
    rfc: 'DOTC821001LM8',
    email: 'carlos.dominguez@example.com',
    telefono: '+52 81 7777 8888',
  },
  {
    id: 'cli-mx-108',
    nombre: 'Inmobiliaria Norteña S.A. de C.V.',
    rfc: 'INO100810NP1',
    email: 'operacion@inmonortena.com',
    telefono: '+52 81 8888 9999',
  },
];

// ─── Productos (catálogo por ramo) ─────────────────────────────────────────

export interface GnpMockProducto {
  externalProductId: string;
  nombre: string;
  ramo: InsurerRam;
  primaAnualBase: number;
  sumaMaximaDefault: number;
  coberturas: string[];
}

export const MOCK_PRODUCTOS: GnpMockProducto[] = [
  // AUTO
  { externalProductId: 'gnp-auto-basico', nombre: 'GNP Auto Básico', ramo: 'AUTO', primaAnualBase: 7200, sumaMaximaDefault: 300000,
    coberturas: ['Responsabilidad Civil $1,000,000', 'Daños materiales deducible 8%', 'Robo total', 'Gastos médicos $40,000'] },
  { externalProductId: 'gnp-auto-mas', nombre: 'GNP Auto Más', ramo: 'AUTO', primaAnualBase: 11800, sumaMaximaDefault: 480000,
    coberturas: ['Todo lo básico', 'Auto sustituto 10 días', 'Asistencia vial 24/7', 'Cobertura nacional + frontera'] },
  { externalProductId: 'gnp-auto-elite', nombre: 'GNP Auto Elite', ramo: 'AUTO', primaAnualBase: 22500, sumaMaximaDefault: 800000,
    coberturas: ['Todo lo anterior', 'Deducible 0% daños', 'Auto sustituto 30 días', 'Cobertura mundial'] },
  // HOGAR
  { externalProductId: 'gnp-hogar-esencial', nombre: 'GNP Hogar Esencial', ramo: 'HOGAR', primaAnualBase: 4800, sumaMaximaDefault: 2500000,
    coberturas: ['Incendio y rayos', 'Daños por agua', 'Robo con violencia', 'Responsabilidad civil familiar'] },
  { externalProductId: 'gnp-hogar-premium', nombre: 'GNP Hogar Premium', ramo: 'HOGAR', primaAnualBase: 9800, sumaMaximaDefault: 5500000,
    coberturas: ['Todo lo esencial', 'Gastos adicionales por inhabitabilidad', 'Cobertura de joyas hasta $300,000', 'Asistencia hogar 24/7'] },
  // VIDA
  { externalProductId: 'gnp-vida-temporal', nombre: 'GNP Vida Temporal 20 años', ramo: 'VIDA', primaAnualBase: 6500, sumaMaximaDefault: 5000000,
    coberturas: ['Fallecimiento natural', 'Muerte accidental (doble)', 'Incapacidad total y permanente', 'Covertura mundial'] },
  { externalProductId: 'gnp-vida-entera', nombre: 'GNP Vida Entera', ramo: 'VIDA', primaAnualBase: 12200, sumaMaximaDefault: 8000000,
    coberturas: ['Fallecimiento (cualquier causa)', 'Muerte accidental', 'Enfermedades graves', 'Valor de rescate desde año 3'] },
  // SALUD
  { externalProductId: 'gnp-salud-individual', nombre: 'GNP Salud Individual', ramo: 'SALUD', primaAnualBase: 18500, sumaMaximaDefault: 0,
    coberturas: ['Hospitalización y cirugía', 'Honorarios médicos', 'Maternidad', 'Red de hospitales premium'] },
  { externalProductId: 'gnp-salud-familiar', nombre: 'GNP Salud Familiar', ramo: 'SALUD', primaAnualBase: 32000, sumaMaximaDefault: 0,
    coberturas: ['Cobertura para cónyuge + 4 hijos', 'Pediatría y ginecología', 'Estudios ilimitados', 'Vacunas cubiertas'] },
  // GASTOS_MEDICOS
  { externalProductId: 'gnp-gm-mayores', nombre: 'GNP GM Mayores 60+', ramo: 'GASTOS_MEDICOS', primaAnualBase: 28000, sumaMaximaDefault: 0,
    coberturas: ['Cobertura nacional', 'Reembolso + red directa', 'Enfermedades crónicas preexistentes', 'Tope anual $2M'] },
  { externalProductId: 'gnp-gm-elite', nombre: 'GNP GM Elite Internacional', ramo: 'GASTOS_MEDICOS', primaAnualBase: 56000, sumaMaximaDefault: 0,
    coberturas: ['Cobertura mundial', 'Habitación suite', 'Acompañante para menores', 'Tope anual $5M'] },
  // EMPRESARIAL
  { externalProductId: 'gnp-pyme', nombre: 'GNP PYME Integral', ramo: 'EMPRESARIAL', primaAnualBase: 35000, sumaMaximaDefault: 6000000,
    coberturas: ['Paquete multirramo PYME', 'Incendio edificio + contenidos', 'Responsabilidad civil', 'Robo + dinero en efectivo'] },
  { externalProductId: 'gnp-empresarial-plus', nombre: 'GNP Empresarial Plus', ramo: 'EMPRESARIAL', primaAnualBase: 95000, sumaMaximaDefault: 25000000,
    coberturas: ['Todo riesgo operativo', 'Rotura de maquinaria', 'Lucro cesante (12 meses)', 'Cobertura internacional'] },
];

// ─── Pólizas emitidas (mock histórico multi-ramo) ──────────────────────────

export const MOCK_POLIZAS: ExternalPolicy[] = [
  // AUTO
  {
    externalId: 'gnp-pol-2024-101',
    numeroPoliza: 'GNP-2024-101-AUTO',
    clienteId: 'cli-mx-101',
    clienteNombre: 'Transportes Vargas S.A. de C.V.',
    ramo: 'AUTO',
    productoNombre: 'GNP Auto Más (flotilla)',
    sumaAsegurada: 1800000,
    primaAnual: 142000,
    moneda: 'MXN',
    fechaInicio: new Date('2024-09-01'),
    fechaVencimiento: new Date('2026-09-01'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-101-AUTO.pdf',
  },
  {
    externalId: 'gnp-pol-2024-102',
    numeroPoliza: 'GNP-2024-102-AUTO',
    clienteId: 'cli-mx-102',
    clienteNombre: 'Laura Beatriz Mendoza Rivera',
    ramo: 'AUTO',
    productoNombre: 'GNP Auto Básico',
    sumaAsegurada: 280000,
    primaAnual: 7100,
    moneda: 'MXN',
    fechaInicio: new Date('2024-04-15'),
    fechaVencimiento: new Date('2026-04-15'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-102-AUTO.pdf',
  },
  {
    externalId: 'gnp-pol-2024-103',
    numeroPoliza: 'GNP-2024-103-AUTO',
    clienteId: 'cli-mx-107',
    clienteNombre: 'Carlos Andrés Domínguez Torres',
    ramo: 'AUTO',
    productoNombre: 'GNP Auto Elite',
    sumaAsegurada: 720000,
    primaAnual: 21800,
    moneda: 'MXN',
    fechaInicio: new Date('2024-12-01'),
    fechaVencimiento: new Date('2026-12-01'),
    estado: 'ACTIVA',
  },
  {
    externalId: 'gnp-pol-2023-099',
    numeroPoliza: 'GNP-2023-099-AUTO',
    clienteId: 'cli-mx-102',
    clienteNombre: 'Laura Beatriz Mendoza Rivera',
    ramo: 'AUTO',
    productoNombre: 'GNP Auto Básico',
    sumaAsegurada: 280000,
    primaAnual: 6900,
    moneda: 'MXN',
    fechaInicio: new Date('2023-04-15'),
    fechaVencimiento: new Date('2024-04-15'),
    estado: 'VENCIDA',
  },
  // HOGAR
  {
    externalId: 'gnp-pol-2024-201',
    numeroPoliza: 'GNP-2024-201-HOGAR',
    clienteId: 'cli-mx-103',
    clienteNombre: 'Juan Pablo Reyes Aguilar',
    ramo: 'HOGAR',
    productoNombre: 'GNP Hogar Premium',
    sumaAsegurada: 4800000,
    primaAnual: 9500,
    moneda: 'MXN',
    fechaInicio: new Date('2024-06-01'),
    fechaVencimiento: new Date('2027-06-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-201-HOGAR.pdf',
  },
  {
    externalId: 'gnp-pol-2024-202',
    numeroPoliza: 'GNP-2024-202-HOGAR',
    clienteId: 'cli-mx-104',
    clienteNombre: 'María José Fuentes López',
    ramo: 'HOGAR',
    productoNombre: 'GNP Hogar Esencial',
    sumaAsegurada: 2200000,
    primaAnual: 4600,
    moneda: 'MXN',
    fechaInicio: new Date('2024-10-15'),
    fechaVencimiento: new Date('2026-10-15'),
    estado: 'PROXIMA_A_VENCER',
  },
  // VIDA
  {
    externalId: 'gnp-pol-2024-301',
    numeroPoliza: 'GNP-2024-301-VIDA',
    clienteId: 'cli-mx-103',
    clienteNombre: 'Juan Pablo Reyes Aguilar',
    ramo: 'VIDA',
    productoNombre: 'GNP Vida Temporal 20 años',
    sumaAsegurada: 3500000,
    primaAnual: 6200,
    moneda: 'MXN',
    fechaInicio: new Date('2024-01-01'),
    fechaVencimiento: new Date('2044-01-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-301-VIDA.pdf',
  },
  {
    externalId: 'gnp-pol-2024-302',
    numeroPoliza: 'GNP-2024-302-VIDA',
    clienteId: 'cli-mx-107',
    clienteNombre: 'Carlos Andrés Domínguez Torres',
    ramo: 'VIDA',
    productoNombre: 'GNP Vida Entera',
    sumaAsegurada: 5000000,
    primaAnual: 11800,
    moneda: 'MXN',
    fechaInicio: new Date('2024-12-01'),
    fechaVencimiento: new Date('2054-12-01'),
    estado: 'ACTIVA',
  },
  // SALUD
  {
    externalId: 'gnp-pol-2024-401',
    numeroPoliza: 'GNP-2024-401-SALUD',
    clienteId: 'cli-mx-104',
    clienteNombre: 'María José Fuentes López',
    ramo: 'SALUD',
    productoNombre: 'GNP Salud Individual',
    sumaAsegurada: 0,
    primaAnual: 18200,
    moneda: 'MXN',
    fechaInicio: new Date('2024-07-01'),
    fechaVencimiento: new Date('2026-07-01'),
    estado: 'PROXIMA_A_VENCER',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-401-SALUD.pdf',
  },
  // GASTOS_MEDICOS
  {
    externalId: 'gnp-pol-2024-501',
    numeroPoliza: 'GNP-2024-501-GM',
    clienteId: 'cli-mx-104',
    clienteNombre: 'María José Fuentes López',
    ramo: 'GASTOS_MEDICOS',
    productoNombre: 'GNP GM Mayores 60+',
    sumaAsegurada: 0,
    primaAnual: 27500,
    moneda: 'MXN',
    fechaInicio: new Date('2024-09-01'),
    fechaVencimiento: new Date('2025-09-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-501-GM.pdf',
  },
  // EMPRESARIAL
  {
    externalId: 'gnp-pol-2024-601',
    numeroPoliza: 'GNP-2024-601-EMP',
    clienteId: 'cli-mx-105',
    clienteNombre: 'Constructora del Pacífico S.A. de C.V.',
    ramo: 'EMPRESARIAL',
    productoNombre: 'GNP Empresarial Plus',
    sumaAsegurada: 22000000,
    primaAnual: 92000,
    moneda: 'MXN',
    fechaInicio: new Date('2024-02-01'),
    fechaVencimiento: new Date('2027-02-01'),
    estado: 'ACTIVA',
    documentoUrl: 'https://api.gnp.com.mx/policies/GNP-2024-601-EMP.pdf',
  },
  {
    externalId: 'gnp-pol-2024-602',
    numeroPoliza: 'GNP-2024-602-EMP',
    clienteId: 'cli-mx-106',
    clienteNombre: 'Editorial Letra Grande S.C.',
    ramo: 'EMPRESARIAL',
    productoNombre: 'GNP PYME Integral',
    sumaAsegurada: 4500000,
    primaAnual: 32500,
    moneda: 'MXN',
    fechaInicio: new Date('2024-05-01'),
    fechaVencimiento: new Date('2026-05-01'),
    estado: 'PROXIMA_A_VENCER',
  },
];

// ─── Helpers del mock ──────────────────────────────────────────────────────

let nextClaimSequence = 5000;
let nextIssueSequence = 200;

export function fetchMockPolicies(input: FetchPoliciesInput): FetchPoliciesResult {
  let filtered = MOCK_POLIZAS.slice();
  if (input.clienteId) filtered = filtered.filter((p) => p.clienteId === input.clienteId);
  if (input.aseguradoraId) filtered = filtered.filter((p) => p.externalId.includes(input.aseguradoraId!));
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
  // GNP emite por ramo: AUTO, HOGAR, VIDA, SALUD, GM, EMP (no acepta números > 6 chars).
  const ramoSuffix = input.producto.ramo === 'GASTOS_MEDICOS'
    ? 'GM'
    : input.producto.ramo === 'EMPRESARIAL'
      ? 'EMP'
      : input.producto.ramo;
  return {
    externalId: `gnp-pol-2025-${seq}`,
    numeroPoliza: `GNP-2025-${seq}-${ramoSuffix}`,
    primaAnual: input.primaAnual,
    emision: 1,
    documentoUrl: `https://api.gnp.com.mx/policies/GNP-2025-${seq}-${ramoSuffix}.pdf`,
    mensaje: `Póliza ${ramoSuffix} emitida por GNP. El cliente firmará digitalmente en 48h hábiles.`,
  };
}

export function submitMockClaim(
  input: SubmitClaimInput,
  matchedPolicy: ExternalPolicy,
): SubmitClaimResult {
  const seq = String(nextClaimSequence++);
  // SALUD y GM tienen sumaAsegurada=0 por modelo de negocio (no hay tope
  // numérico). El conector ya skipea el check de cobertura en ese caso;
  // acá también debemos tratarlo como "sin cobertura numérica" y nunca
  // marcar exceedsCoverage.
  const hasNumericCoverage = matchedPolicy.sumaAsegurada > 0;
  const exceedsCoverage =
    hasNumericCoverage && input.montoReclamado > matchedPolicy.sumaAsegurada;
  return {
    externalClaimId: `GNP-CLM-${seq}`,
    estado: exceedsCoverage ? 'EN_VALIDACION' : 'RECIBIDO',
    montoEstimadoIndemnizacion: exceedsCoverage
      ? undefined
      : Math.round(input.montoReclamado * 0.92),
    slaRespuestaHoras: exceedsCoverage ? 72 : 48,
    mensaje: exceedsCoverage
      ? `Siniestro ${seq} recibido. Monto reclamado excede cobertura. Validación adicional 72h.`
      : `Siniestro ${seq} recibido. Dictamen inicial en 48h hábiles.`,
  };
}
