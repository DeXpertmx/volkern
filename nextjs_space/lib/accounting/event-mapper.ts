import { prisma } from '@/lib/db';
import { EntryManager, EntryLineInput, TaxImpactInput } from './entry-manager';

export class AccountingEventMapper {
  /**
   * Maps a sealed invoice to a ledger entry.
   * 430 (Clients) -> 700/705 (Sales) + 477 (VAT)
   */
  static async mapInvoiceToEntry(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { ordenVenta: true }
    });

    if (!invoice) throw new Error('Factura no encontrada');
    if (invoice.estado !== 'pagada' && invoice.estado !== 'emitida' && invoice.estado !== 'pendiente') {
       // Only map if it's a valid financial event
    }

    const tenantId = invoice.tenantId;
    const accounts = await this.getTenantAccounts(tenantId);

    const total = Number(invoice.monto);
    const base = total / 1.21;
    const vat = total - base;

    return await EntryManager.createEntry({
      tenantId,
      description: `Factura Emitida ${invoice.numero}`,
      reference: invoice.id,
      lines: [
        { accountId: accounts['430'], debit: total, credit: 0 },
        { accountId: accounts['705'], debit: 0, credit: base },
        { accountId: accounts['477'], debit: 0, credit: vat }
      ],
      taxImpact: {
        type: 'IVA_REPERCUTIDO',
        baseAmount: base,
        taxRate: 21,
        taxAmount: vat,
        periodMonth: invoice.fechaEmision.getMonth() + 1,
        periodYear: invoice.fechaEmision.getFullYear()
      }
    });
  }

  /**
   * Maps a signed payroll record to a ledger entry.
   * 640 (Wages) -> 4751 (IRPF) + 476 (SS) + 572 (Bank/Debt)
   * Crea el TaxRecord de IRPF_RETENCION que alimenta el Modelo 111.
   */
  static async mapPayrollToEntry(payrollId: string) {
    const payroll = await prisma.payrollRecord.findUnique({
      where: { id: payrollId }
    });

    if (!payroll) throw new Error('Registro de nómina no encontrado');

    const tenantId = payroll.tenantId;
    const accounts = await this.getTenantAccounts(tenantId);

    // Datos reales cuando el registro los trae en metadata; si no, fallback demo
    const meta = (payroll.metadata as Record<string, unknown>) || {};
    const grossAmount = Number(meta.grossAmount) || Number(meta.bruto) || 2500;
    const irpfRate = Number(meta.irpfRate) || Number(meta.irpf) || 15;
    const irpf = Number(meta.irpfAmount) || Math.round(grossAmount * (irpfRate / 100) * 100) / 100;
    const ssEmployee = Number(meta.ssEmployee) || Math.round(grossAmount * 0.06 * 100) / 100;
    const netAmount = Number(meta.netAmount) || Math.round((grossAmount - irpf - ssEmployee) * 100) / 100;

    return await EntryManager.createEntry({
      tenantId,
      description: `Nómina Periodo ${payroll.month}/${payroll.year} - ID: ${payroll.id}`,
      reference: payroll.id,
      lines: [
        { accountId: accounts['640'], debit: grossAmount, credit: 0 },
        { accountId: accounts['4751'], debit: 0, credit: irpf },
        { accountId: accounts['476'], debit: 0, credit: ssEmployee },
        { accountId: accounts['572'], debit: 0, credit: netAmount }
      ],
      taxImpact: {
        type: 'IRPF_RETENCION',
        baseAmount: grossAmount,
        taxRate: irpfRate,
        taxAmount: irpf,
        periodMonth: payroll.month,
        periodYear: payroll.year
      }
    });
  }

  /**
   * Maps a sealed ES payroll record (PayrollRecordES) to a ledger entry.
   * 640 (Wages) -> 4751 (IRPF) + 476 (SS) + 572 (Bank/Debt)
   * Crea el TaxRecord de IRPF_RETENCION que alimenta el Modelo 111.
   */
  static async mapPayrollEsToEntry(payrollId: string) {
    const payroll = await prisma.payrollRecordES.findUnique({
      where: { id: payrollId }
    });

    if (!payroll) throw new Error('Registro de nómina ES no encontrado');

    const tenantId = payroll.tenantId;
    const accounts = await this.getTenantAccounts(tenantId);

    // Idempotencia: no duplicar si ya existe asiento para esta nómina
    const existing = await prisma.accountingEntry.findFirst({
      where: { reference: payrollId }
    });
    if (existing) return existing;

    const grossAmount = Number(payroll.grossTotal);
    const irpf = Number(payroll.irpfTotal);
    const ssEmployee = Number(payroll.socialSecurityWorker);
    const netAmount = Number(payroll.netTotal);
    const irpfRate = grossAmount > 0 ? Math.round((irpf / grossAmount) * 10000) / 100 : 0;

    // El periodo viene como 'YYYY-MM'
    const [year, month] = (payroll.period || '').split('-').map(Number);
    const periodYear = Number.isFinite(year) && year > 2000 ? year : new Date().getFullYear();
    const periodMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : new Date().getMonth() + 1;

    return await EntryManager.createEntry({
      tenantId,
      description: `Nómina ${payroll.period} - ID: ${payroll.id}`,
      reference: payroll.id,
      lines: [
        { accountId: accounts['640'], debit: grossAmount, credit: 0 },
        { accountId: accounts['4751'], debit: 0, credit: irpf },
        { accountId: accounts['476'], debit: 0, credit: ssEmployee },
        { accountId: accounts['572'], debit: 0, credit: netAmount }
      ],
      taxImpact: {
        type: 'IRPF_RETENCION',
        baseAmount: grossAmount,
        taxRate: irpfRate,
        taxAmount: irpf,
        periodMonth,
        periodYear
      }
    });
  }

  /**
   * Maps a validated expense to a ledger entry.
   * 600/621/629 (Expense) -> 400/410 (Supplier) + 472 (VAT) + 4751 (IRPF)
   * Usa el desglose Verifactu real (taxableBase/vatAmount/irpfAmount) cuando
   * está disponible y crea los TaxRecords que alimentan el Modelo 303
   * (IVA soportado) y el Modelo 111 (retención IRPF).
   */
  static async mapExpenseToEntry(expenseId: string) {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { supplier: true }
    });

    if (!expense) throw new Error('Gasto no encontrado');

    const tenantId = expense.tenantId;
    const accounts = await this.getTenantAccounts(tenantId);

    // Idempotencia: no duplicar si ya existe asiento para este gasto
    const existing = await prisma.accountingEntry.findFirst({
      where: { reference: expenseId }
    });
    if (existing) return existing;

    const meta = (expense.metadata as Record<string, unknown>) || {};
    const irpfAmount = Number(meta.irpfAmount) || 0;
    const irpfRate = Number(meta.irpfRate) || 0;

    // Desglose real (Verifactu) o estimación desde el total
    let base = Number(expense.taxableBase);
    let vat = Number(expense.vatAmount);
    let vatRate = Number(expense.vatRate);

    if (!Number.isFinite(base) || base <= 0) {
      // Sin desglose: amount incluye IVA (tipo real o 21% por defecto)
      const total = Number(expense.amount);
      const rate = vatRate > 0 ? vatRate : 21;
      base = Math.round((total / (1 + rate / 100)) * 100) / 100;
      vat = vat > 0 ? vat : Math.round((total - base) * 100) / 100;
      vatRate = rate;
    } else if (!Number.isFinite(vat) || vat <= 0) {
      vat = Math.round((base * ((vatRate > 0 ? vatRate : 21) / 100)) * 100) / 100;
    }
    if (!(vatRate > 0)) vatRate = 21;

    // Try confirmed AI classification first
    const confirmedCode = meta?.confirmedAccountCode as string | undefined;
    const expenseAccount = confirmedCode ?? this.fallbackAccountForCategory(expense.category);

    // Líneas balanceadas: Debe(base + IVA) = Haber(pago proveedor + retención)
    const payable = Math.round((base + vat - irpfAmount) * 100) / 100;
    const lines: EntryLineInput[] = [
      { accountId: accounts[expenseAccount], debit: base, credit: 0 },
    ];
    if (vat > 0) lines.push({ accountId: accounts['472'], debit: vat, credit: 0 });
    lines.push({ accountId: accounts['410'], debit: 0, credit: payable });
    if (irpfAmount > 0) lines.push({ accountId: accounts['4751'], debit: 0, credit: irpfAmount });

    const expenseDate = expense.date ?? expense.createdAt;
    const periodMonth = expenseDate.getMonth() + 1;
    const periodYear = expenseDate.getFullYear();

    // Impactos fiscales: IVA soportado (Modelo 303) + retención IRPF (Modelo 111)
    const taxImpacts: TaxImpactInput[] = [];
    if (vat > 0) {
      taxImpacts.push({
        type: 'IVA_SOPORTADO',
        baseAmount: base,
        taxRate: vatRate,
        taxAmount: vat,
        periodMonth,
        periodYear,
      });
    }
    if (irpfAmount > 0) {
      taxImpacts.push({
        type: 'IRPF_RETENCION',
        baseAmount: base,
        taxRate: irpfRate,
        taxAmount: irpfAmount,
        periodMonth,
        periodYear,
      });
    }

    return await EntryManager.createEntry({
      tenantId,
      description: `Gasto: ${expense.description}`,
      reference: expense.id,
      lines,
      taxImpacts: taxImpacts.length > 0 ? taxImpacts : undefined,
    });
  }

  private static fallbackAccountForCategory(category: string): string {
    const map: Record<string, string> = {
      compras: '600',
      'materias primas': '601',
      arrendamiento: '621',
      alquiler: '621',
      reparacion: '622',
      honorarios: '623',
      profesional: '623',
      transporte: '624',
      seguro: '625',
      banca: '626',
      publicidad: '627',
      suministro: '628',
      luz: '628',
      agua: '628',
      gas: '628',
      telefono: '628',
      marketing: '629',
      software: '629',
      suscripcion: '629',
      sueldo: '640',
      salario: '640',
      nomina: '640',
      'seguridad social': '642',
      personal: '649',
    };
    const lower = category.toLowerCase();
    for (const [key, code] of Object.entries(map)) {
      if (lower.includes(key)) return code;
    }
    return '629';
  }

  /**
   * Maps a payment event to a ledger entry (Settling debt).
   * 400/430 -> 572 (Bank)
   */
  static async mapPaymentToEntry(data: {
    tenantId: string;
    description: string;
    amount: number;
    reference: string;
    type: 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT';
  }) {
    const accounts = await this.getTenantAccounts(data.tenantId);
    
    const lines = data.type === 'CUSTOMER_PAYMENT' 
      ? [
          { accountId: accounts['572'], debit: data.amount, credit: 0 },
          { accountId: accounts['430'], debit: 0, credit: data.amount }
        ]
      : [
          { accountId: accounts['400'] || accounts['410'], debit: data.amount, credit: 0 },
          { accountId: accounts['572'], debit: 0, credit: data.amount }
        ];

    return await EntryManager.createEntry({
      tenantId: data.tenantId,
      description: data.description,
      reference: data.reference,
      lines
    });
  }

  private static async getTenantAccounts(tenantId: string) {
    const accounts = await prisma.accountingAccount.findMany({
      where: { tenantId }
    });
    
    const map: Record<string, string> = {};
    accounts.forEach(a => map[a.code] = a.id);
    
    const criticalCodes = ['430', '700', '705', '477', '640', '4751', '476', '572', '472', '410', '629', '621', '600'];
    for (const code of criticalCodes) {
      if (!map[code]) {
        console.warn(`[Accounting] Cuenta crítica ${code} no encontrada para tenant ${tenantId}. Las operaciones que la requieran fallarán.`);
      }
    }
    
    return map;
  }
}
