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
}
