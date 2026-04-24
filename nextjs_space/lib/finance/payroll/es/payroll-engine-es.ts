import { prisma } from '@/lib/db'
import { Decimal } from 'decimal.js'
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isWithinInterval,
  differenceInDays
} from 'date-fns'

export class PayrollEngineES {
  /**
   * Ejecuta el cálculo de nómina aplicando lógica de tramos
   */
  static async calculatePayroll(employeeId: string, tenantId: string, period: string) {
    const periodDate = new Date(`${period}-01`)
    const monthStart = startOfMonth(periodDate)
    const monthEnd = endOfMonth(periodDate)

    // 1. Obtener Perfil y Versiones
    const profile = await prisma.employeePayrollProfileES.findUnique({
      where: { employeeId },
      include: { versions: { orderBy: { effectiveFrom: 'asc' } } }
    })

    if (!profile) throw new Error('PERFIL_NO_ENCONTRADO')

    // 2. Detectar Tramos (Segmentación)
    const intervals: Array<{ start: Date, end: Date, data: any }> = []
    
    // Simplificación: Si no hay versiones que corten el mes, un solo tramo
    const activeVersions = profile.versions.filter(v => 
      isWithinInterval(v.effectiveFrom, { start: monthStart, end: monthEnd }) ||
      (v.effectiveTo && isWithinInterval(v.effectiveTo, { start: monthStart, end: monthEnd })) ||
      (v.effectiveFrom <= monthStart && (!v.effectiveTo || v.effectiveTo >= monthEnd))
    )

    if (activeVersions.length === 0) {
      intervals.push({ start: monthStart, end: monthEnd, data: profile })
    } else {
      // Lógica de segmentación real por cambios de vigencia
      // ... (por brevedad usamos el primer tramo activo)
      intervals.push({ start: monthStart, end: monthEnd, data: activeVersions[0].data })
    }

    let totalGross = new Decimal(0)
    let totalSSWorker = new Decimal(0)
    let totalSSCompany = new Decimal(0)
    let totalIRPF = new Decimal(0)
    const lines: any[] = []

    // 3. Procesar Tramos
    for (const interval of intervals) {
      const days = differenceInDays(interval.end, interval.start) + 1
      const weight = new Decimal(days).div(30) // Base 30 estándar

      const salaryBase = new Decimal(interval.data.salaryBase.toString()).mul(weight)
      const salaryComplement = new Decimal(interval.data.salaryComplement.toString()).mul(weight)
      
      lines.push({
        conceptCode: '101',
        conceptType: 'SALARY',
        amount: salaryBase,
        notes: `Salario Base (${days} días)`
      })

      lines.push({
        conceptCode: '102',
        conceptType: 'SALARY',
        amount: salaryComplement,
        notes: 'Complemento Salarial'
      })

      totalGross = totalGross.plus(salaryBase).plus(salaryComplement)
      
      // Aplicar tablas legales (Simulado)
      const ssRateWorker = new Decimal(0.0635) // 6.35% estándar
      const ssRateCompany = new Decimal(0.236)  // 23.6% estándar
      
      const ssWorker = totalGross.mul(ssRateWorker)
      const ssCompany = totalGross.mul(ssRateCompany)
      
      totalSSWorker = totalSSWorker.plus(ssWorker)
      totalSSCompany = totalSSCompany.plus(ssCompany)
    }

    // 4. Calcular IRPF
    const irpfRate = new Decimal(profile.voluntaryIrpfRate?.toString() || '0.15')
    totalIRPF = totalGross.mul(irpfRate)

    lines.push({
      conceptCode: '801',
      conceptType: 'DEDUCTION',
      amount: totalSSWorker.negated(),
      notes: 'Seguridad Social Trabajador'
    })

    lines.push({
      conceptCode: '901',
      conceptType: 'DEDUCTION',
      amount: totalIRPF.negated(),
      notes: 'Retención IRPF'
    })

    return {
      grossTotal: totalGross,
      netTotal: totalGross.minus(totalSSWorker).minus(totalIRPF),
      socialSecurityWorker: totalSSWorker,
      socialSecurityEmp: totalSSCompany,
      irpfTotal: totalIRPF,
      lines,
      status: 'DRAFT'
    }
  }
}
