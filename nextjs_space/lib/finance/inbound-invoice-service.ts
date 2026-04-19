import { prisma } from '@/lib/db';
import { createExpense, CreateExpenseInput } from '../skills/finance-skills';
import { skillsLogger } from '../skills/observability';

/**
 * Interface para adaptadores de facturas externas
 */
export interface InvoiceAdapter {
  parse(data: any, tenantId: string): Omit<CreateExpenseInput, 'tenantId' | 'createdById'>;
}

/**
 * Adaptador estándar de Volkern (JSON Veri*factu Schema)
 */
export class VolkernStandardAdapter implements InvoiceAdapter {
  parse(data: any, tenantId: string): Omit<CreateExpenseInput, 'tenantId' | 'createdById'> {
    return {
      supplierId: data.supplierId,
      description: data.description || `Factura recuperada: ${data.invoiceNumber}`,
      amount: data.totalAmount,
      currency: data.currency || 'EUR',
      date: data.issueDate ? new Date(data.issueDate) : new Date(),
      category: data.category || 'Recuperación Proactiva'
    };
  }
}

/**
 * Servicio de Recepción de Facturas Proactiva
 */
export class InboundInvoiceService {
  private static adapters: Record<string, InvoiceAdapter> = {
    'volkern_json': new VolkernStandardAdapter()
  };

  /**
   * Obtiene o crea el BOT de sistema para el tenant
   */
  private static async getSystemBot(tenantId: string) {
    const botEmail = `finance-engine@volkern.system`;
    
    let bot = await prisma.user.findFirst({
      where: { email: botEmail, tenantId }
    });

    if (!bot) {
      // Intentar encontrar el rol SYSTEM_BOT o crearlo
      let role = await prisma.role.findFirst({
        where: { tenantId, nombre: 'SYSTEM_BOT' }
      });

      if (!role) {
        role = await prisma.role.create({
          data: {
            tenantId,
            nombre: 'SYSTEM_BOT',
            descripcion: 'Bot oficial para procesos automáticos de finanzas.',
            permisos: { erp: ['read', 'write'] }
          }
        });
      }

      bot = await prisma.user.create({
        data: {
          tenantId,
          email: botEmail,
          name: 'Volkern Finance Engine',
          roleId: role.id,
          estado: 'activo',
          metadata: { is_system_bot: true }
        }
      });
    }

    return bot;
  }

  /**
   * Procesa una factura entrante usando el adaptador correspondiente
   */
  static async processInboundInvoice(tenantId: string, format: string, data: any) {
    const adapter = this.adapters[format];
    if (!adapter) {
      throw new Error(`Adaptador no soportado: ${format}`);
    }

    const bot = await this.getSystemBot(tenantId);
    if (!bot) throw new Error('No se pudo inicializar el Bot de Sistema.');

    const expenseData = adapter.parse(data, tenantId);

    // Utilizamos el skill nativo que ya realiza el encadenamiento de Veri*factu
    const expense = await createExpense({
      ...expenseData,
      tenantId,
      createdById: bot.id,
      status: 'PAID' // Marcar como pagada si viene de recuperación proactiva (o según lógica de negocio)
    });

    skillsLogger.info(`Factura proactiva procesada exitosamente`, {
      tenantId,
      expenseId: expense.id,
      botId: bot.id
    });

    return expense;
  }
}
