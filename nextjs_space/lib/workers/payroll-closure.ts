import { prisma } from '@/lib/db';
import { monedaEscritura } from '@/lib/moneda';
import { VaultService } from '../security/vault';
import { skillsLogger } from '../skills/observability';

/**
 * Worker de Cierre Mensual: Orquestación Veri*factu + Nómina
 */
export class PayrollClosureService {
  /**
   * Genera el payload de gastos validados para un empleado en un periodo específico
   */
  static async generateMonthlyClosure(tenantId: string, employeeId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 1. Obtener al empleado y su vaultSeed
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { 
        user: true,
        tenant: { select: { vaultSeed: true, moneda: true } }
      }
    });

    if (!employee || !employee.userId) {
      throw new Error('Empleado no encontrado o no tiene usuario asociado.');
    }

    const vaultSeed = employee.tenant.vaultSeed;
    if (!vaultSeed) {
      throw new Error('El Tenant no tiene una semilla de cifrado (vaultSeed) configurada.');
    }

    // 2. Obtener todos los gastos del periodo creados por el usuario del empleado
    const expenses = await prisma.expense.findMany({
      where: {
        tenantId,
        createdById: employee.userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    if (expenses.length === 0) {
      return {
        success: true,
        message: 'No hay gastos registrados para este periodo.',
        totalValidated: 0,
        payload: null
      };
    }

  /**
   * REGLA DE SEGURIDAD SOBERANA:
   * El proceso solo se dispara si el 100% de los tickets tienen el fingerprint de Verifactu.
   * Si un hash falla o falta, se bloquea la exportación.
   */
    const invalidExpenses = expenses.filter(e => !e.fingerprint || e.verificationStatus !== 'VALIDATED');

    if (invalidExpenses.length > 0) {
      skillsLogger.error(`Cierre bloqueado: ${invalidExpenses.length} tickets no superaron Veri*factu`, undefined, null, {
        tenantId,
        employeeId,
        period: `${month}/${year}`
      });

      throw new Error(`BLOQUEO DE SEGURIDAD: ${invalidExpenses.length} tickets están pendientes de validación criptográfica o marcados como anómalos.`);
    }

    // 3. Sumar montos y contar anomalías con override
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
    const anomaliesCount = expenses.filter(e => e.isAnomaly).length;

    // 4. Generar Payload Cifrado para el Módulo de Nóminas
    const closureData = {
      employeeId: employee.id,
      fullName: employee.fullName,
      period: `${month}/${year}`,
      totalExpenses: totalAmount,
      // La divisa del primer gasto manda; si no la trae, la de la cuenta.
      currency: monedaEscritura(expenses[0]?.currency, employee.tenant?.moneda),
      ticketCount: expenses.length,
      anomaliesCount,
      integrityCheck: 'PASSED',
      timestamp: new Date().toISOString(),
      controlHash: '' // Se llenará abajo
    };

    // Calcular hash de control del payload (sin el campo controlHash aún)
    const crypto = require('crypto');
    const controlHash = crypto.createHash('sha256').update(JSON.stringify(closureData)).digest('hex');
    closureData.controlHash = controlHash;

    const encryptedPayload = VaultService.encryptJson(closureData, tenantId, vaultSeed);

    // 5. Registrar en auditoría
    skillsLogger.info(`Cierre mensual generado exitosamente para ${employee.fullName}`, {
      tenantId,
      employeeId,
      totalAmount,
      encrypted: true
    });

    const summary = {
      tenantName: (employee.tenant as any).nombre,
      employeeName: employee.fullName,
      period: `${month}/${year}`,
      totalExpenses: totalAmount,
      ticketCount: expenses.length,
      anomaliesCount,
      controlHash,
      payload: encryptedPayload
    };

    return {
      success: true,
      summary,
      report: this.formatClosureCertificate(summary)
    };
  }

  /**
   * Formatea el Certificado de Cierre oficial
   */
  static formatClosureCertificate(summary: any) {
    return `
Asunto: ✅ Cierre de Periodo Finalizado - ${summary.period} - Tenant: ${summary.tenantName}

Resumen de Integridad:
------------------------------------------
Gastos Procesados: ${summary.ticketCount}
Validación Veri*factu: 100% Coincidencia de Hash (Chain OK).
Seguridad The Vault: Datos de personal re-cifrados y validados para el envío de nómina.
Alertas VISION-LOCK: ${summary.anomaliesCount} gastos validados con excepciones de ubicación.

Payload de Salida:
------------------------------------------
El archivo de transferencia para el módulo de nómina ha sido generado con el hash de control [${summary.controlHash}]. 
Los datos sensibles permanecen bajo cifrado AES-256-GCM.
    `.trim();
  }
}
