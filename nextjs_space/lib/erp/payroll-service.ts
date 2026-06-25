import { prisma, dbContext } from '../db';
import { endOfMonth, startOfMonth, eachDayOfInterval, isWeekend, isSameDay } from 'date-fns';
import { BenefitAnomalyService, BenefitAnomaly } from './benefit-anomaly-service';

export interface PayrollCalculation {
  baseSalary: number;
  totalDays: number;
  presentDays: number;
  vacationDays: number;
  absentDays: number;
  deductions: number;
  commissionAmount: number;
  bonusAmount: number;
  irpfRate: number;
  ssRate: number;
  irpfAmount: number;
  ssAmount: number;
  totalNet: number;
  commissionsDetails: {
    id: string;
    monto: number;
    metodo: string;
  }[];
  bonusesDetails: {
    concept: string;
    amount: number;
  }[];
  benefitsDetails: {
    id: string;
    concept: string;
    amount: number;
    category?: string;
  }[];
  flaggedBenefits: BenefitAnomaly[];
  excludedBenefits: any[];
  attendancePercent: number;
  snifferSnapshot?: any;
  details: {
    date: string;
    status: 'PRESENT' | 'VACATION' | 'ABSENT';
  }[];
}

export class PayrollService {
  /**
   * Calcula la nómina de un empleado para un mes específico
   */
  static async calculateEmployeePayroll(
    employeeId: string,
    month: number, // 1-12
    year: number
  ): Promise<PayrollCalculation> {
    const store = dbContext.getStore();
    const tenantId = store?.tenantId;
    if (!tenantId) throw new Error('Tenant context missing');

    // 1. Obtener empleado y su salario base + tasas fiscales
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: true
      }
    });
    
    const baseSalary = Number(employee?.salary || 0);
    const irpfRate = Number(employee?.irpfrate || 0);
    const ssRate = Number(employee?.ssrate || 0);
    const dailyRate = baseSalary / 30;

    // 2. Definir rango del mes
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(start);
    const monthDays = eachDayOfInterval({ start, end });

    // 3. Obtener Asistencias y Vacaciones
    const attendanceLogs = await prisma.attendance.findMany({
      where: {
        employeeId,
        timestamp: { gte: start, lte: end },
        type: 'CLOCK_IN' // Solo necesitamos saber si fichó la entrada
      }
    });

    const approvedVacations = await (prisma as any).erp_vacation_requests.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } }
        ]
      }
    });

    // 3.1 Obtener Comisiones del CRM
    const approvedCommissions = employee?.userId ? await prisma.comision.findMany({
      where: {
        userId: employee.userId,
        estado: 'aprobada', // Estado exacto según schema
        fechaAprobacion: { gte: start, lte: end }
      }
    }) : [];

    const commissionAmount = approvedCommissions.reduce((sum, c) => sum + c.montoCalculado, 0);
    const commissionsDetails = approvedCommissions.map(c => ({
      id: c.id,
      monto: c.montoCalculado,
      metodo: c.metodoCalculo || 'Porcentaje estándar'
    }));
    
    // 3.2 Obtener Beneficios Sociales
    const activeBenefits = await prisma.employeeBenefit.findMany({
      where: {
        employeeId,
        active: true,
        startDate: { lte: end },
        OR: [
          { endDate: null },
          { endDate: { gte: start } }
        ]
      }
    });

    const applicableBenefits = activeBenefits.filter(b => 
      this.shouldApplyBenefitInPeriod(b, start, end)
    );

    // 3.3 Sniffer de Anomalías (Soberanía Operativa)
    const expectedWorkingDays = monthDays.filter(d => !isWeekend(d)).length;
    const snifferResult = await BenefitAnomalyService.sniff(
      employeeId,
      applicableBenefits,
      attendanceLogs,
      expectedWorkingDays,
      employee?.isTeleworkAllowed || false
    );

    const totalBenefitsAmount = snifferResult.appliedBenefits.reduce((sum, b) => sum + b.amount, 0);
    const benefitsDetails = snifferResult.appliedBenefits.map(b => ({
      id: b.id,
      concept: b.concept,
      amount: b.amount,
      category: b.category
    }));

    // 4. Calcular día a día
    let presentDays = 0;
    let vacationDays = 0;
    let absentDays = 0;
    const details: PayrollCalculation['details'] = [];

    monthDays.forEach(day => {
      // Ignorar fines de semana para el cálculo de "faltas" laborales estándar
      if (isWeekend(day)) return;

      const hasClockIn = attendanceLogs.some(log => isSameDay(log.timestamp, day));
      const isOnVacation = approvedVacations.some((v: any) => 
        day >= v.startDate && day <= v.endDate
      );

      if (hasClockIn) {
        presentDays++;
        details.push({ date: day.toISOString(), status: 'PRESENT' });
      } else if (isOnVacation) {
        vacationDays++;
        details.push({ date: day.toISOString(), status: 'VACATION' });
      } else {
        absentDays++;
        details.push({ date: day.toISOString(), status: 'ABSENT' });
      }
    });

    // El bonusAmount real se calcula agregando bonusesDetails a posteriori en el endpoint o pasando argumentos.
    // Inicializamos por defecto vacíos si no se pasan (ya que el servicio principal calcula sin bonos manuales a menos que se inyecten)
    const bonusAmount = 0; 
    const deductions = absentDays * dailyRate;
    
    // Base Imponible (Devengos)
    const totalDevengos = (baseSalary - deductions) + commissionAmount + bonusAmount + totalBenefitsAmount;
    
    // Retenciones
    const irpfAmount = totalDevengos * (irpfRate / 100);
    const ssAmount = totalDevengos * (ssRate / 100);
    
    const totalNet = totalDevengos - irpfAmount - ssAmount;

    return {
      baseSalary,
      totalDays: monthDays.filter(d => !isWeekend(d)).length,
      presentDays,
      vacationDays,
      absentDays,
      deductions,
      commissionAmount,
      bonusAmount,
      irpfRate,
      ssRate,
      irpfAmount,
      ssAmount,
      totalNet,
      commissionsDetails,
      bonusesDetails: [],
      benefitsDetails,
      flaggedBenefits: snifferResult.flaggedBenefits,
      excludedBenefits: snifferResult.excludedBenefits,
      attendancePercent: snifferResult.attendancePercent,
      snifferSnapshot: snifferResult.snapshot,
      details
    };
  }

  /**
   * Helper para determinar si un beneficio debe aplicarse en el periodo dado
   */
  private static shouldApplyBenefitInPeriod(benefit: any, start: Date, end: Date): boolean {
    const { frequency } = benefit;
    if (frequency === "monthly") return true;
    if (frequency === "quarterly") {
      // Se aplica en los meses 0, 3, 6, 9 (Enero, Abril, Julio, Octubre)
      return [0, 3, 6, 9].includes(start.getMonth());
    }
    if (frequency === "yearly") {
      // Se aplica solo en Enero
      return start.getMonth() === 0;
    }
    return false;
  }

  /**
   * Obtiene todos los empleados y calcula sus nóminas pendientes para un periodo dado
   */
  static async getPendingPayrolls(month: number, year: number) {
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      include: { user: true }
    });

    const results = [];
    for (const emp of employees) {
      try {
        const attendanceAudit = await this.calculateEmployeePayroll(emp.id, month, year);
        results.push({
          id: `pending_${emp.id}_${month}_${year}`,
          employeeId: emp.id,
          employeeName: emp.fullName || emp.user?.name,
          role: emp.role || 'Empleado',
          salary: Number(emp.salary || 0),
          absences: attendanceAudit.absentDays,
          status: 'DRAFT',
          attendanceAudit
        });
      } catch (err) {
        console.error(`Error calculating payroll for ${emp.id}:`, err);
      }
    }
    return results;
  }
}
