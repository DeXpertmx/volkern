import { prisma } from '@/lib/db';

/**
 * SkillGuard
 * Operational interlock to prevent unauthorized work.
 */
export class SkillGuard {
  /**
   * Verifies if a user has the required certification to start a Work Order.
   */
  static async canStartWorkOrder(workOrderId: string, tenantId: string, userId: string) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      include: { bom: true }
    });

    if (!wo) throw new Error('Orden de trabajo no encontrada');

    // Determine the required course ID (override on WO takes precedence over BoM)
    const requiredCourseId = wo.requiredCourseId || wo.bom.requiredCourseId;

    if (!requiredCourseId) {
      // No skill required, allow execution
      return { allowed: true };
    }

    // Find the Estudiante profile for this staff member (User)
    // We match by email to bridge Staff and Academy
    const staffUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    if (!staffUser) throw new Error('Usuario no encontrado');

    const estudiante = await prisma.estudiante.findFirst({
      where: { email: staffUser.email, tenantId }
    });

    if (!estudiante) {
      return { 
        allowed: false, 
        reason: 'PERFIL_ACADEMICO_REQUERIDO',
        message: 'No tienes un perfil académico vinculado para validar tus competencias.'
      };
    }

    // Check for a valid, non-expired certification
    const certification = await prisma.certificado.findFirst({
      where: { 
        estudianteId: estudiante.id, 
        cursoId: requiredCourseId,
        // In a real scenario, we'd check expiration date
      }
    });

    if (!certification) {
      const course = await prisma.curso.findUnique({ where: { id: requiredCourseId } });
      return {
        allowed: false,
        reason: 'CERTIFICACION_FALTANTE',
        message: `RECHAZO DE SEGURIDAD: Se requiere certificación en "${course?.titulo || 'Curso Requerido'}" para operar esta orden.`
      };
    }

    return { allowed: true, certificationId: certification.id };
  }
}
