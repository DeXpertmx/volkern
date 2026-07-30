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
  description: string;
  amount: number;
  currency?: string;
  date?: Date;
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

    // Extraer campos nuevos (no existen en Prisma) para guardarlos en metadata
    const { serie, irpfRate, irpfAmount, totalFactura, receptorNombre, receptorNif, receptorDireccion, iban, ...prismaInput } = input
    
    const expense = await prisma.expense.create({
      data: {
        ...prismaInput,
        date: input.date || new Date(),
        status: input.status || 'PAID',
        parentFingerprint: lastExpense?.fingerprint || null,
        isAnomaly,
        metadata: {
          serie: serie || null,
          irpfRate: irpfRate || null,
          irpfAmount: irpfAmount || null,
          totalFactura: totalFactura || null,
          receptorNombre: receptorNombre || null,
          receptorNif: receptorNif || null,
          receptorDireccion: receptorDireccion || null,
          iban: iban || null,
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
