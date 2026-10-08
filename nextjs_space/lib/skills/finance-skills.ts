import { prisma } from '@/lib/db';
import { skillsLogger, trackSkillExecution } from './observability';
import { eventBus, EVENTS } from './event-bus';
import { ExpenseIntegrityService } from '../finance/expense-integrity';

/**
 * ERP Finance Skills
 */

export interface CreateSupplierInput {
  tenantId: string;
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  streetType?: string;
  streetName?: string;
  streetNumber?: string;
  staircase?: string;
  floor?: string;
  door?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  category: string;
}

export interface CreateExpenseInput {
  tenantId: string;
  createdById: string;
  supplierId: string;
  leadId?: string;
  /** Atribución opcional a una reserva de hospitality (rentabilidad real). */
  hospitalityReservationId?: string;
  /**
   * Claves que se guardan en `metadata` tal cual, sin pisar las propias. Sirven
   * para dejar constancia de la procedencia del apunte (el pedido de compra que
   * lo generó, si ya venía de una factura conciliada…) sin abrir un campo nuevo
   * en el esquema por cada origen.
   */
  metadataExtra?: Record<string, unknown>;
  description: string;
  amount: number;
  currency?: string;
  date?: Date;
  dueDate?: Date;
  paymentMethod?: string;
  category: string;
  receiptUrl?: string;
  status?: 'PENDING' | 'PAID' | 'VOID';
  exifLat?: number;
  exifLng?: number;

  // ── Verifactu ─────────────────────────────────────────────
  invoiceNumber?: string;
  serie?: string;
  taxableBase?: number;
  vatRate?: number;
  vatAmount?: number;
  irpfRate?: number;
  irpfAmount?: number;
  // Retención de IVA (casos legales específicos, p. ej. 1%)
  ivaRetentionRate?: number;
  ivaRetentionAmount?: number;
  surchargeRate?: number;
  surchargeAmount?: number;
  taxRegime?: string;
  operationType?: string;
  totalFactura?: number;
  operationDate?: Date;
  issuerName?: string;
  issuerAddress?: string;
  issuerTaxId?: string;
  // Receptor
  receptorNombre?: string;
  receptorNif?: string;
  receptorDireccion?: string;
  // Pago
  iban?: string;
  // Líneas de detalle
  lineas?: { descripcion: string | null; cantidad: number | null; precio_unitario: number | null; importe: number | null }[];
  // Desglose de IVA corregido o detectado por tramos
  vatBreakdown?: { rate: number; base: number; amount: number }[];
}

/**
 * Registrar un nuevo proveedor
 */
export async function createSupplier(input: CreateSupplierInput) {
  return await trackSkillExecution('create_supplier', async () => {
    const supplier = await prisma.supplier.create({
      data: {
        ...input,
        active: true
      }
    });

    skillsLogger.info(`Proveedor creado: ${supplier.name}`, { tenantId: input.tenantId });
    
    return supplier;
  });
}

/**
 * Calcula la retención aplicable a un gasto según el trato fiscal del
 * proveedor (art. 101 LIRPF / art. 84 LIVA). Reglas:
 *   • Si ya vienen irpfRate/irpfAmount explícitos (formulario/OCR), se
 *     respetan tal cual.
 *   • Si no, se usa el % configurado en el proveedor (> 0) sobre la base
 *     imponible (o el importe total si no se desglosa).
 * Función pura: fácil de testear sin BD.
 */
export function applySupplierRetention(params: {
  supplierIrpfRetention: number;
  supplierIvaRetention: number;
  irpfRate?: number;
  irpfAmount?: number;
  ivaRetentionRate?: number;
  ivaRetentionAmount?: number;
  baseImponible: number;
}): {
  irpfRate: number | undefined;
  irpfAmount: number | undefined;
  ivaRetentionRate: number | undefined;
  ivaRetentionAmount: number | undefined;
} {
  const { supplierIrpfRetention, supplierIvaRetention, baseImponible } = params;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let irpfRate = params.irpfRate;
  let irpfAmount = params.irpfAmount;
  let ivaRetentionRate = params.ivaRetentionRate;
  let ivaRetentionAmount = params.ivaRetentionAmount;

  if (irpfRate == null && supplierIrpfRetention > 0) {
    irpfRate = supplierIrpfRetention;
    irpfAmount = round2(baseImponible * (supplierIrpfRetention / 100));
  }
  if (ivaRetentionRate == null && supplierIvaRetention > 0) {
    ivaRetentionRate = supplierIvaRetention;
    ivaRetentionAmount = round2(baseImponible * (supplierIvaRetention / 100));
  }

  return { irpfRate, irpfAmount, ivaRetentionRate, ivaRetentionAmount };
}

/**
 * Registrar un nuevo gasto
 */
export async function createExpense(input: CreateExpenseInput) {
  return await trackSkillExecution('create_expense', async () => {
    // 1. Obtener el último gasto para el encadenamiento (Chain-of-Trust)
    const lastExpense = await prisma.expense.findFirst({
      where: { tenantId: input.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { fingerprint: true }
    });

    // 2. Obtener config del tenant para VISION-LOCK
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { baseLatitude: true, baseLongitude: true }
    });

    // 3. Validar anomalía de ubicación
    const { isAnomaly } = ExpenseIntegrityService.checkLocationAnomaly(
      input.exifLat || null,
      input.exifLng || null,
      tenant?.baseLatitude || null,
      tenant?.baseLongitude || null
    );

    // ── Retención automática según el trato fiscal del proveedor ──────────
    // Si la ruta/OCR no trae irpfRate/irpfAmount explícitos, se aplica la
    // retención configurada en el proveedor (fiscalRegime → irpfRetention /
    // ivaRetention). Base = base imponible declarada, o el importe total si
    // no se desglosa. La retención se guarda en metadata y se devuelve.
    const supplierWithFiscal = await prisma.supplier.findUnique({
      where: { id: input.supplierId },
      select: { irpfRetention: true, ivaRetention: true, fiscalRegime: true },
    });
    const retention = applySupplierRetention({
      supplierIrpfRetention: supplierWithFiscal?.irpfRetention ?? 0,
      supplierIvaRetention: supplierWithFiscal?.ivaRetention ?? 0,
      irpfRate: input.irpfRate,
      irpfAmount: input.irpfAmount,
      ivaRetentionRate: input.ivaRetentionRate,
      ivaRetentionAmount: input.ivaRetentionAmount,
      baseImponible: input.taxableBase ?? input.amount,
    });
    const { irpfRate, irpfAmount, ivaRetentionRate, ivaRetentionAmount } = retention;

    // Extraer campos nuevos (no existen en Prisma) para guardarlos en metadata
    const { serie, surchargeRate, surchargeAmount, taxRegime, operationType, totalFactura, receptorNombre, receptorNif, receptorDireccion, iban, vatBreakdown, irpfRate: _ir, irpfAmount: _ia, ivaRetentionRate: _ivr, ivaRetentionAmount: _iva, metadataExtra: _me, ...prismaInput } = input
    
    const expense = await prisma.expense.create({
      data: {
        ...prismaInput,
        date: input.date || new Date(),
        status: input.status || 'PAID',
        parentFingerprint: lastExpense?.fingerprint || null,
        isAnomaly,
        metadata: {
          // La procedencia va primero: las claves propias del gasto (retenciones,
          // tramos de IVA…) siempre mandan sobre lo que declare quien lo crea.
          ...(input.metadataExtra ?? {}),
          serie: serie || null,
          irpfRate: irpfRate || null,
          irpfAmount: irpfAmount || null,
          ivaRetentionRate: ivaRetentionRate || null,
          ivaRetentionAmount: ivaRetentionAmount || null,
          surchargeRate: surchargeRate || null,
          surchargeAmount: surchargeAmount || null,
          taxRegime: taxRegime || null,
          operationType: operationType || null,
          totalFactura: totalFactura || null,
          receptorNombre: receptorNombre || null,
          receptorNif: receptorNif || null,
          receptorDireccion: receptorDireccion || null,
          iban: iban || null,
          lineas: input.lineas || null,
          vatBreakdown: vatBreakdown || null,
        },
      },
      include: {
        supplier: true
      }
    });

    // 4. Calcular y sellar la huella digital (Veri*factu)
    const fingerprint = ExpenseIntegrityService.calculateFingerprint({
      id: expense.id,
      amount: expense.amount,
      createdById: expense.createdById,
      parentFingerprint: expense.parentFingerprint
    });

    const updatedExpense = await prisma.expense.update({
      where: { id: expense.id },
      data: { fingerprint },
      include: { supplier: true }
    });

    // Actualizar balance del proveedor si el gasto está pendiente (Cuentas por Pagar)
    if (updatedExpense.status === 'PENDING') {
      await prisma.supplier.update({
        where: { id: input.supplierId },
        data: { balance: { increment: input.amount } }
      });
    }

    skillsLogger.info(`Gasto registrado con Veri*factu: ${updatedExpense.description}`, { 
      tenantId: input.tenantId,
      expenseId: updatedExpense.id,
      isAnomaly
    });

    eventBus.emit(EVENTS.RESOURCE_CREATED, {
      type: 'expense',
      id: updatedExpense.id,
      tenantId: input.tenantId,
      metadata: { 
        amount: updatedExpense.amount, 
        category: updatedExpense.category,
        isAnomaly,
        fingerprint
      }
    });

    // Notificar a la contabilidad para que genere el asiento y los registros
    // fiscales (IVA soportado → Modelo 303, retención IRPF → Modelo 111).
    // En Next.js standalone el listener registrado desde instrumentation.ts
    // puede vivir en otra instancia del event bus (bundles separados) y nunca
    // recibiría el evento; aseguramos el listener en ESTE bundle antes de
    // emitir (mismo patrón que ensureAutomationListeners).
    const { ensureAccountingListeners } = await import('@/lib/accounting/accounting-listener');
    try {
      ensureAccountingListeners();
    } catch (e) {
      skillsLogger.warn('[Finance] No se pudieron asegurar los listeners contables:', e);
    }
    eventBus.emitEvent(EVENTS.EXPENSE_CREATED, {
      tenantId: input.tenantId,
      expenseId: updatedExpense.id,
      monto: updatedExpense.amount,
      categoria: updatedExpense.category,
      retencionIrpf: irpfAmount || null,
      retencionIrpfRate: irpfRate || null,
      retencionIva: ivaRetentionAmount || null,
      retencionIvaRate: ivaRetentionRate || null,
      source: 'app' as const,
      timestamp: new Date(),
    });

    return updatedExpense;
  });
}

/**
 * Skill de Visión: Registra un gasto a partir de datos extraídos por IA
 * (Gemma 4 Vision procesa la imagen y llama a este skill con el JSON)
 */
export async function registerExpenseVision(input: {
  tenantId: string;
  userId: string;
  extractedData: {
    supplierName: string;
    amount: number;
    date?: string;
    category?: string;
    description?: string;
    taxId?: string;
  };
  receiptUrl?: string;
}) {
  return await trackSkillExecution('register_expense_vision', async () => {
    const { tenantId, userId, extractedData, receiptUrl } = input;

    // 1. Buscar o Crear Proveedor
    let supplier = await prisma.supplier.findFirst({
      where: {
        tenantId,
        OR: [
          { name: { contains: extractedData.supplierName, mode: 'insensitive' } },
          { taxId: extractedData.taxId || undefined }
        ]
      }
    });

    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          tenantId,
          name: extractedData.supplierName,
          taxId: extractedData.taxId,
          category: extractedData.category || 'Varios',
        }
      });
    }

    // 2. Crear Gasto
    const expense = await createExpense({
      tenantId,
      createdById: userId,
      supplierId: supplier.id,
      amount: extractedData.amount,
      description: extractedData.description || `Gasto extraído de IA - ${extractedData.supplierName}`,
      category: extractedData.category || 'General',
      receiptUrl,
      date: extractedData.date ? new Date(extractedData.date) : new Date(),
      status: 'PAID',
      exifLat: (extractedData as any).exifLat,
      exifLng: (extractedData as any).exifLng
    });

    return {
      success: true,
      expenseId: expense.id,
      supplierName: supplier.name,
      amount: expense.amount
    };
  });
}

/**
 * Análisis de Burn Rate: Compara ingresos vs egresos
 */
export async function analyzeBurnRate(input: { tenantId: string, months?: number }) {
  return await trackSkillExecution('analyze_burn_rate', async () => {
    const months = input.months || 3;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);

    // Obtener cobros (Invoices pagadas)
    const incomes = await prisma.invoice.aggregate({
      where: {
        tenantId: input.tenantId,
        estado: 'pagada',
        fechaEmision: { gte: startDate }
      },
      _sum: { monto: true }
    });

    // Obtener gastos
    const expenses = await prisma.expense.aggregate({
      where: {
        tenantId: input.tenantId,
        status: 'PAID',
        date: { gte: startDate }
      },
      _sum: { amount: true }
    });

    const totalIncome = incomes._sum.monto || 0;
    const totalExpense = expenses._sum.amount || 0;
    const netProfit = totalIncome - totalExpense;
    const burnRateStatus = totalExpense > totalIncome ? 'CRITICAL' : totalExpense > totalIncome * 0.8 ? 'WARNING' : 'HEALTHY';

    return {
      periodMonths: months,
      totalIncome,
      totalExpense,
      netProfit,
      burnRateStatus,
      recommendation: burnRateStatus === 'CRITICAL' 
        ? "Tus gastos superan los ingresos. Se recomienda revisar categorías de 'Marketing' y 'Suscripciones'." 
        : "Salud financiera estable."
    };
  });
}
