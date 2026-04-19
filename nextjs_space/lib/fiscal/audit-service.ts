import { prisma } from '../db';
import { generateInvoiceFingerprint, GENESIS_FINGERPRINT } from '../crypto-utils';

export interface AuditReport {
  tenantId: string;
  status: 'ÍGTEGRA' | 'COMPROMETIDA';
  totalInvoices: number;
  breaches: string[];
  lastAuditDate: Date;
}

/**
 * Servicio de Auditoría Forense Veri*factu
 */
export class FiscalAuditService {
  /**
   * Ejecuta una auditoría completa para un tenant específico
   */
  static async auditTenant(tenantId: string): Promise<AuditReport> {
    const invoices = await prisma.invoice.findMany({
      where: { 
        tenantId,
        verifactuVersion: 2
      },
      orderBy: { sequenceNumber: 'asc' }
    });

    const breaches: string[] = [];
    let currentParentFingerprint = GENESIS_FINGERPRINT;

    // Obtener NIF del emisor
    const configFiscal = await prisma.configuracionFiscalEmisor.findFirst({
      where: { tenantId }
    });
    const emisorNif = configFiscal?.idFiscal || 'NIF-PENDIENTE';

    for (const inv of invoices) {
      // 1. Verificar encadenamiento
      if (inv.parentFingerprint !== currentParentFingerprint) {
        breaches.push(`Salto de cadena detectado en factura ${inv.numero}. Se esperaba parent: ${currentParentFingerprint.substring(0, 10)}... pero se encontró: ${inv.parentFingerprint?.substring(0, 10)}...`);
      }

      // 2. Verificar integridad del contenido (recalcular hash)
      // Necesitamos el NIF del receptor
      const receptorNif = await this.getReceptorNif(inv);
      
      const recalculatedHash = generateInvoiceFingerprint({
        tenantId: inv.tenantId,
        emisorNif,
        receptorNif,
        numero: inv.numero,
        fechaEmision: inv.fechaEmision.toISOString(),
        monto: inv.monto,
        moneda: inv.moneda,
        parentFingerprint: inv.parentFingerprint || GENESIS_FINGERPRINT
      });

      if (recalculatedHash !== inv.fingerprint) {
        breaches.push(`Alteración de datos detectada en factura ${inv.numero}. Hash almacenado no coincide con los datos actuales.`);
      }

      currentParentFingerprint = inv.fingerprint || '';
    }

    return {
      tenantId,
      status: breaches.length === 0 ? 'ÍGTEGRA' : 'COMPROMETIDA',
      totalInvoices: invoices.length,
      breaches,
      lastAuditDate: new Date()
    };
  }

  /**
   * Helper para obtener el NIF del receptor desde Lead o Contact
   */
  private static async getReceptorNif(invoice: any): Promise<string> {
    if (invoice.contactId) {
      const p = await prisma.perfilFiscalCliente.findFirst({ where: { contactId: invoice.contactId } });
      return p?.idFiscal || '';
    }
    if (invoice.leadId) {
      const p = await prisma.perfilFiscalCliente.findFirst({ where: { leadId: invoice.leadId } });
      return p?.idFiscal || '';
    }
    return '';
  }

  /**
   * Envía el reporte a un servicio externo de logging (Gobernanza Externa)
   * Implementa lógica de reintento "fire-and-forget".
   */
  private static async sendToExternalAuditLog(report: AuditReport, attempt: number = 1) {
    const url = process.env.EXTERNAL_AUDIT_LOG_URL;
    if (!url) {
      console.warn('[Audit] ⚠️ EXTERNAL_AUDIT_LOG_URL no definida. Saltando logging externo.');
      return;
    }

    const maxRetries = 3;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...report,
          source: 'volkern-fiscal-service',
          version: '1.0'
        })
      });

      if (response.ok) {
        console.log(`[Audit] ✅ Reporte para ${report.tenantId} enviado a log externo.`);
      } else {
        throw new Error(`Servicio externo respondió con status ${response.status}`);
      }
    } catch (error) {
      console.error(`[Audit] ❌ Intento ${attempt} de envío de log externo falló para ${report.tenantId}:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Backoff exponencial básico
        setTimeout(() => this.sendToExternalAuditLog(report, attempt + 1), delay);
      } else {
        console.error(`[Audit] 🚨 Fallo definitivo enviando log externo para ${report.tenantId} tras ${maxRetries} intentos.`);
      }
    }
  }

  /**
   * Auditoría global del sistema
   */
  static async auditAllTenants(): Promise<AuditReport[]> {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    const reports: AuditReport[] = [];

    for (const tenant of tenants) {
      const report = await this.auditTenant(tenant.id);
      reports.push(report);
      
      // 1. Log en base de datos local
      if (report.status === 'COMPROMETIDA') {
        await prisma.globalAuditCloud.create({
          data: {
            tenantId: tenant.id,
            action: 'FISCAL_BREACH_DETECTED',
            details: JSON.stringify(report.breaches)
          }
        });
      }

      // 2. Logging externo (Gobernanza Desacoplada)
      // Fire-and-forget
      this.sendToExternalAuditLog(report);
    }

    return reports;
  }
}
