import { prisma } from '@/lib/db';
import { AttendanceService } from '@/lib/erp/attendance-service';

/**
 * SKILL: attendance_context_audit
 * Audita una selfie de asistencia buscando cumplimiento de normas de teletrabajo.
 */
export async function attendance_context_audit({ 
  attendanceId, 
  tenantId 
}: { 
  attendanceId: string, 
  tenantId: string 
}) {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId, tenantId },
    include: { employee: true }
  });

  if (!attendance) throw new Error('Registro de asistencia no encontrado');

  // 🛡️ PROTOCOLO GEMMA VISION: Attendance Edition
  // Instrucción para Gemma:
  // 1. FACE MATCH: ¿La cara coincide con el registro del empleado?
  // 2. CONTEXT CHECK: Para teletrabajo, ¿es visible una laptop o monitor con el ERP Volkern?
  // 3. BACKGROUND INTEGRITY: ¿Es un entorno de oficina/casa real o una imagen falsa?

  const isTelework = attendance.employee.isTeleworkAllowed;
  const evidenceUrl = attendance.evidenceUrl || '';

  // Simulación de respuesta de visión
  const hasWorkContext = evidenceUrl.includes('pc') || evidenceUrl.includes('office');
  const identified = !evidenceUrl.includes('stranger');

  if (!identified || (isTelework && !hasWorkContext)) {
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { isAnomaly: true, anomalyType: identified ? 'BAD_CONTEXT' : 'IDENTITY_MISMATCH' }
    });

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    await notifyByTelegram(`🚨 <b>ANOMALÍA DE ASISTENCIA</b>\nEmpleado: ${attendance.employee.fullName}\nMotivo: ${identified ? 'Sin entorno de trabajo' : 'Identidad no confirmada'}`, { 
      tenantId 
    } as any);

    return {
      status: 'REJECTED',
      verdict: identified ? 'Falta contexto de estación de trabajo para teletrabajo.' : 'La cara no coincide con el registro del empleado.',
      riskLevel: 'HIGH'
    };
  }

  return {
    status: 'VERIFIED',
    verdict: 'Asistencia validada. Identidad y contexto correctos.',
    riskLevel: 'LOW'
  };
}

/**
 * SKILL: anomaly_pattern_detection
 * Busca patrones sospechosos de proximidad o marcaje simultáneo
 */
export async function anomaly_pattern_detection({ tenantId }: { tenantId: string }) {
  const today = new Date();
  today.setHours(0,0,0,0);

  const logs = await prisma.attendance.findMany({
    where: { tenantId, timestamp: { gte: today }, type: 'IN' },
    orderBy: { timestamp: 'asc' }
  });

  const anomalies = [];
  for (let i = 0; i < logs.length - 1; i++) {
    const diff = Math.abs(logs[i].timestamp.getTime() - logs[i+1].timestamp.getTime());
    if (diff < 1000 * 5) { // Menos de 5 segundos entre registros
      anomalies.push({
        ids: [logs[i].id, logs[i+1].id],
        message: 'Marcaje en proximidad detectado: Posible registro por terceros.'
      });
    }
  }

  return anomalies;
}
