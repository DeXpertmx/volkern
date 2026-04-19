import { prisma } from '../db';

export interface BenefitAnomaly {
  benefitId: string;
  concept: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  attendancePercent?: number;
}

export interface SnifferResult {
  appliedBenefits: any[];
  flaggedBenefits: BenefitAnomaly[];
  excludedBenefits: any[];
  attendancePercent: number;
  snapshot: {
    expectedWorkingDays: number;
    presentDays: number;
    teleworkAllowed: boolean;
    evaluatedAt: string;
  };
}

export class BenefitAnomalyService {
  /**
   * Analiza la asistencia y valida si los beneficios deben aplicarse
   */
  static async sniff(
    employeeId: string,
    benefits: any[],
    attendanceLogs: any[],
    expectedWorkingDays: number,
    isTeleworkAllowed: boolean
  ): Promise<SnifferResult> {
    const appliedBenefits = [];
    const flaggedBenefits: BenefitAnomaly[] = [];
    const excludedBenefits = [];

    // Calcular porcentaje de presencialidad física
    const presentDays = attendanceLogs.length; 
    const attendancePercent = expectedWorkingDays > 0 ? (presentDays / expectedWorkingDays) * 100 : 0;

    for (const benefit of benefits) {
      let isApplied = true;
      let anomaly: BenefitAnomaly | null = null;
      
      // Normalizar montos (Prisma Decimal a Number)
      const amount = Number(benefit.amount);

      // REGLA A: Beneficio presencial con 0% presencialidad
      if (benefit.requiresPhysicalPresence && presentDays === 0) {
        if (!isTeleworkAllowed) {
          isApplied = false;
          excludedBenefits.push({ ...benefit, amount, reason: 'EXCLUDED: Zero physical attendance' });
          continue;
        } else {
          anomaly = {
            benefitId: benefit.id,
            concept: benefit.concept,
            reason: 'CONFLICT: Benefit requires physical presence but employee is teleworking',
            severity: 'high',
            attendancePercent
          };
        }
      }

      // REGLA B: Presencialidad insuficiente
      if (benefit.requiresAttendanceValidation && benefit.minimumAttendancePercent !== null) {
        if (attendancePercent < benefit.minimumAttendancePercent) {
          anomaly = {
            benefitId: benefit.id,
            concept: benefit.concept,
            reason: `ALERT: Attendance (${attendancePercent.toFixed(1)}%) below minimum required (${benefit.minimumAttendancePercent}%)`,
            severity: attendancePercent < (benefit.minimumAttendancePercent / 2) ? 'high' : 'medium',
            attendancePercent
          };
        }
      }

      // REGLA C: Categorías específicas (Usando Enums TRANSPORT/MEAL)
      if ((benefit.category === 'TRANSPORT' || benefit.category === 'MEAL') && isTeleworkAllowed && presentDays < (expectedWorkingDays / 2)) {
         if (!anomaly) {
            anomaly = {
              benefitId: benefit.id,
              concept: benefit.concept,
              reason: 'REVIEW: High telework ratio for mobility/meal benefits',
              severity: 'low',
              attendancePercent
            };
         }
      }

      if (anomaly) {
        flaggedBenefits.push(anomaly);
      }

      if (isApplied) {
        appliedBenefits.push({ ...benefit, amount });
      }
    }

    return {
      appliedBenefits,
      flaggedBenefits,
      excludedBenefits,
      attendancePercent,
      snapshot: {
        expectedWorkingDays,
        presentDays,
        teleworkAllowed: isTeleworkAllowed,
        evaluatedAt: new Date().toISOString()
      }
    };
  }
}
