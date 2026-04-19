import { prisma } from '@/lib/db';
import { VaultService } from '../security/vault';
import { SkillContext } from './context';
import crypto from 'crypto';

/**
 * SKILL: orchestrate_secure_payroll
 * Orquestación de nómina basada en mérito y cumplimiento fiscal.
 * PRIVACIDAD: Nunca devuelve el IBAN o el ID de Gobierno al LLM.
 */
export async function orchestrate_secure_payroll({ tenantId, employeeId, ctx }: { tenantId: string, employeeId: string, ctx: SkillContext }) {
  // 🛡️ SECURITY PROTOCOL: Bloqueo si no es OWNER
  if (ctx.user?.role !== 'OWNER' && ctx.user?.role !== 'ADMIN') {
    throw new Error('ACCESO DENEGADO: Este skill requiere privilegios de OWNER/ADMIN.');
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId, tenantId },
    include: { tenant: { select: { vaultSeed: true } } }
  });

  if (!employee) throw new Error('Empleado no encontrado');

  // 1. Acceso seguro al Salario en "The Vault"
  let decryptedSalary = 0;
  if (employee.salaryEncrypted) {
    const raw = VaultService.decrypt(employee.salaryEncrypted, tenantId, employee.tenant.vaultSeed || '');
    decryptedSalary = parseFloat(raw) || 0;
  }

  // 2. Cross-reference con Gastos Validados (Veri*factu)
  const validatedExpenses = await prisma.expense.aggregate({
    where: {
      tenantId,
      createdById: employee.userId || '',
      verificationStatus: 'VALIDATED',
      status: 'PAID'
    },
    _sum: { amount: true }
  });

  const bonusAmount = validatedExpenses._sum.amount || 0;
  const totalConsolidated = decryptedSalary + bonusAmount;

  // 3. Generar Hash de Control de Nómina (Integridad de Transferencia)
  const controlHash = crypto.createHash('sha256')
    .update(`${employee.id}:${totalConsolidated}:${new Date().toISOString()}`)
    .digest('hex');

  return {
    employeeName: employee.fullName,
    period: new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    status: 'READY_TO_PAY',
    consolidatedSummary: {
      baseSalary: decryptedSalary > 0 ? 'CONECTADO (Cifrado)' : 'NO_CONFIGURADO',
      verifiedExpenses: bonusAmount,
      currency: 'EUR'
    },
    totalToDisburse: totalConsolidated,
    controlHash,
    confidentialityNotice: 'Los datos bancarios (IBAN) han sido procesados internamente y no se exponen al Agente de IA.'
  };
}
