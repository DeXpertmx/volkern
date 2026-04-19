import { prisma } from '../../db';

export class AutomationVersionService {
  /**
   * Crea un snapshot de la versión actual de una regla.
   */
  static async createSnapshot(ruleId: string, tenantId: string, userId?: string) {
    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId, tenantId }
    });

    if (!rule) throw new Error('Rule not found');

    const lastVersion = await prisma.automationRuleVersion.findFirst({
      where: { ruleId, tenantId },
      orderBy: { version: 'desc' }
    });

    const nextVersion = (lastVersion?.version || 0) + 1;

    return await prisma.automationRuleVersion.create({
      data: {
        ruleId,
        tenantId,
        version: nextVersion,
        config: {
          conditions: rule.conditions,
          actions: rule.actions,
          name: rule.name,
          triggerType: rule.triggerType
        },
        createdBy: userId
      }
    });
  }

  /**
   * Revierte una regla a una versión específica.
   */
  static async rollback(ruleId: string, versionId: string, tenantId: string) {
    const snapshot = await prisma.automationRuleVersion.findUnique({
      where: { id: versionId, ruleId, tenantId }
    });

    if (!snapshot) throw new Error('Snapshot not found');

    const config = snapshot.config as any;

    return await prisma.automationRule.update({
      where: { id: ruleId, tenantId },
      data: {
        conditions: config.conditions,
        actions: config.actions,
        name: config.name,
        triggerType: config.triggerType
      }
    });
  }
}
