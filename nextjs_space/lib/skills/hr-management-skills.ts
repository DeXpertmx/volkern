import { prisma } from '@/lib/db';
import { VaultService } from '@/lib/security/vault';

/**
 * SKILL: talent_retention_risk
 * Analiza carga de trabajo en proyectos y progreso en training rooms para detectar riesgos.
 */
export async function talent_retention_risk({ tenantId, employeeId }: { tenantId: string, employeeId: string }) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId, tenantId },
    include: { user: true }
  });

  if (!employee) throw new Error('Empleado no encontrado');

  // 1. Analizar carga de proyectos (Fase 3)
  // Buscamos cuántas Work Orders o Hitos tiene asignados el usuario vinculado
  const activeTasks = employee.userId ? await prisma.task.count({
    where: { tenantId, assignedTo: employee.userId, status: 'PENDING' }
  }) : 0;

  // 2. Analizar progreso en Academia (Fase 1/2)
  // Simulamos la obtención de completitud de cursos si es estudiante
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
 * Accede a los datos cifrados de la bóveda (Requiere auditoría)
 */
export async function get_employee_confidential_data({ tenantId, employeeId, userId }: { tenantId: string, employeeId: string, userId: string }) {
  // 🛡️ SECURITY CHECK: Auditar quién accede
  await prisma.financialAudit.create({
    data: {
      tenantId,
      userId,
      action: 'VIEW_HR_VAULT',
      userEmail: 'ADMIN_USER', // Sería dinámico
      ipAddress: 'INTERNAL_API',
      userAgent: 'Volkern Secure Agent'
    }
  });

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId, tenantId }
  });

  if (!employee) throw new Error('Empleado no encontrado');

  return {
    fullName: employee.fullName,
    salary: employee.salaryEncrypted ? VaultService.decrypt(employee.salaryEncrypted) : 'NO_DATA',
    contractUrl: employee.contractUrlEncrypted ? VaultService.decrypt(employee.contractUrlEncrypted) : 'NO_DATA'
  };
}
