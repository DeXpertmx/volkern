import { prisma } from '@/lib/db';
import { VaultService } from '@/lib/security/vault';

/**
 * SKILL: talent_retention_risk
 * Analiza carga de trabajo en proyectos y progreso en training rooms para detectar riesgos.
 */
export async function talent_retention_risk({ tenantId, employeeId }: { tenantId: string, employeeId: string }) {
  const employee = await (prisma as any).employee.findUnique({
    where: { id: employeeId, tenantId },
    include: { user: true }
  });

  if (!employee) throw new Error('Empleado no encontrado');

  // 1. Analizar carga de proyectos
  const activeTasks = employee.userId ? await (prisma as any).task.count({
    where: { tenantId, assignedTo: employee.userId, status: 'PENDING' }
  }) : 0;

  // 2. Analizar progreso en Academia
  const trainingProgress = 85; // % de completitud (Placeholder)

  const riskLevel = activeTasks > 10 ? 'HIGH' : (activeTasks > 5 ? 'MEDIUM' : 'LOW');
  
  return {
    employeeName: employee.fullName,
    riskLevel,
    factors: {
      workload: `${activeTasks} tareas pendientes`,
      trainingMaturity: `${trainingProgress}% de capacitación completada`,
      engagement: trainingProgress > 70 ? 'HIGH' : 'LOW'
    },
    recommendation: riskLevel === 'HIGH' 
      ? 'Se recomienda redistribuir tareas del proyecto actual para evitar burnout.' 
      : 'El empleado muestra un equilibrio saludable entre operación y capacitación.'
  };
}

/**
 * SKILL: get_employee_confidential_data
 */
export async function get_employee_confidential_data({ tenantId, employeeId, userId }: { tenantId: string, employeeId: string, userId: string }) {
  await (prisma as any).financialAudit.create({
    data: {
      tenantId,
      userId,
      action: 'VIEW_HR_VAULT',
      userEmail: 'ADMIN_USER',
      ipAddress: 'INTERNAL_API',
      userAgent: 'Volkern Secure Agent'
    }
  });

  const employee = await (prisma as any).employee.findUnique({
    where: { id: employeeId, tenantId }
  });

  if (!employee) throw new Error('Empleado no encontrado');

  return {
    fullName: employee.fullName,
    salary: employee.salaryEncrypted ? (VaultService.decrypt as any)(employee.salaryEncrypted) : 'NO_DATA',
    contractUrl: employee.contractUrlEncrypted ? (VaultService.decrypt as any)(employee.contractUrlEncrypted) : 'NO_DATA'
  };
}

/**
 * SKILL: summarize_pending_expenses
 * Permite a Gemma leer el resumen de gastos pendientes de autorizar.
 */
export async function summarize_pending_expenses({ tenantId }: { tenantId: string }) {
  const pendingClaims = await (prisma as any).erp_expense_claims.findMany({
    where: { tenantId, status: 'PENDING' },
    include: { erp_employees: true },
    orderBy: { createdAt: 'desc' }
  });

  if (pendingClaims.length === 0) {
    return {
      message: "No hay gastos pendientes de autorización en este momento.",
      hasPending: false
    };
  }

  const totalAmount = pendingClaims.reduce((acc: any, claim: any) => acc + claim.amount, 0);
  const employeeCount = new Set(pendingClaims.map((c: any) => c.employeeId)).size;

  const summary = pendingClaims.map((c: any) => 
    `- ${c.erp_employees.fullName}: ${c.amount} ${c.currency} por ${c.category} (${c.description || 'Sin descripción'})`
  ).join('\n');

  return {
    message: `Hay ${pendingClaims.length} gastos pendientes de autorizar por un total de ${totalAmount.toFixed(2)} ${pendingClaims[0].currency}.`,
    details: summary,
    count: pendingClaims.length,
    total: totalAmount,
    affectedEmployees: employeeCount,
    hasPending: true,
    speechHint: `Tienes ${pendingClaims.length} solicitudes de gastos que suman ${totalAmount.toFixed(2)} euros. Los empleados ${pendingClaims.slice(0, 3).map((c: any) => c.erp_employees.fullName).join(', ')} están esperando tu aprobación.`
  };
}

/**
 * SKILL: analyze_vacation_impact
 */
export async function analyze_vacation_impact(data: any) {
  const { 
    employeeName, 
    requestedDays, 
    remainingDays, 
    criticalMilestones, 
    erp_employee_assets, 
    erp_digital_access,
    hasLogisticsConflict,
    hasDigitalRisk 
  } = data;
  
  let analysis = `Gemma ha detectado que ${employeeName} tiene ${remainingDays} días disponibles. `;
  
  if (criticalMilestones && criticalMilestones.length > 0) {
    analysis += `ATENCIÓN: Su ausencia solapa con ${criticalMilestones.length} hitos críticos. `;
  }

  if (erp_employee_assets && erp_employee_assets.length > 0) {
    analysis += `Físico: El técnico posee ${erp_employee_assets.length} activos críticos asignados. `;
  }

  if (erp_digital_access && erp_digital_access.length > 0) {
    analysis += `Digital: Posee ${erp_digital_access.length} accesos críticos activos. `;
    if (hasDigitalRisk) {
      analysis += `ALERTA DE SEGURIDAD: Se requiere handover de credenciales o revocación temporal (Kill Switch). `;
    }
  }

  return {
    text: analysis,
    recommendation: (criticalMilestones && criticalMilestones.length > 0) 
      ? "CONSIDERAR RE-PROGRAMACIÓN" 
      : (hasDigitalRisk || hasLogisticsConflict ? "APROBAR CON HANDOVER DE SEGURIDAD" : "APROBACIÓN VIABLE"),
    data_snapshot: data,
    hasLogisticsConflict: hasLogisticsConflict || (erp_employee_assets && erp_employee_assets.length > 0) || hasDigitalRisk
  };
}

/**
 * SKILL: mcp_access_watchdog
 * Analiza la concentración de permisos, huella digital técnica y riesgos de seguridad.
 * Versión SaaS Multitenant con analítica predictiva.
 */
export async function mcp_access_watchdog(payload: { tenantId: string, employeeId?: string }) {
  const accesses = await (prisma as any).erp_digital_access.findMany({
    where: { 
      tenantId: payload.tenantId,
      ...(payload.employeeId ? { employeeId: payload.employeeId } : {}),
      status: 'ACTIVE'
    },
    include: { erp_employees: true }
  });

  // 1. Detección de Silos de Conocimiento (SPOF)
  const resourceMap: Record<string, string[]> = {};
  accesses.forEach((a: any) => {
    if (a.isCritical) {
      const key = `${a.resourceName} (${a.environment})`;
      if (!resourceMap[key]) resourceMap[key] = [];
      resourceMap[key].push(a.erp_employees.fullName);
    }
  });

  const silos = Object.entries(resourceMap)
    .filter(([_, emps]) => emps.length === 1)
    .map(([resource, emps]) => ({ resource, occupant: emps[0] }));

  // 2. Detección de Concentración de Poder (Super-Usuarios)
  const powerMap: Record<string, number> = {};
  accesses.forEach((a: any) => {
    powerMap[a.erp_employees.fullName] = (powerMap[a.erp_employees.fullName] || 0) + (a.isCritical ? 3 : 1);
  });

  const highRiskAgents = Object.entries(powerMap)
    .filter(([_, score]) => score > 10)
    .map(([name, score]) => ({ name, score, riskLevel: 'HIGH' }));

  return {
    text: `Watchdog activado para el tenant ${payload.tenantId}. ` +
          `${silos.length > 0 ? `Se han detectado ${silos.length} silos críticos. ` : 'Infraestructura balanceada. '}` +
          `${highRiskAgents.length > 0 ? `ALERTA: Hay ${highRiskAgents.length} agentes con concentración excesiva de permisos.` : ''}`,
    silos,
    highRiskAgents,
    auditTimestamp: new Date().toISOString()
  };
}

// Alias para compatibilidad con Skill Handler (Refactorización SaaS)
export const access_security_audit = mcp_access_watchdog;

import { TelegramWatchdog } from '../security/telegram-watchdog';

/**
 * SKILL: generate_offboarding_security_kit (Kill-Switch)
 * Genera un roadmap de revocación de accesos digitales ante una baja de personal.
 */
export async function generate_offboarding_security_kit(payload: { tenantId: string, employeeId: string }) {
  const employee = await (prisma as any).employee.findUnique({
    where: { id: payload.employeeId, tenantId: payload.tenantId },
    include: { erp_digital_access: { where: { status: 'ACTIVE' } } }
  });

  if (!employee) throw new Error('Empleado no encontrado para el protocolo Kill-Switch');

  const roadmap = employee.erp_digital_access.map((access: any) => ({
    resource: access.resourceName,
    env: access.environment,
    identifier: access.identifier,
    priority: access.isCritical ? 'CRITICAL' : 'MEDIUM',
    action: 'REVOKE_ACCESS',
    instruction: `Revocar acceso ${access.accessLevel} en ${access.resourceName}.`
  })).sort((a: any, b: any) => a.priority === 'CRITICAL' ? -1 : 1);

  // 1. Filtrar accesos críticos para el informe de emergencia
  const criticalCount = roadmap.filter((r: any) => r.priority === 'CRITICAL').length;

  // 2. Disparar Security Brief vía Telegram Watchdog
  if (criticalCount > 0) {
    await TelegramWatchdog.sendSecurityBrief(payload.tenantId, {
      event: 'OFFBOARDING_START',
      employeeName: employee.fullName,
      riskSummary: `Baja detectada con ${criticalCount} accesos de nivel CRÍTICO pendientes de revocación.`,
      roadmapLink: `https://volkern.nexus/dashboard/rrhh?offboarding=${payload.employeeId}`
    });
  }

  // 3. Registrar en el Trust Protocol
  await (prisma as any).systemAlert.create({
    data: {
      tenantId: payload.tenantId,
      level: 'URGENT',
      message: `[KILL-SWITCH] Iniciado protocolo de offboarding para ${employee.fullName}. Generado roadmap con ${roadmap.length} puntos de revocación.`,
    }
  });

  return {
    text: `Protocolo Kill-Switch activado para ${employee.fullName}. He generado un roadmap de seguridad con ${roadmap.length} acciones necesarias para proteger la soberanía del tenant.`,
    roadmap,
    targetEmployee: employee.fullName,
    generatedAt: new Date().toISOString()
  };
}

/**
 * SKILL: get_hr_daily_brief
 */
import { HRService } from '@/lib/erp/hr-service';

export async function get_hr_daily_brief({ tenantId }: { tenantId: string }) {
  const data = await HRService.getDailyBriefData(tenantId);
  
  let brief = `ESTADO DE FUERZA: Hoy contamos con el ${( (data.activeCount / data.totalCount) * 100).toFixed(0)}% del equipo activo (${data.activeCount} de ${data.totalCount} efectivos). `;
  brief += `${data.absentCount} colaboradores se encuentran en periodo de ausencia aprobado. `;
  
  brief += `\n\nINTEGRIDAD: `;
  if (data.integrityAlerts > 0) {
    brief += `Atención: Se han detectado ${data.integrityAlerts} anomalías de VISION-LOCK en los gastos pendientes. `;
  } else {
    brief += `Sin alertas de seguridad en los gastos subidos. `;
  }

  brief += `\n\nCONFLICTOS OPERATIVOS: `;
  if (data.criticalConflicts.length > 0) {
    brief += `Atención: ${data.criticalConflicts.length} ausencias solapan con hitos críticos de Dimension eXpert: ${data.criticalConflicts.map(c => c.name).join(', ')}. `;
  } else {
    brief += `No se detectan colisiones con hitos críticos para los próximos 7 días. `;
  }

  return {
    text: brief,
    metrics: data
  };
}

/**
 * SKILL: authorize_bulk_expenses
 */
export async function authorize_bulk_expenses({ tenantId, userId }: { tenantId: string, userId: string }) {
  const result = await HRService.authorizeBulkExpenses(tenantId, userId);
  
  const cur = result.currency || 'EUR';
  const fmt = (n: number) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (result.authorizedCount === 0 && result.doubtfulCount === 0) {
    return {
      text: `No hay gastos pendientes de autorizar en este momento. ✅`,
      details: result
    };
  }

  let response = `✅ He autorizado *${result.authorizedCount} gastos* por un total de *${fmt(result.totalAuthorized)} ${cur}* (VISION-LOCK verificado).`;

  // Desglose por gasto autorizado (máx. 5 líneas para no saturar)
  if (result.authorizedItems && result.authorizedItems.length > 0) {
    const lines = result.authorizedItems.slice(0, 5).map((item: any) =>
      `• ${item.employee || 'Sin empleado'}: ${fmt(item.amount)} ${item.currency || cur} — ${item.category || 'Gasto'}`
    );
    response += `\n\n_Desglose:_\n${lines.join('\n')}`;
    if (result.authorizedItems.length > 5) {
      response += `\n… y ${result.authorizedItems.length - 5} gastos más.`;
    }
  }
  
  if (result.doubtfulCount > 0) {
    response += `\n\n⚠️ Dejé *${result.doubtfulCount} gastos dudosos* sin coordenadas GPS en revisión manual (${fmt(result.totalDoubtful)} ${cur}).`;
  } else {
    response += `\n\nTodos los gastos pendientes han sido procesados y vinculados al Integrity Graph.`;
  }

  return {
    text: response,
    details: result
  };
}

/**
 * SKILL: approve_vacation_voice
 */
export async function approve_vacation_voice({ vacationRequestId, note, tenantId, userId }: { vacationRequestId: string, note: string, tenantId: string, userId: string }) {
  const vacation = await HRService.approveVacation(vacationRequestId, tenantId, userId);
  
  // Auditoría Forense con tag [VOICE_CMD]
  await (prisma as any).systemAlert.create({
    data: {
      tenantId,
      level: 'INFO',
      message: `[VOICE_CMD] Vacación aprobada vía voz por el usuario ${userId}. Nota enviada a Telegram: ${note}`,
    }
  });

  return {
    text: `Solicitud autorizada correctamente. Se ha enviado la notificación por Telegram con el recordatorio del hito prioritario.`,
    vacation
  };
}

import { PDFService } from '../erp/pdf-service';
import { SignatureService } from '../security/signature-service';

/**
 * SKILL: confirm_digital_seal
 * Procesa la confirmación por voz del OWNER para sellar un documento legal.
 */
export async function confirm_digital_seal(payload: { 
  tenantId: string, 
  userId: string, 
  documentType: 'ACTA_ENTREGA' | 'APROBACION_VACACIONES',
  context: any 
}) {
  const user = await (prisma as any).employee.findFirst({
    where: { userId: payload.userId, tenantId: payload.tenantId }
  });

  if (!user) throw new Error('Usuario no autorizado para sellado digital.');

  // Configurar contenido del acta basado en el contexto
  const title = payload.documentType === 'ACTA_ENTREGA' 
    ? 'ACTA DE ENTREGA Y RESPONSABILIDAD DE ACTIVOS'
    : 'ACTA DE AUTORIZACIÓN DE AUSENCIA PROGRAMADA';

  const content = [
    `Yo, ${user.fullName}, en mi calidad de autoridad responsable para el tenant con ID ${payload.tenantId},`,
    payload.documentType === 'ACTA_ENTREGA' 
      ? `AUTORIZO y SELLO el traspaso del activo ${payload.context.assetName} (S/N: ${payload.context.serialNumber}) al técnico receptor indicado en el rastro forense.`
      : `AUTORIZO y SELLO la solicitud de vacaciones del colaborador ${payload.context.employeeName} para el periodo comprendido entre las fechas indicadas.`,
    `Este documento ha sido generado automáticamente por el motor de soberanía de Volkern y sellado criptográficamente mediante HMAC-SHA256 con vinculación Veri*factu.`
  ];

  const result = await PDFService.generateSignedActa({
    tenantId: payload.tenantId,
    documentType: payload.documentType,
    title,
    content,
    signerName: user.fullName,
    signerId: user.id,
    metadata: { ...payload.context, processedBy: 'Gemma 4 Live' }
  });

  // Registrar alerta en el Trust Protocol
  await (prisma as any).systemAlert.create({
    data: {
      tenantId: payload.tenantId,
      level: 'INFO',
      message: `[SIGNATURE] Documento sellado y firmado por ${user.fullName}: ${title} (Hash: ${result.documentHash.substring(0, 8)}...).`,
    }
  });

  return {
    text: `Perfecto. He generado y sellado el acta digital para ${payload.documentType}. El rastro de integridad ha sido registrado en el Trust Protocol con éxito.`,
    signatureId: result.signatureId,
    documentHash: result.documentHash
  };
}
/**
 * Orquesta la transferencia o devolución de un activo basado en la soberanía industrial.
 */
export async function orchestrate_asset_transfer(payload: { 
  assetId: string, 
  action: 'TRANSFER' | 'RETURN', 
  targetEmployeeId?: string,
  tenantId: string,
  userId: string 
}) {
  const asset = await (prisma as any).erp_employee_assets.findUnique({
    where: { id: payload.assetId, tenantId: payload.tenantId },
    include: { catalogoItem: true, erp_employees: true }
  });

  if (!asset) throw new Error('Activo no encontrado');

  // Generar Hash de Integridad para el traspaso (Doble Check Blindado)
  const integrityData = {
    assetId: asset.id,
    serialNumber: asset.serialNumber,
    fromEmployee: (asset as any).erp_employees.fullName,
    action: payload.action,
    timestamp: new Date().toISOString()
  };
  
  const { generateIntegrityHash } = await import('@/lib/security/integrity-service');
  const integrityHash = await generateIntegrityHash(integrityData, payload.tenantId);

  if (payload.action === 'RETURN') {
    // La devolución requiere validación VISION-LOCK en el cierre, aquí solo iniciamos el proceso
    await (prisma as any).systemAlert.create({
      data: {
        tenantId: payload.tenantId,
        level: 'WARNING',
        message: `[LOGISTICS_CMD] Orden de devolución emitida para ${asset.catalogoItem.nombre} (S/N: ${asset.serialNumber}). Esperando confirmación GPS en Almacén.`,
      }
    });

    return {
      text: `Entendido. He generado la orden de devolución para el activo ${asset.catalogoItem.nombre}. El técnico ha sido notificado para la entrega con VISION-LOCK.`,
      integrityHash
    };
  } else if (payload.action === 'TRANSFER' && payload.targetEmployeeId) {
    const target = await (prisma as any).employee.findUnique({
      where: { id: payload.targetEmployeeId, tenantId: payload.tenantId }
    });

    if (!target) throw new Error('Empleado destino no encontrado');

    await (prisma as any).systemAlert.create({
      data: {
        tenantId: payload.tenantId,
        level: 'INFO',
        message: `[LOGISTICS_CMD] Transferencia iniciada: ${asset.catalogoItem.nombre} de ${(asset as any).erp_employees.fullName} a ${target.fullName}. Hash: ${integrityHash.substring(0, 8)}...`,
      }
    });

    return {
      text: `Traspaso orquestado: ${asset.catalogoItem.nombre} será transferido a ${target.fullName}. Se requiere confirmación bidireccional mediante Veri*factu.`,
      integrityHash
    };
  }

  return { error: 'Acción no soportada' };
}
