import { prisma } from '@/lib/db';
import { monedaEscritura } from '@/lib/moneda';
import { createExpense, CreateExpenseInput } from '../skills/finance-skills';
import { skillsLogger } from '../skills/observability';

// ═══════════════════════════════════════════════════════════════
// Recovered Invoice Service — Framework sin datos mock
// ═══════════════════════════════════════════════════════════════
//
// La recuperación proactiva solo funciona cuando el tenant tiene
// configurado un proveedor de facturación electrónica en
// Tenant.configuracion.recuperacionProactiva con { enabled, provider }.
// Sin esa configuración el cron es un no-op.
//
// Proveedores soportados:
//   - "verifactu": stub listo para integrar con la API de Hacienda.
//     Necesita certificado digital y clave privada en los metadatos.
//   - "nexus": stub listo para integrar con Nexus/Hacienda.
//   - "volkern_json": adaptador interno (ya existente).
//
// Para activar en un tenant, añadir en Tenant.configuracion:
//   { "recuperacionProactiva": {
//       "enabled": true,
//       "provider": "verifactu",
//       "pollIntervalHours": 4
//   }}
//
// Para desactivar (por defecto): no añadir la clave o poner enabled: false.
// ═══════════════════════════════════════════════════════════════

/**
 * Configuración de recuperación proactiva por tenant
 * (almacenada en Tenant.configuracion.recuperacionProactiva)
 */
export interface ProactiveRecoveryConfig {
  enabled: boolean
  provider?: string
  /** Intervalo de sondeo en horas (default: 4) */
  pollIntervalHours?: number
  /** Credenciales del proveedor (API key, certificado, etc.) */
  credentials?: Record<string, string>
}

/**
 * Resultado de una ejecución de recuperación para un tenant.
 */
export interface RecoveryResult {
  tenantId: string
  provider: string
  fetched: number
  processed: number
  errors: string[]
}

/**
 * Interface para adaptadores de facturas externas
 */
export interface InvoiceAdapter {
  /** Obtiene facturas pendientes del proveedor externo */
  fetchPending(config: ProactiveRecoveryConfig, tenantId: string): Promise<any[]>
  /** Parsea una factura del proveedor al formato interno */
  parse(data: any, tenantId: string): Omit<CreateExpenseInput, 'tenantId' | 'createdById'>
}

/**
 * Adaptador estándar de Volkern (JSON interno)
 */
export class VolkernStandardAdapter implements InvoiceAdapter {
  async fetchPending(): Promise<any[]> {
    // Adaptador interno: no busca facturas externas
    return []
  }
  parse(data: any): Omit<CreateExpenseInput, 'tenantId' | 'createdById'> {
    return {
      supplierId: data.supplierId,
      description: data.description || `Factura recuperada: ${data.invoiceNumber}`,
      amount: data.totalAmount,
      // La divisa la declara la factura del proveedor; si no la trae, el servicio
      // resuelve la del tenant al crear el gasto.
      currency: data.currency,
      date: data.issueDate ? new Date(data.issueDate) : new Date(),
      category: data.category || 'Recuperación Proactiva'
    }
  }
}

/**
 * Adaptador stub para VeriFactu (Hacienda España).
 *
 * TODO: integrar con la API real de Hacienda cuando el tenant
 * proporcione certificado digital y clave privada.
 * La API real de VeriFactu requiere:
 *   - Certificado digital X.509
 *   - Clave privada del certificado
 *   - Endpoints de Hacienda (https://prewww1.aeat.es/wlpl/TIKE-SF/...)
 *   - Registro previo del software en el SII
 */
export class VeriFactuAdapter implements InvoiceAdapter {
  async fetchPending(config: ProactiveRecoveryConfig, tenantId: string): Promise<any[]> {
    if (!config.credentials?.certPath || !config.credentials?.keyPath) {
      skillsLogger.warn(`[VeriFactu] Tenant ${tenantId} sin credenciales de certificado — saltando`)
      return []
    }
    // TODO: implementar conexión real a la API de Hacienda
    // Necesita: certificado digital + clave + endpoint SII
    skillsLogger.info(`[VeriFactu] Tenant ${tenantId}: adaptador registrado pero sin integración real aún`)
    return []
  }

  parse(data: any): Omit<CreateExpenseInput, 'tenantId' | 'createdById'> {
    return {
      supplierId: data.supplierId,
      description: data.description || `Factura Veri*factu: ${data.invoiceNumber}`,
      amount: data.totalAmount,
      // La divisa la declara la factura del proveedor; si no la trae, el servicio
      // resuelve la del tenant al crear el gasto.
      currency: data.currency,
      date: data.issueDate ? new Date(data.issueDate) : new Date(),
      category: data.category || 'Veri*factu'
    }
  }
}

/**
 * Adaptador stub para Nexus/Hacienda.
 */
export class NexusAdapter implements InvoiceAdapter {
  async fetchPending(config: ProactiveRecoveryConfig, tenantId: string): Promise<any[]> {
    if (!config.credentials?.apiKey) {
      skillsLogger.warn(`[Nexus] Tenant ${tenantId} sin API key — saltando`)
      return []
    }
    // TODO: implementar conexión real a la API de Nexus
    skillsLogger.info(`[Nexus] Tenant ${tenantId}: adaptador registrado pero sin integración real aún`)
    return []
  }

  parse(data: any): Omit<CreateExpenseInput, 'tenantId' | 'createdById'> {
    return {
      supplierId: data.supplierId,
      description: data.description || `Factura Nexus: ${data.invoiceNumber}`,
      amount: data.totalAmount,
      // La divisa la declara la factura del proveedor; si no la trae, el servicio
      // resuelve la del tenant al crear el gasto.
      currency: data.currency,
      date: data.issueDate ? new Date(data.issueDate) : new Date(),
      category: data.category || 'Nexus'
    }
  }
}

/**
 * Servicio de Recuperación Proactiva de Facturas.
 *
 * Solo procesa tenants con `Tenant.configuracion.recuperacionProactiva`
 * habilitado. Sin esa configuración el cron es un no-op.
 */
export class InboundInvoiceService {
  private static adapters: Record<string, InvoiceAdapter> = {
    'volkern_json': new VolkernStandardAdapter(),
    'verifactu': new VeriFactuAdapter(),
    'nexus': new NexusAdapter(),
  };

  /**
   * Ejecuta la recuperación proactiva para TODOS los tenants habilitados.
   * Llamada por el cron cada 4 horas.
   */
  static async runProactiveRecovery(): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = []

    // Solo tenants activos con recuperación habilitada
    const tenants = await prisma.tenant.findMany({
      where: { estado: 'activo' },
      select: { id: true, nombre: true, configuracion: true },
    })

    for (const tenant of tenants) {
      const cfg = (tenant.configuracion as any)?.recuperacionProactiva as ProactiveRecoveryConfig | undefined

      // Si no está configurada o no está habilitada → skip
      if (!cfg || cfg.enabled !== true) continue

      const provider = cfg.provider || 'volkern_json'
      const adapter = this.adapters[provider]

      if (!adapter) {
        skillsLogger.warn(
          `[Recuperación Proactiva] Tenant ${tenant.id} (${tenant.nombre}): provider "${provider}" no registrado. Proveedores disponibles: ${Object.keys(this.adapters).join(', ')}`
        )
        results.push({
          tenantId: tenant.id,
          provider,
          fetched: 0,
          processed: 0,
          errors: [`Provider "${provider}" no registrado`],
        })
        continue
      }

      try {
        const pending = await adapter.fetchPending(cfg, tenant.id)
        let processed = 0
        const errors: string[] = []

        for (const inv of pending) {
          try {
            await this.processInboundInvoice(tenant.id, provider, inv)
            processed++
          } catch (e: any) {
            errors.push(e?.message || String(e))
          }
        }

        if (pending.length > 0) {
          skillsLogger.info(
            `[Recuperación Proactiva] Tenant ${tenant.id}: ${pending.length} facturas, ${processed} procesadas, ${errors.length} errores`
          )
        }

        results.push({ tenantId: tenant.id, provider, fetched: pending.length, processed, errors })
      } catch (e: any) {
        skillsLogger.error(`[Recuperación Proactiva] Tenant ${tenant.id}: error ${e?.message}`)
        results.push({
          tenantId: tenant.id,
          provider,
          fetched: 0,
          processed: 0,
          errors: [e?.message || String(e)],
        })
      }
    }

    return results
  }

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

    // El adaptador reporta la divisa que leyó en la factura; la del tenant es el
    // respaldo, no un euro escrito en el adaptador.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { moneda: true },
    });

    // Utilizamos el skill nativo que ya realiza el encadenamiento de Veri*factu
    const expense = await createExpense({
      ...expenseData,
      currency: monedaEscritura(expenseData.currency, tenant?.moneda),
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
