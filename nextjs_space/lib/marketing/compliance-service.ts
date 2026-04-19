import { prisma } from '../db';

export class MarketingComplianceService {
  /**
   * Verifica si un email está en la lista de exclusión global del tenant.
   */
  static async isSuppressed(tenantId: string, email: string): Promise<boolean> {
    const suppression = await prisma.marketingSuppression.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email: email.toLowerCase()
        }
      }
    });
    return !!suppression;
  }

  /**
   * Registra una baja global (Unsubscribe).
   */
  static async unsubscribe(tenantId: string, email: string, reason?: string, source: string = 'UNSUBSCRIBE_LINK') {
    return await prisma.marketingSuppression.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.toLowerCase()
        }
      },
      update: {
        reason,
        source
      },
      create: {
        tenantId,
        email: email.toLowerCase(),
        reason,
        source
      }
    });
  }

  /**
   * Valida una lista de recipientes contra la lista de exclusión.
   */
  static async filterSuppressed(tenantId: string, emails: string[]): Promise<string[]> {
    const suppressions = await prisma.marketingSuppression.findMany({
      where: {
        tenantId,
        email: { in: emails.map(e => e.toLowerCase()) }
      },
      select: { email: true }
    });
    
    const suppressedSet = new Set(suppressions.map(s => s.email.toLowerCase()));
    return emails.filter(email => !suppressedSet.has(email.toLowerCase()));
  }
}
