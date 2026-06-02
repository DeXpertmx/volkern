import { prisma } from '@/lib/db';
import { TaxType } from '@prisma/client';

export interface VatReportSummary {
  year: number;
  quarter: number;
  outputVat: {
    base: number;
    amount: number;
  };
  inputVat: {
    base: number;
    amount: number;
  };
  result: number;
  details: any[];
}

export interface IrpfReportSummary {
  year: number;
  quarter: number;
  retentions: {
    base: number;
    amount: number;
  };
  totalRetentions: number;
  details: any[];
}

export interface Modelo130ReportSummary {
  year: number;
  quarter: number;
  totalIncome: number;
  totalExpenses: number;
  netBase: number;
  paymentRate: number;
  resultToPay: number;
  hasActivity: boolean;
  details: {
    incomeAccounts: { code: string; name: string; amount: number }[];
    expenseAccounts: { code: string; name: string; amount: number }[];
  };
}

export class TaxService {
  /**
   * Calcula el resumen de IVA para un trimestre específico (Modelo 303 simplificado)
   */
  static async getQuarterlyVatReport(tenantId: string, year: number, quarter: number): Promise<VatReportSummary> {
    const months = this.getMonthsForQuarter(quarter);
    
    const records = await prisma.taxRecord.findMany({
      where: {
        tenantId,
        periodYear: year,
        periodMonth: { in: months },
        type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] }
      },
      include: {
        entry: true
      }
    });

    const summary: VatReportSummary = {
      year,
      quarter,
      outputVat: { base: 0, amount: 0 },
      inputVat: { base: 0, amount: 0 },
      result: 0,
      details: records
    };

    for (const record of records) {
      const base = Number(record.baseAmount);
      const amount = Number(record.taxAmount);

      if (record.type === TaxType.IVA_REPERCUTIDO) {
        summary.outputVat.base += base;
        summary.outputVat.amount += amount;
      } else if (record.type === TaxType.IVA_SOPORTADO) {
        summary.inputVat.base += base;
        summary.inputVat.amount += amount;
      }
    }

    summary.result = summary.outputVat.amount - summary.inputVat.amount;

    return summary;
  }

  private static getMonthsForQuarter(quarter: number): number[] {
    switch (quarter) {
      case 1: return [1, 2, 3];
      case 2: return [4, 5, 6];
      case 3: return [7, 8, 9];
      case 4: return [10, 11, 12];
      default: throw new Error('Trimestre no válido');
    }
  }

  /**
   * Marca los registros como presentados (cerrados)
   */
  static async fileVatReturn(tenantId: string, year: number, quarter: number) {
    const months = this.getMonthsForQuarter(quarter);

    return await prisma.taxRecord.updateMany({
      where: {
        tenantId,
        periodYear: year,
        periodMonth: { in: months },
        type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] },
        isFiled: false
      },
      data: {
        isFiled: true
      }
    });
  }

  /**
   * Calcula el resumen de retenciones IRPF para un trimestre específico (Modelo 111)
   */
  static async getQuarterlyIrpfReport(tenantId: string, year: number, quarter: number): Promise<IrpfReportSummary> {
    const months = this.getMonthsForQuarter(quarter);

    const records = await prisma.taxRecord.findMany({
      where: {
        tenantId,
        periodYear: year,
        periodMonth: { in: months },
        type: TaxType.IRPF_RETENCION
      },
      include: {
        entry: true
      }
    });

    const summary: IrpfReportSummary = {
      year,
      quarter,
      retentions: { base: 0, amount: 0 },
      totalRetentions: 0,
      details: records
    };

    for (const record of records) {
      const base = Number(record.baseAmount);
      const amount = Number(record.taxAmount);

      summary.retentions.base += base;
      summary.retentions.amount += amount;
    }

    summary.totalRetentions = summary.retentions.amount;

    return summary;
  }

  /**
   * Marca las retenciones IRPF como presentadas (cerradas)
   */
  static async fileIrpfReturn(tenantId: string, year: number, quarter: number) {
    const months = this.getMonthsForQuarter(quarter);

    return await prisma.taxRecord.updateMany({
      where: {
        tenantId,
        periodYear: year,
        periodMonth: { in: months },
        type: TaxType.IRPF_RETENCION,
        isFiled: false
      },
      data: {
        isFiled: true
      }
    });
  }

  /**
   * Calcula el pago fraccionado del IRPF para un trimestre (Modelo 130)
   * Basado en: (Ingresos - Gastos) * 0.20
   */
  static async getQuarterlyModelo130Report(tenantId: string, year: number, quarter: number): Promise<Modelo130ReportSummary> {
    const months = this.getMonthsForQuarter(quarter);

    const startDate = new Date(year, months[0] - 1, 1);
    const endDate = new Date(year, months[2], 0, 23, 59, 59, 999);

    // Get all accounting entries for the period with their lines and accounts
    const entries = await prisma.accountingEntry.findMany({
      where: {
        tenantId,
        date: { gte: startDate, lte: endDate },
        status: { not: 'VOIDED' }
      },
      include: {
        lines: {
          include: {
            account: true
          }
        }
      },
      orderBy: { date: 'asc' }
    });

    // Group by account type
    const incomeByAccount: Record<string, { code: string; name: string; amount: number }> = {};
    const expenseByAccount: Record<string, { code: string; name: string; amount: number }> = {};

    for (const entry of entries) {
      for (const line of entry.lines) {
        const account = line.account;
        const amount = Number(line.credit) - Number(line.debit);

        if (account.type === 'INGRESO') {
          const income = Number(line.credit); // Ingresos = credit side
          if (income > 0) {
            if (!incomeByAccount[account.code]) {
              incomeByAccount[account.code] = { code: account.code, name: account.name, amount: 0 };
            }
            incomeByAccount[account.code].amount += income;
          }
        } else if (account.type === 'GASTO') {
          const expense = Number(line.debit); // Gastos = debit side
          if (expense > 0) {
            if (!expenseByAccount[account.code]) {
              expenseByAccount[account.code] = { code: account.code, name: account.name, amount: 0 };
            }
            expenseByAccount[account.code].amount += expense;
          }
        }
      }
    }

    const totalIncome = Object.values(incomeByAccount).reduce((sum, a) => sum + a.amount, 0);
    const totalExpenses = Object.values(expenseByAccount).reduce((sum, a) => sum + a.amount, 0);
    const netBase = totalIncome - totalExpenses;
    const paymentRate = 0.20; // 20% tipo fijo para estimación directa
    const resultToPay = netBase > 0 ? Math.round(netBase * paymentRate * 100) / 100 : 0;

    return {
      year,
      quarter,
      totalIncome,
      totalExpenses,
      netBase,
      paymentRate,
      resultToPay,
      hasActivity: totalIncome > 0 || totalExpenses > 0,
      details: {
        incomeAccounts: Object.values(incomeByAccount).sort((a, b) => a.code.localeCompare(b.code)),
        expenseAccounts: Object.values(expenseByAccount).sort((a, b) => a.code.localeCompare(b.code))
      }
    };
  }

  /**
   * Marca el periodo del Modelo 130 como presentado (registro informativo)
   */
  static async fileModelo130Return(tenantId: string, year: number, quarter: number, userId?: string) {
    // Crear un audit trail de la presentación
    return await prisma.auditLog.create({
      data: {
        tenantId,
        usuarioId: userId || '',
        accion: 'MODELO_130_FILED',
        entidad: 'MODELO_130',
        entidadId: `${year}_Q${quarter}`,
        metadata: {
          year,
          quarter,
          filedAt: new Date().toISOString()
        }
      }
    });
  }
}
