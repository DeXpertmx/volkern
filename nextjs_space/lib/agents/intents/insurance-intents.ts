import { IntentSchema } from './types';

/**
 * Intenciones del módulo de Seguros (Insurance vertical).
 * Pólizas, renovaciones, aseguradoras, productos y cartera IA.
 */
export const insuranceIntents: IntentSchema[] = [
  {
    name: 'crear_poliza',
    description: 'Registrar una nueva póliza de seguro para un cliente (requiere aseguradora, número y fecha de vencimiento; si no se indica fecha de inicio se usa hoy)',
    requiredParams: ['numeroPoliza', 'fechaVencimiento', 'aseguradora'],
    optionalParams: ['fechaInicio', 'cliente', 'nombre', 'email', 'producto', 'ramo', 'primaAnual', 'sumaAsegurada', 'formaPago', 'moneda', 'notas'],
    examples: [
      'registra la póliza AXA-1234 para Juan Pérez con vencimiento el 2026-12-31',
      'crea una póliza para maria@empresa.com: producto Vida, aseguradora AXA, prima 850',
      'nueva póliza: número P-001, cliente Carlos Ruiz, hogar MAPFRE, inicia hoy, vence en 1 año',
      'agrega la póliza 8888 de auto para juan@mail.com con vencimiento el 2027-06-30'
    ],
    destructive: false
  },
  {
    name: 'mis_polizas',
    description: 'Listar las pólizas del tenant con filtros opcionales (estado, cliente, ramo, aseguradora)',
    requiredParams: [],
    optionalParams: ['estado', 'cliente', 'nombre', 'email', 'ramo', 'aseguradora', 'page', 'limit'],
    examples: [
      'muéstrame las pólizas',
      'lista las pólizas activas',
      'qué pólizas tiene Juan Pérez',
      'pólizas del ramo auto',
      'ver pólizas de AXA'
    ],
    destructive: false
  },
  {
    name: 'polizas_por_vencer',
    description: 'Consultar pólizas próximas a vencer (por defecto en los próximos 30 días, configurable)',
    requiredParams: [],
    optionalParams: ['dias', 'estado'],
    examples: [
      'qué pólizas vencen pronto',
      'pólizas por vencer en 60 días',
      'muéstrame las pólizas que vencen este mes',
      'renovaciones en los próximos 30 días'
    ],
    destructive: false
  },
  {
    name: 'renovaciones_pendientes',
    description: 'Consultar renovaciones pendientes o en proceso, con riesgo de pérdida',
    requiredParams: [],
    optionalParams: ['estado', 'riesgo'],
    examples: [
      'qué renovaciones están pendientes',
      'renovaciones en riesgo de perderse',
      'estado de las renovaciones',
      'renovaciones con oferta enviada'
    ],
    destructive: false
  },
  {
    name: 'clientes_sin_contacto',
    description: 'Detectar clientes asegurados sin contacto reciente (diferencial de cartera)',
    requiredParams: [],
    optionalParams: ['dias', 'limit'],
    examples: [
      'qué clientes no tienen contacto hace tiempo',
      'clientes asegurados sin actividad en 6 meses',
      'dame los clientes abandonados',
      'clientes sin contacto en 90 días'
    ],
    destructive: false
  },
  {
    name: 'crear_siniestro',
    description: 'Reportar un siniestro contra una póliza (requiere póliza y descripción; el cliente y la aseguradora se resuelven desde la póliza)',
    requiredParams: ['poliza', 'descripcion'],
    optionalParams: ['cliente', 'numeroSiniestro', 'fechaSuceso', 'fechaReporte', 'montoReclamado', 'deducible', 'moneda', 'estado', 'notas'],
    examples: [
      'reporta un siniestro para la póliza AXA-1234: colisión leve, monto reclamado 1500',
      'crea un siniestro contra POL-001 de Juan Pérez con fecha suceso 2026-07-15',
      'registra un siniestro de la póliza 8888: daño por agua en el local',
      'nuevo siniestro de auto: choque en estacionamiento, reclamado 30000 MXN'
    ],
    destructive: false
  },
  {
    name: 'listar_siniestros',
    description: 'Listar siniestros del tenant con filtros opcionales (estado, cliente, aseguradora)',
    requiredParams: [],
    optionalParams: ['estado', 'cliente', 'aseguradora', 'page', 'limit'],
    examples: [
      'muéstrame los siniestros',
      'qué siniestros están abiertos',
      'lista los siniestros rechazados',
      'siniestros de AXA',
      'cuántos siniestros tiene Juan Pérez'
    ],
    destructive: false
  },
  {
    name: 'actualizar_siniestro',
    description: 'Avanzar el estado de un siniestro (REPORTADO → EN_TRAMITE → ABIERTO → PAGADO/RECHAZADO → CERRADO). PAGADO requiere monto indemnizado; RECHAZADO requiere motivo',
    requiredParams: ['siniestro', 'estado'],
    optionalParams: ['montoIndemnizado', 'motivoRechazo', 'notas', 'fechaCierre'],
    examples: [
      'pasa el siniestro SIN-001 a en trámite',
      'marca como pagado el siniestro de la póliza AXA-1234 con indemnización 1200',
      'rechaza el siniestro SIN-002 por no estar cubierto',
      'cierra el siniestro SIN-003'
    ],
    destructive: false
  },
];
