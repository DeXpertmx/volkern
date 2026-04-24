import { prisma } from '@/lib/db'

export interface TaxTableData {
  brackets: Array<{ min: number, max?: number, rate: number, fixed?: number }>;
  ss_rates: {
    common_contingencies: number;
    unemployment: number;
    training: number;
    fogasa: number;
    mei: number;
  };
}

export class LegalRulesEngine {
  /**
   * Obtiene la tabla legal vigente para una fecha determinada
   */
  static async getLegalTable(type: string, date: Date) {
    const table = await prisma.legalTaxTable.findFirst({
      where: {
        type,
        validFrom: { lte: date },
        OR: [
          { validTo: null },
          { validTo: { gte: date } }
        ]
      },
      orderBy: { validFrom: 'desc' }
    })

    if (!table) {
      // Fallback a valores por defecto 2024 si no hay tabla en DB
      return this.getDefaultTable(type)
    }

    return table.data as unknown as TaxTableData
  }

  private static getDefaultTable(type: string) {
    if (type === 'SS_RATES') {
      return {
        common_contingencies: 4.70, // Trabajador
        unemployment: 1.55, // General
        training: 0.10,
        mei: 0.12, // 2024
        employer: {
          common_contingencies: 23.60,
          unemployment: 5.50,
          fogasa: 0.20,
          training: 0.60,
          mei: 0.58
        }
      }
    }
    // Añadir más fallbacks según sea necesario
    return null
  }
}
