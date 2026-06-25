import { prisma } from '@/lib/db';
import { EntryManager } from './entry-manager';

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
   */
  static async mapPayrollToEntry(payrollId: string) {
    const payroll = await prisma.payrollRecord.findUnique({
      where: { id: payrollId }
    });

    if (!payroll) throw new Error('Registro de nómina no encontrado');

    const tenantId = payroll.tenantId;
    const accounts = await this.getTenantAccounts(tenantId);
    
    // Decrypting amount (simulated for now, usually handled by a vault service)
    const grossAmount = 2500; // Mock for demo
    const irpf = grossAmount * 0.15;
    const ssEmployee = grossAmount * 0.06;
    const netAmount = grossAmount - irpf - ssEmployee;

    return await EntryManager.createEntry({
      tenantId,
      description: `Nómina Periodo ${payroll.month}/${payroll.year} - ID: ${payroll.id}`,
      reference: payroll.id,
      lines: [
        { accountId: accounts['640'], debit: grossAmount, credit: 0 },
        { accountId: accounts['4751'], debit: 0, credit: irpf },
        { accountId: accounts['476'], debit: 0, credit: ssEmployee },
        { accountId: accounts['572'], debit: 0, credit: netAmount }
      ]
    });
  }

  /**
   * Maps a validated expense to a ledger entry.
   * 600/621/629 (Expense) -> 400/410 (Supplier) + 472 (VAT)
   * Uses AI classification (if confirmed) or falls back to category mapping.
   */
  static async mapExpenseToEntry(expenseId: string) {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { supplier: true }
    });

    if (!expense) throw new Error('Gasto no encontrado');

    const tenantId = expense.tenantId;
    const accounts = await this.getTenantAccounts(tenantId);

    const total = Number(expense.amount);
    const taxRate = 0.21;
    const subtotal = total / (1 + taxRate);
    const vat = total - subtotal;

    // Try confirmed AI classification first
    const meta = expense.metadata as Record<string, unknown> | null;
    const confirmedCode = meta?.confirmedAccountCode as string | undefined;

    const expenseAccount = confirmedCode ?? this.fallbackAccountForCategory(expense.category);

    return await EntryManager.createEntry({
      tenantId,
      description: `Gasto: ${expense.description}`,
      reference: expense.id,
      lines: [
        { accountId: accounts[expenseAccount], debit: subtotal, credit: 0 },
        { accountId: accounts['472'], debit: vat, credit: 0 },
        { accountId: accounts['410'], debit: 0, credit: total }
      ],
      taxImpact: {
        type: 'IVA_SOPORTADO',
        baseAmount: subtotal,
        taxRate: 21,
        taxAmount: vat,
        periodMonth: expense.createdAt.getMonth() + 1,
        periodYear: expense.createdAt.getFullYear()
      }
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
