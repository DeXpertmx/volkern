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

export interface Modelo347Operation {
  counterpartyName: string;
  counterpartyNif: string;
  counterpartyCountry: string;
  operationType: 'CLIENT' | 'SUPPLIER';
  invoiceCount: number;
  totalAmount: number;
}

export interface Modelo347ReportSummary {
  year: number;
  threshold: number;
  operations: Modelo347Operation[];
  totalOperations: number;
  totalAmount: number;
  totalClientAmount: number;
  totalSupplierAmount: number;
  hasOperations: boolean;
}

export interface Modelo390QuarterDetail {
  quarter: number;
  outputVatBase: number;
  outputVatAmount: number;
  inputVatBase: number;
  inputVatAmount: number;
  result: number;
  isFiled: boolean;
}

export interface Modelo390ReportSummary {
  year: number;
  quarters: Modelo390QuarterDetail[];
  annualOutputVatBase: number;
  annualOutputVatAmount: number;
  annualInputVatBase: number;
  annualInputVatAmount: number;
  annualResult: number;
  quartersFiled: number;
  hasActivity: boolean;
}

export interface Modelo349Delivery {
  clientName: string;
  clientNif: string;
  clientCountry: string;
  clientVatId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  invoiceId: string;
}

export interface Modelo349Acquisition {
  supplierName: string;
  supplierTaxId: string;
  supplierCountry: string;
  expenseDescription: string;
  expenseDate: string;
  amount: number;
  expenseId: string;
}

export interface Modelo349ReportSummary {
  year: number;
  quarter: number;
  totalDeliveries: number;
  deliveryCount: number;
  totalAcquisitions: number;
  acquisitionCount: number;
  deliveries: Modelo349Delivery[];
  acquisitions: Modelo349Acquisition[];
  hasOperations: boolean;
}

export class TaxService {
  private static readonly EU_COUNTRY_CODES = ['DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'PL', 'SE', 'DK', 'FI', 'GR', 'CZ', 'RO', 'HU', 'SK', 'BG', 'HR', 'SI', 'LT', 'LV', 'EE', 'CY', 'LU', 'MT'];

  private static isEuCountry(country: string): boolean {
    return this.EU_COUNTRY_CODES.includes(country.toUpperCase());
  }

  private static guessCountryFromTaxId(taxId: string): string | null {
    const prefix = taxId.substring(0, 2).toUpperCase();
    if (this.EU_COUNTRY_CODES.includes(prefix)) return prefix;
    if (taxId.toUpperCase().startsWith('GB')) return 'GB';
    return null;
  }
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
      } as any
    });
  }

  /**
   * Genera el reporte anual de operaciones con terceros (Modelo 347)
   * Agrupa facturas por cliente y gastos por proveedor, filtrando por umbral > 3.005,06€
   */
  static async getAnnualModelo347Report(tenantId: string, year: number): Promise<Modelo347ReportSummary> {
    const threshold = 3005.06;
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    // ── Sales: invoices grouped by contact ─────────────────────────
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        fechaEmision: { gte: startDate, lte: endDate },
        contact: { isNot: null }
      },
      include: {
        contact: {
          include: {
            perfilFiscal: true
          }
        }
      }
    });

    // Group invoices by contactId, aggregate amounts
    const clientMap = new Map<string, {
      nombre: string;
      nif: string;
      country: string;
      count: number;
      total: number;
    }>();

    for (const inv of invoices) {
      if (!inv.contact) continue;
      const contactId = inv.contactId!;
      const existing = clientMap.get(contactId);
      if (existing) {
        existing.count++;
        existing.total += Number(inv.monto);
      } else {
        const perfil = inv.contact.perfilFiscal;
        clientMap.set(contactId, {
          nombre: inv.contact.nombre,
          nif: perfil?.nif || perfil?.idIntracomunitario || '',
          country: perfil?.country || 'ES',
          count: 1,
          total: Number(inv.monto),
        });
      }
    }

    // Convert to operations array, filter by threshold
    const clientOps: Modelo347Operation[] = Array.from(clientMap.entries())
      .filter(([_, data]) => data.total > threshold)
      .map(([_, data]) => ({
        counterpartyName: data.nombre,
        counterpartyNif: data.nif,
        counterpartyCountry: data.country,
        operationType: 'CLIENT' as const,
        invoiceCount: data.count,
        totalAmount: Math.round(data.total * 100) / 100,
      }));

    // ── Purchases: expenses grouped by supplier ────────────────────
    const expenses = await prisma.expense.findMany({
      where: {
        tenantId,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        supplier: true
      }
    });

    const supplierMap = new Map<string, {
      name: string;
      taxId: string;
      count: number;
      total: number;
    }>();

    for (const exp of expenses) {
      const supplierId = exp.supplierId;
      const existing = supplierMap.get(supplierId);
      if (existing) {
        existing.count++;
        existing.total += Number(exp.amount);
      } else {
        supplierMap.set(supplierId, {
          name: exp.supplier.name,
          taxId: exp.supplier.taxId || '',
          count: 1,
          total: Number(exp.amount),
        });
      }
    }

    const supplierOps: Modelo347Operation[] = Array.from(supplierMap.entries())
      .filter(([_, data]) => data.total > threshold)
      .map(([_, data]) => ({
        counterpartyName: data.name,
        counterpartyNif: data.taxId,
        counterpartyCountry: 'ES',
        operationType: 'SUPPLIER' as const,
        invoiceCount: data.count,
        totalAmount: Math.round(data.total * 100) / 100,
      }));

    // ── Combine and sort ───────────────────────────────────────────
    const allOps = [...clientOps, ...supplierOps]
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const totalClientAmount = clientOps.reduce((s, o) => s + o.totalAmount, 0);
    const totalSupplierAmount = supplierOps.reduce((s, o) => s + o.totalAmount, 0);

    return {
      year,
      threshold,
      operations: allOps,
      totalOperations: allOps.length,
      totalAmount: totalClientAmount + totalSupplierAmount,
      totalClientAmount,
      totalSupplierAmount,
      hasOperations: allOps.length > 0,
    };
  }

  /**
   * Marca el periodo del Modelo 347 como presentado (registro informativo)
   */
  static async fileModelo347Return(tenantId: string, year: number, userId?: string) {
    return await prisma.auditLog.create({
      data: {
        tenantId,
        usuarioId: userId || '',
        accion: 'MODELO_347_FILED',
        entidad: 'MODELO_347',
        entidadId: `${year}`,
        metadata: {
          year,
          filedAt: new Date().toISOString()
        }
      } as any
    });
  }

  /**
   * Genera el reporte de operaciones intracomunitarias (Modelo 349)
   * Entregas: facturas a clientes UE con ID intracomunitario
   * Adquisiciones: gastos a proveedores con NIF UE
   */
  static async getQuarterlyModelo349Report(tenantId: string, year: number, quarter: number): Promise<Modelo349ReportSummary> {
    const months = this.getMonthsForQuarter(quarter);
    const startDate = new Date(year, months[0] - 1, 1);
    const endDate = new Date(year, months[2], 0, 23, 59, 59, 999);

    // ── Deliveries (Entregas intracomunitarias) ──────────────────────
    // Find contacts with EU fiscal profiles that have intracommunity VAT ID
    const euProfiles = await prisma.perfilFiscalCliente.findMany({
      where: {
        tenantId,
        country: { not: 'ES' },
        idIntracomunitario: { not: null },
      },
      select: { contactId: true, country: true, idIntracomunitario: true, nif: true }
    });

    const contactIds = euProfiles
      .filter((p: any) => p.contactId && this.isEuCountry(p.country))
      .map((p: any) => p.contactId!);

    const profileMap = new Map(euProfiles
      .filter((p: any) => p.contactId && this.isEuCountry(p.country))
      .map((p: any) => [p.contactId!, p])
    );

    const invoices = contactIds.length > 0 ? await prisma.invoice.findMany({
      where: {
        tenantId,
        contactId: { in: contactIds },
        fechaEmision: { gte: startDate, lte: endDate },
      },
      include: {
        contact: { select: { nombre: true } }
      },
      orderBy: { fechaEmision: 'asc' }
    }) : [];

    const deliveries: Modelo349Delivery[] = invoices.map(inv => {
      const profile = profileMap.get(inv.contactId!) as any;
      return {
        clientName: inv.contact?.nombre || 'Sin nombre',
        clientNif: profile?.nif || '',
        clientCountry: profile?.country || '',
        clientVatId: profile?.idIntracomunitario || '',
        invoiceNumber: inv.numero,
        invoiceDate: inv.fechaEmision.toISOString(),
        amount: Number(inv.monto),
        invoiceId: inv.id,
      };
    });

    // ── Acquisitions (Adquisiciones intracomunitarias) ───────────────
    // Find expenses where supplier taxId suggests an EU country
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, taxId: true }
    });

    const euSupplierIds = suppliers
      .filter(s => s.taxId && this.guessCountryFromTaxId(s.taxId))
      .map(s => s.id);

    const euSupplierMap = new Map(
      suppliers
        .filter(s => euSupplierIds.includes(s.id))
        .map(s => [s.id, { name: s.name, taxId: s.taxId!, country: this.guessCountryFromTaxId(s.taxId!)! }])
    );

    const expenses = euSupplierIds.length > 0 ? await prisma.expense.findMany({
      where: {
        tenantId,
        supplierId: { in: euSupplierIds },
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' }
    }) : [];

    const acquisitions: Modelo349Acquisition[] = expenses.map(exp => {
      const supplier = euSupplierMap.get(exp.supplierId);
      return {
        supplierName: supplier?.name || 'Sin nombre',
        supplierTaxId: supplier?.taxId || '',
        supplierCountry: supplier?.country || '',
        expenseDescription: exp.description,
        expenseDate: exp.date.toISOString(),
        amount: Number(exp.amount),
        expenseId: exp.id,
      };
    });

    const totalDeliveries = deliveries.reduce((s, d) => s + d.amount, 0);
    const totalAcquisitions = acquisitions.reduce((s, a) => s + a.amount, 0);

    return {
      year,
      quarter,
      totalDeliveries,
      deliveryCount: deliveries.length,
      totalAcquisitions,
      acquisitionCount: acquisitions.length,
      deliveries,
      acquisitions,
      hasOperations: deliveries.length > 0 || acquisitions.length > 0,
    };
  }

  /**
   * Marca el periodo del Modelo 349 como presentado (registro informativo)
   */
  static async fileModelo349Return(tenantId: string, year: number, quarter: number, userId?: string) {
    return await prisma.auditLog.create({
      data: {
        tenantId,
        usuarioId: userId || '',
        accion: 'MODELO_349_FILED',
        entidad: 'MODELO_349',
        entidadId: `${year}_Q${quarter}`,
        metadata: {
          year,
          quarter,
          filedAt: new Date().toISOString()
        }
      } as any
    });
  }

  /**
   * Genera el resumen anual de IVA (Modelo 390)
   * Consolida los 4 trimestres del Modelo 303
   */
  static async getAnnualModelo390Report(tenantId: string, year: number): Promise<Modelo390ReportSummary> {
    const quarters = [1, 2, 3, 4];
    const quarterDetails: Modelo390QuarterDetail[] = [];

    for (const q of quarters) {
      const report = await this.getQuarterlyVatReport(tenantId, year, q);

      // Check if this quarter is filed (all records marked as isFiled)
      const months = this.getMonthsForQuarter(q);
      const unfiledCount = await prisma.taxRecord.count({
        where: {
          tenantId,
          periodYear: year,
          periodMonth: { in: months },
          type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] },
          isFiled: false
        }
      });

      quarterDetails.push({
        quarter: q,
        outputVatBase: report.outputVat.base,
        outputVatAmount: report.outputVat.amount,
        inputVatBase: report.inputVat.base,
        inputVatAmount: report.inputVat.amount,
        result: report.result,
        isFiled: unfiledCount === 0,
      });
    }

    const annualOutputVatBase = quarterDetails.reduce((s, q) => s + q.outputVatBase, 0);
    const annualOutputVatAmount = quarterDetails.reduce((s, q) => s + q.outputVatAmount, 0);
    const annualInputVatBase = quarterDetails.reduce((s, q) => s + q.inputVatBase, 0);
    const annualInputVatAmount = quarterDetails.reduce((s, q) => s + q.inputVatAmount, 0);
    const annualResult = annualOutputVatAmount - annualInputVatAmount;
    const quartersFiled = quarterDetails.filter(q => q.isFiled).length;

    return {
      year,
      quarters: quarterDetails,
      annualOutputVatBase,
      annualOutputVatAmount,
      annualInputVatBase,
      annualInputVatAmount,
      annualResult,
      quartersFiled,
      hasActivity: annualOutputVatBase > 0 || annualInputVatBase > 0,
    };
  }

  /**
   * Marca el ejercicio del Modelo 390 como presentado (registro informativo)
   */
  static async fileModelo390Return(tenantId: string, year: number, userId?: string) {
    return await prisma.auditLog.create({
      data: {
        tenantId,
        usuarioId: userId || '',
        accion: 'MODELO_390_FILED',
        entidad: 'MODELO_390',
        entidadId: `${year}`,
        metadata: {
          year,
          filedAt: new Date().toISOString()
        }
      } as any
    });
  }
}
