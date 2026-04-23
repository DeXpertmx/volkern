import { Prisma } from '@prisma/client';
import { VaultService } from '../../security/vault';
import { dbContext } from '../../db';

/**
 * Extensión 'The Vault': Cifrado transparente de datos de personal
 */
export const vaultExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: 'theVault',
    query: {
      employee: {
        async create({ args, query }) {
          const store = dbContext.getStore();
          const tenantId = store?.tenantId;
          const vaultSeed = store?.vaultSeed;

          // Check de Pánico: Si no hay vaultSeed, bloqueamos la escritura de datos sensibles
          if (!vaultSeed) {
            console.error(`[Vault Extension] ERROR CRÍTICO: Bloqueada escritura en Employee para tenant ${tenantId}. vaultSeed ausente.`);
            throw new Error('SECURITY_VIOLATION: No se puede guardar información sensible sin una semilla de cifrado válida (vaultSeed).');
          }

          // Cifrado transparente
          if (args.data.salaryEncrypted) {
            args.data.salaryEncrypted = VaultService.encrypt(args.data.salaryEncrypted, tenantId!, vaultSeed);
          }
          if (args.data.bankDetailsEncrypted) {
            args.data.bankDetailsEncrypted = VaultService.encrypt(args.data.bankDetailsEncrypted, tenantId!, vaultSeed);
          }
          if (args.data.governmentIdEncrypted) {
            args.data.governmentIdEncrypted = VaultService.encrypt(args.data.governmentIdEncrypted, tenantId!, vaultSeed);
          }

          return query(args);
        },
        async update({ args, query }) {
          const store = dbContext.getStore();
          const tenantId = store?.tenantId;
          const vaultSeed = store?.vaultSeed;

          const data = args.data as any;
          
          // Solo bloquear si se están actualizando campos sensibles Y no hay vaultSeed
          const hasSensitiveFields = data.salaryEncrypted || data.bankDetailsEncrypted || data.governmentIdEncrypted;
          
          if (hasSensitiveFields && !vaultSeed) {
            console.error(`[Vault Extension] ERROR CRÍTICO: Bloqueada actualización de datos sensibles en Employee para tenant ${tenantId}. vaultSeed ausente.`);
            throw new Error('SECURITY_VIOLATION: No se puede actualizar información sensible sin una semilla de cifrado válida (vaultSeed).');
          }

          if (vaultSeed) {
            if (data.salaryEncrypted) {
              data.salaryEncrypted = VaultService.encrypt(data.salaryEncrypted, tenantId!, vaultSeed);
            }
            if (data.bankDetailsEncrypted) {
              data.bankDetailsEncrypted = VaultService.encrypt(data.bankDetailsEncrypted, tenantId!, vaultSeed);
            }
            if (data.governmentIdEncrypted) {
              data.governmentIdEncrypted = VaultService.encrypt(data.governmentIdEncrypted, tenantId!, vaultSeed);
            }
          }

          return query(args);
        }
      },
      payrollRecord: {
        async create({ args, query }) {
          const store = dbContext.getStore();
          const tenantId = store?.tenantId;
          const vaultSeed = store?.vaultSeed;

          if (!vaultSeed) {
            throw new Error('SECURITY_VIOLATION: No se puede guardar nóminas sin una semilla de cifrado válida.');
          }

          if (args.data.amountEncrypted) {
            args.data.amountEncrypted = VaultService.encrypt(args.data.amountEncrypted, tenantId!, vaultSeed);
          }

          return query(args);
        },
        async update({ args, query }) {
          const store = dbContext.getStore();
          const tenantId = store?.tenantId;
          const vaultSeed = store?.vaultSeed;

          if (!vaultSeed) {
            throw new Error('SECURITY_VIOLATION: No se puede actualizar nóminas sin una semilla de cifrado válida.');
          }

          const data = args.data as any;
          if (data.amountEncrypted) {
            data.amountEncrypted = VaultService.encrypt(data.amountEncrypted, tenantId!, vaultSeed);
          }

          return query(args);
        }
      }
    },
    result: {
      employee: {
        salary: {
          needs: { salaryEncrypted: true, tenantId: true },
          compute(employee) {
            const store = dbContext.getStore();
            const vaultSeed = store?.vaultSeed;
            if (!employee.salaryEncrypted || !vaultSeed) return null;
            return VaultService.decrypt(employee.salaryEncrypted!, employee.tenantId, vaultSeed);
          }
        },
        bankDetails: {
          needs: { bankDetailsEncrypted: true, tenantId: true },
          compute(employee) {
            const store = dbContext.getStore();
            const vaultSeed = store?.vaultSeed;
            if (!employee.bankDetailsEncrypted || !vaultSeed) return null;
            return VaultService.decrypt(employee.bankDetailsEncrypted!, employee.tenantId, vaultSeed);
          }
        },
        governmentId: {
          needs: { governmentIdEncrypted: true, tenantId: true },
          compute(employee) {
            const store = dbContext.getStore();
            const vaultSeed = store?.vaultSeed;
            if (!employee.governmentIdEncrypted || !vaultSeed) return null;
            return VaultService.decrypt(employee.governmentIdEncrypted!, employee.tenantId, vaultSeed);
          }
        }
      },
      payrollRecord: {
        amount: {
          needs: { amountEncrypted: true, tenantId: true },
          compute(payroll) {
            const store = dbContext.getStore();
            const vaultSeed = store?.vaultSeed;
            if (!payroll.amountEncrypted || !vaultSeed) return null;
            return VaultService.decrypt(payroll.amountEncrypted!, payroll.tenantId, vaultSeed);
          }
        }
      }
    }
  });
});
