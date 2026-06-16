/**
 * compliance-rules.ts
 * 
 * Definiciones de reglas de compliance para procesos obligatorios no evitables.
 * Cada regla describe una condición que debe cumplirse antes de permitir una acción.
 * 
 * Las reglas solo se aplican cuando el tenant está en modo 'compliance'.
 */

import { prisma } from '@/lib/db';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type ComplianceAction =
  | 'deal_close_won'          // Cerrar deal como ganado
  | 'deal_close_lost'         // Cerrar deal como perdido
  | 'deal_stage_change'       // Cambiar etapa del deal
  | 'contrato_make_vigente'   // Marcar contrato como vigente
  | 'contrato_send'           // Enviar contrato al cliente
  | 'cotizacion_send'         // Enviar cotización al cliente
  | 'cotizacion_accept'       // Aceptar cotización
  | 'pipeline_advance'        // Avanzar de etapa en pipeline
  | 'pipeline_delete'         // Eliminar pipeline
  | 'pipeline_stage_create'   // Crear etapa de pipeline
  | 'pipeline_stage_modify'   // Modificar/desactivar etapa de pipeline
  | 'contact_delete'          // Eliminar contacto
  | 'deal_delete';            // Eliminar deal

export interface ComplianceRule {
  id: string;
  action: ComplianceAction;
  name: string;
  description: string;
  /** Mensaje de error cuando se bloquea */
  blockMessage: string;
  /** Acción requerida para desbloquear */
  requiredAction: string;
  /** Función de evaluación: retorna true si la acción está permitida */
  evaluate: (context: RuleContext) => Promise<RuleResult>;
  /** Prioridad de la regla */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Si está activa por defecto */
  active: boolean;
}

export interface RuleContext {
  tenantId: string;
  userId: string;
  /** ID de la entidad afectada */
  entityId: string;
  /** Tipo de entidad */
  entityType: 'deal' | 'contrato' | 'cotizacion' | 'contact' | 'pipeline' | 'pipeline_stage';
  /** Datos adicionales del contexto */
  metadata?: Record<string, any>;
}

export interface RuleResult {
  allowed: boolean;
  reason?: string;
  requiredAction?: string;
  /** Detalle de lo que falta */
  missingRequirements?: string[];
}

/* ─── Reglas Predefinidas ──────────────────────────────────────────────────── */

/**
 * Regla 1: No cerrar un deal como ganado sin contrato firmado
 */
const ruleDealCloseWonRequiresContract: ComplianceRule = {
  id: 'deal_close_won_requires_contract',
  action: 'deal_close_won',
  name: 'Contrato firmado requerido para cerrar deal',
  description: 'No se puede cerrar un deal como ganado si no tiene al menos un contrato en estado vigente o firmado',
  blockMessage: 'Este deal requiere un contrato firmado antes de marcarse como ganado.',
  requiredAction: 'Crea y envía un contrato para firma digital desde la sección de Contratos.',
  priority: 'HIGH',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    const contratos = await prisma.contrato.findMany({
      where: {
        dealId: context.entityId,
        tenantId: context.tenantId,
        estado: { in: ['vigente', 'firmado'] },
      },
      take: 1,
    });

    if (contratos.length > 0) {
      return { allowed: true };
    }

    // Verificar si hay contratos aunque sean en borrador
    const contratosBorrador = await prisma.contrato.count({
      where: {
        dealId: context.entityId,
        tenantId: context.tenantId,
      },
    });

    return {
      allowed: false,
      reason: 'No hay ningún contrato firmado asociado a este deal',
      requiredAction: 'Crea un contrato desde el deal y asegúrate de que esté firmado digitalmente',
      missingRequirements: [
        contratosBorrador === 0
          ? 'Crear un contrato asociado al deal'
          : 'El contrato existente debe ser firmado digitalmente por ambas partes',
      ],
    };
  },
};

/**
 * Regla 2: No marcar contrato como vigente sin firma digital completa
 */
const ruleContratoRequiresSignature: ComplianceRule = {
  id: 'contrato_requires_signature',
  action: 'contrato_make_vigente',
  name: 'Firma digital requerida antes de activar contrato',
  description: 'No se puede marcar un contrato como vigente si no tiene ambas firmas (cliente y empresa)',
  blockMessage: 'El contrato debe tener ambas firmas digitales antes de activarse.',
  requiredAction: 'Espera a que ambas partes firmen el contrato digitalmente.',
  priority: 'HIGH',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    const contrato = await prisma.contrato.findUnique({
      where: { id: context.entityId },
      select: {
        firmadoPorCliente: true,
        firmadoPorEmpresa: true,
        estado: true,
      },
    });

    if (!contrato) {
      return { allowed: false, reason: 'Contrato no encontrado' };
    }

    if (contrato.firmadoPorCliente && contrato.firmadoPorEmpresa) {
      return { allowed: true };
    }

    const missing = [];
    if (!contrato.firmadoPorCliente) missing.push('Firma del cliente pendiente');
    if (!contrato.firmadoPorEmpresa) missing.push('Firma de la empresa pendiente');

    return {
      allowed: false,
      reason: 'El contrato no tiene todas las firmas requeridas',
      requiredAction: 'Completa el proceso de firma digital para ambas partes',
      missingRequirements: missing,
    };
  },
};

/**
 * Regla 3: No avanzar pipeline sin tareas obligatorias completadas
 * Busca tareas de tipo 'obligatoria' asociadas al lead del deal
 */
const rulePipelineRequiresTasks: ComplianceRule = {
  id: 'pipeline_requires_tasks',
  action: 'pipeline_advance',
  name: 'Tareas obligatorias requeridas para avanzar etapa',
  description: 'No se puede avanzar de etapa sin completar las tareas obligatorias configuradas',
  blockMessage: 'Debes completar las tareas obligatorias antes de avanzar de etapa.',
  requiredAction: 'Revisa y completa las tareas pendientes asociadas a este deal.',
  priority: 'MEDIUM',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    // Obtener el deal para encontrar su leadId
    const deal = await prisma.deal.findUnique({
      where: { id: context.entityId },
      select: { leadId: true, contactId: true },
    });

    if (!deal) {
      return { allowed: true }; // Deal no encontrado, permitir
    }

    // Buscar tareas de tipo 'obligatoria' asociadas al lead o contacto del deal
    const tareasObligatorias = await prisma.task.findMany({
      where: {
        tenantId: context.tenantId,
        tipo: 'obligatoria',
        completada: false,
        OR: [
          ...(deal.leadId ? [{ leadId: deal.leadId }] : []),
          ...(deal.contactId ? [{ contactId: deal.contactId }] : []),
        ],
      },
      select: { id: true, titulo: true, descripcion: true },
    });

    if (tareasObligatorias.length === 0) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Hay ${tareasObligatorias.length} tarea(s) obligatoria(s) sin completar para avanzar de etapa`,
      requiredAction: 'Completa todas las tareas obligatorias antes de continuar',
      missingRequirements: tareasObligatorias.map(t => `"${t.titulo}" — ${t.descripcion || 'Sin descripción'}`),
    };
  },
};

/**
 * Regla 4: No enviar cotización si el monto supera umbral sin aprobación
 */
const ruleCotizacionRequiresApproval: ComplianceRule = {
  id: 'cotizacion_requires_approval',
  action: 'cotizacion_send',
  name: 'Aprobación requerida para cotizaciones de alto valor',
  description: 'Cotizaciones con total superior a 5.000€ requieren aprobación de un Manager antes de enviarse',
  blockMessage: 'Esta cotización supera el umbral de 5.000€ y requiere aprobación.',
  requiredAction: 'Solicita aprobación a un Manager desde el panel de Aprobaciones.',
  priority: 'MEDIUM',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: context.entityId },
      select: { total: true, moneda: true, estado: true },
    });

    if (!cotizacion) {
      return { allowed: false, reason: 'Cotización no encontrada' };
    }

    // Umbral: 5.000€ (configurable)
    const UMBRAL = 5000;

    if (cotizacion.total <= UMBRAL) {
      return { allowed: true };
    }

    // Verificar si ya existe una aprobación para esta cotización
    // Buscar approval requests cuyo intent coincida exactamente con el ID de la cotización
    const todasAprobaciones = await prisma.approvalRequest.findMany({
      where: {
        tenantId: context.tenantId,
        status: 'approved',
      },
      orderBy: { resolvedAt: 'desc' },
      select: { id: true, intent: true, params: true, resolvedAt: true },
    });

    // Filtrar en memoria para encontrar la aprobación específica de esta cotización
    const aprobacion = todasAprobaciones.find(a => {
      const p = a.params as Record<string, any>;
      return p?.entityId === context.entityId || p?.cotizacionId === context.entityId;
    });

    if (aprobacion) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cotización de ${cotizacion.total.toLocaleString()} ${cotizacion.moneda} supera el umbral de ${UMBRAL.toLocaleString()} ${cotizacion.moneda}`,
      requiredAction: `Solicita aprobación de un Manager desde Aprobaciones para esta cotización`,
      missingRequirements: [`Aprobación de Manager para cotización > ${UMBRAL.toLocaleString()} ${cotizacion.moneda}`],
    };
  },
};

/**
 * Regla 5: No eliminar contacto sin justificación escrita
 */
const ruleContactDeleteRequiresJustification: ComplianceRule = {
  id: 'contact_delete_requires_justification',
  action: 'contact_delete',
  name: 'Justificación requerida para eliminar contacto',
  description: 'No se puede eliminar un contacto sin proporcionar una justificación escrita',
  blockMessage: 'Debes proporcionar una justificación para eliminar este contacto.',
  requiredAction: 'Incluye el motivo de eliminación en el campo de justificación.',
  priority: 'LOW',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    // Esta regla requiere que el metadata incluya 'justification'
    const hasJustification = context.metadata?.justification &&
      typeof context.metadata.justification === 'string' &&
      context.metadata.justification.trim().length >= 10;

    if (hasJustification) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'No se proporcionó justificación para eliminar el contacto',
      requiredAction: 'Escribe una justificación de al menos 10 caracteres explicando el motivo de la eliminación',
      missingRequirements: ['Justificación escrita (mín. 10 caracteres)'],
    };
  },
};

/**
 * Regla 6: No cerrar deal como perdido sin registrar razón
 */
const ruleDealCloseLostRequiresReason: ComplianceRule = {
  id: 'deal_close_lost_requires_reason',
  action: 'deal_close_lost',
  name: 'Razón requerida para cerrar deal como perdido',
  description: 'No se puede cerrar un deal como perdido sin registrar la razón',
  blockMessage: 'Debes registrar el motivo por el que se perdió el deal.',
  requiredAction: 'Completa el campo "Razón de pérdida" antes de marcar como perdido.',
  priority: 'MEDIUM',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    const hasReason = context.metadata?.razonPerdida &&
      typeof context.metadata.razonPerdida === 'string' &&
      context.metadata.razonPerdida.trim().length >= 5;

    if (hasReason) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'No se registró la razón de pérdida del deal',
      requiredAction: 'Completa el campo "Razón de pérdida" con el motivo',
      missingRequirements: ['Razón de pérdida documentada'],
    };
  },
};

/**
 * Regla 7: No eliminar pipeline sin justificación escrita y manejo de deals activos
 */
const rulePipelineDeleteRequiresJustification: ComplianceRule = {
  id: 'pipeline_delete_requires_justification',
  action: 'pipeline_delete',
  name: 'Justificación requerida para eliminar pipeline',
  description: 'No se puede eliminar un pipeline sin justificación escrita y plan de migración de deals activos',
  blockMessage: 'Debes proporcionar una justificación y migrar los deals activos antes de eliminar el pipeline.',
  requiredAction: 'Incluye una justificación escrita y un pipeline destino para migrar los deals activos.',
  priority: 'MEDIUM',
  active: true,
  evaluate: async (context: RuleContext): Promise<RuleResult> => {
    const hasJustification = context.metadata?.justification &&
      typeof context.metadata.justification === 'string' &&
      context.metadata.justification.trim().length >= 10;

    if (!hasJustification) {
      return {
        allowed: false,
        reason: 'No se proporcionó justificación para eliminar el pipeline',
        requiredAction: 'Escribe una justificación de al menos 10 caracteres explicando el motivo',
        missingRequirements: ['Justificación escrita (mín. 10 caracteres)'],
      };
    }

    // Verificar que no haya deals activos sin migrar
    const dealsActivos = context.metadata?.dealsActivos;
    if (typeof dealsActivos === 'number' && dealsActivos > 0) {
      const migrateToPipelineId = context.metadata?.migrateToPipelineId;
      if (!migrateToPipelineId) {
        return {
          allowed: false,
          reason: `Hay ${dealsActivos} deals activos en este pipeline sin pipeline destino para migración`,
          requiredAction: 'Selecciona un pipeline destino para migrar los deals activos antes de eliminar',
          missingRequirements: [`Pipeline destino para migrar ${dealsActivos} deals activos`],
        };
      }
    }

    return { allowed: true };
  },
};

/* ─── Registry ─────────────────────────────────────────────────────────────── */

/**
 * Todas las reglas de compliance disponibles
 */
export const COMPLIANCE_RULES: ComplianceRule[] = [
  ruleDealCloseWonRequiresContract,
  ruleContratoRequiresSignature,
  rulePipelineRequiresTasks,
  ruleCotizacionRequiresApproval,
  ruleContactDeleteRequiresJustification,
  ruleDealCloseLostRequiresReason,
  rulePipelineDeleteRequiresJustification,
];

/**
 * Obtiene las reglas aplicables para una acción específica
 */
export function getRulesForAction(action: ComplianceAction): ComplianceRule[] {
  return COMPLIANCE_RULES.filter(r => r.active && r.action === action);
}

/**
 * Obtiene todas las reglas activas
 */
export function getActiveRules(): ComplianceRule[] {
  return COMPLIANCE_RULES.filter(r => r.active);
}
