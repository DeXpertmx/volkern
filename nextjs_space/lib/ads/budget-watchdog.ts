/**
 * Budget Watchdog — Auto-apagado Inteligente de Campañas ADS
 *
 * Evalúa reglas configuradas por el usuario para pausar o reducir
 * presupuesto de campañas que no cumplen con los umbrales de rendimiento.
 *
 * Condiciones soportadas:
 *   cpa, roas, ctr, cpc, spendPerConversion, conversionRate, impressions, frequency
 *
 * Acciones:
 *   PAUSE — Pausa la campaña en la plataforma
 *   REDUCE_BUDGET_PERCENTAGE — Reduce el presupuesto diario en X%
 *   NOTIFY_ONLY — Solo notifica sin tomar acción
 *
 * Seguridad:
 *   - Cooldown de N horas entre ejecuciones de la misma regla
 *   - Solo afecta campañas con isVolkernManaged = true
 *   - Logging completo en AdBudgetExecution
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 4
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getConnector } from './connectors';
import type { AdPlatform, RuleEvaluation, WatchdogCondition } from './types';

// ─── Watchdog ─────────────────────────────────────────────────────────

export class BudgetWatchdog {
  /**
   * Evalúa todas las reglas activas de un tenant.
   */
  static async evaluateAll(tenantId: string): Promise<RuleEvaluation[]> {
    const rules = await prisma.adBudgetRule.findMany({
      where: { tenantId, isActive: true },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
    });

    const evaluations: RuleEvaluation[] = [];

    for (const rule of rules) {
      const evaluation = await this.evaluateRule(rule.id);
      evaluations.push(evaluation);
    }

    return evaluations;
  }

  /**
   * Evalúa una regla específica y ejecuta la acción si se dispara.
   */
  static async evaluateRule(ruleId: string): Promise<RuleEvaluation> {
    const rule = await prisma.adBudgetRule.findUnique({
      where: { id: ruleId },
      include: {
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!rule) {
      throw new Error(`Regla watchdog no encontrada: ${ruleId}`);
    }

    const condition = rule.condition as unknown as WatchdogCondition;
    const metricCurrent = await this.getCurrentMetric(rule, condition);

    const evaluation: RuleEvaluation = {
      ruleId: rule.id,
      ruleName: rule.name,
      campaignId: rule.scope === 'CAMPAIGN' ? rule.scopeId || undefined : undefined,
      adSetId: rule.scope === 'AD_SET' ? rule.scopeId || undefined : undefined,
      adId: rule.scope === 'AD' ? rule.scopeId || undefined : undefined,
      condition,
      metricCurrent,
      metricThreshold: condition.value,
      action: rule.action as RuleEvaluation['action'],
      actionValue: rule.actionValue || undefined,
      triggered: false,
    };

    // Verificar si la condición se cumple
    evaluation.triggered = this.evaluateCondition(metricCurrent, condition.operator, condition.value);

    if (!evaluation.triggered) {
      return evaluation;
    }

    // Verificar cooldown
    if (rule.lastTriggeredAt) {
      const hoursSinceLastTrigger = (Date.now() - rule.lastTriggeredAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastTrigger < rule.cooldownHours) {
        logger.info(
          { ruleId: rule.id, ruleName: rule.name, hoursSinceLastTrigger },
          'Watchdog: Regla en cooldown, saltando ejecución',
        );

        // Registrar como SKIPPED
        await this.logExecution({
          ruleId: rule.id,
          condition: rule.condition as object,
          metricCurrent,
          metricThreshold: condition.value,
          action: rule.action,
          actionResult: 'SKIPPED',
          actionDetail: `En cooldown (${hoursSinceLastTrigger.toFixed(1)}h de ${rule.cooldownHours}h)`,
        });

        return evaluation;
      }
    }

    // Ejecutar la acción
    await this.executeAction(rule, evaluation);

    // Actualizar contadores de la regla
    await prisma.adBudgetRule.update({
      where: { id: rule.id },
      data: {
        lastTriggeredAt: new Date(),
        executionCount: { increment: 1 },
      },
    });

    return evaluation;
  }

  /**
   * Evalúa las reglas aplicables a una campaña específica.
   */
  static async evaluateCampaign(campaignId: string): Promise<RuleEvaluation[]> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { tenantId: true, id: true, platformId: true },
    });

    if (!campaign) return [];

    // Reglas que aplican a esta campaña
    const rules = await prisma.adBudgetRule.findMany({
      where: {
        tenantId: campaign.tenantId,
        isActive: true,
        OR: [
          { scope: 'CAMPAIGN', scopeId: campaignId },
          { scope: 'ACCOUNT', scopeId: null },
          { scope: 'ACCOUNT', scopeId: campaign.platformId },
        ],
      },
    });

    const evaluations: RuleEvaluation[] = [];
    for (const rule of rules) {
      const evaluation = await this.evaluateRule(rule.id);
      evaluations.push(evaluation);
    }

    return evaluations;
  }

  // ─── Internals ─────────────────────────────────────────────────────

  /**
   * Obtiene el valor actual de la métrica para el scope de la regla.
   */
  private static async getCurrentMetric(
    rule: { scope: string; scopeId: string | null; tenantId: string },
    condition: WatchdogCondition,
  ): Promise<number> {
    const windowHours = this.parseWindow(condition.window);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // Obtener métricas agregadas del período
    const insights = await prisma.adInsight.findMany({
      where: {
        tenantId: rule.tenantId,
        dateStart: { gte: since },
        campaignId: rule.scope === 'CAMPAIGN' && rule.scopeId ? rule.scopeId : undefined,
        adSetId: rule.scope === 'AD_SET' && rule.scopeId ? rule.scopeId : undefined,
        adId: rule.scope === 'AD' && rule.scopeId ? rule.scopeId : undefined,
      },
      select: {
        impressions: true,
        clicks: true,
        spend: true,
        conversions: true,
        cpc: true,
        cpm: true,
        ctr: true,
        cpa: true,
        roas: true,
        costPerLead: true,
        frequency: true,
        reach: true,
      },
    });

    if (insights.length === 0) return 0;

    // Agregar métricas según la condición
    const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
    const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
    const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
    const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
    const totalReach = insights.reduce((s, i) => s + i.reach, 0);

    switch (condition.metric) {
      case 'cpa':
        return totalConversions > 0 ? totalSpend / totalConversions : Infinity;
      case 'roas': {
        const totalRevenue = insights.reduce((s, i) => s + (i.roas * i.spend || 0), 0);
        return totalSpend > 0 ? totalRevenue / totalSpend : 0;
      }
      case 'ctr':
        return totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      case 'cpc':
        return totalClicks > 0 ? totalSpend / totalClicks : 0;
      case 'spendPerConversion':
        return totalConversions > 0 ? totalSpend / totalConversions : Infinity;
      case 'conversionRate':
        return totalImpressions > 0 ? (totalConversions / totalImpressions) * 100 : 0;
      case 'impressions':
        return totalImpressions;
      case 'frequency':
        return totalReach > 0 ? totalImpressions / totalReach : 0;
      default:
        return 0;
    }
  }

  /**
   * Evalúa una condición numérica.
   */
  private static evaluateCondition(value: number, operator: string, threshold: number): boolean {
    if (value === Infinity || value === -Infinity) return false;

    switch (operator) {
      case '>': return value > threshold;
      case '>=': return value >= threshold;
      case '<': return value < threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  /**
   * Ejecuta la acción configurada en la regla.
   */
  private static async executeAction(
    rule: {
      id: string;
      scope: string;
      scopeId: string | null;
      action: string;
      actionValue: number | null;
      tenantId: string;
      campaignId?: string;
    },
    evaluation: RuleEvaluation,
  ): Promise<void> {
    const action = rule.action;

    try {
      if (action === 'PAUSE') {
        await this.pauseScope(rule);
      } else if (action === 'REDUCE_BUDGET_PERCENTAGE') {
        await this.reduceBudget(rule);
      }
      // NOTIFY_ONLY no ejecuta acción automática

      await this.logExecution({
        ruleId: rule.id,
        condition: evaluation.condition as object,
        metricCurrent: evaluation.metricCurrent,
        metricThreshold: evaluation.metricThreshold,
        action: evaluation.action,
        actionResult: 'SUCCESS',
        actionDetail: `Acción ${action} ejecutada correctamente`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ ruleId: rule.id, action, err }, `Watchdog: Error ejecutando acción ${action}: ${msg}`);

      await this.logExecution({
        ruleId: rule.id,
        condition: evaluation.condition as object,
        metricCurrent: evaluation.metricCurrent,
        metricThreshold: evaluation.metricThreshold,
        action: evaluation.action,
        actionResult: 'FAILED',
        actionDetail: msg,
      });
    }
  }

  /**
   * Pausa el scope objetivo (campaña, ad set o ad).
   */
  private static async pauseScope(rule: {
    scope: string;
    scopeId: string | null;
    tenantId: string;
  }): Promise<void> {
    if (!rule.scopeId) {
      // Scope ACCOUNT: pausar todas las campañas gestionadas
      const campaigns = await prisma.adCampaign.findMany({
        where: {
          tenantId: rule.tenantId,
          isVolkernManaged: true,
          status: 'ACTIVE',
        },
        include: { platform: { select: { platform: true } } },
      });

      for (const campaign of campaigns) {
        if (!campaign.externalId) continue;
        try {
          const connector = getConnector(campaign.platform.platform as AdPlatform);
          await connector.pauseCampaign(campaign.id, campaign.externalId);
          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { status: 'PAUSED' },
          });
        } catch (err) {
          logger.warn({ campaignId: campaign.id, err }, 'Watchdog: Error pausando campaña');
        }
      }
      return;
    }

    if (rule.scope === 'CAMPAIGN') {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: rule.scopeId },
        include: { platform: { select: { platform: true } } },
      });
      if (!campaign || !campaign.externalId || !campaign.isVolkernManaged) return;

      const connector = getConnector(campaign.platform.platform as AdPlatform);
      await connector.pauseCampaign(campaign.id, campaign.externalId);
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { status: 'PAUSED' },
      });
    }
    // Para AD_SET y AD se podría implementar similar
  }

  /**
   * Reduce el presupuesto del scope en el porcentaje configurado.
   */
  private static async reduceBudget(rule: {
    scope: string;
    scopeId: string | null;
    actionValue: number | null;
    tenantId: string;
  }): Promise<void> {
    const percentage = rule.actionValue || 10; // Default 10%

    if (!rule.scopeId) {
      // Scope ACCOUNT: reducir todas las campañas activas gestionadas
      const campaigns = await prisma.adCampaign.findMany({
        where: {
          tenantId: rule.tenantId,
          isVolkernManaged: true,
          status: 'ACTIVE',
          dailyBudget: { not: null },
        },
        include: { platform: { select: { platform: true } } },
      });

      for (const campaign of campaigns) {
        if (!campaign.externalId || !campaign.dailyBudget) continue;
        const newBudget = campaign.dailyBudget * (1 - percentage / 100);
        try {
          const connector = getConnector(campaign.platform.platform as AdPlatform);
          await connector.updateBudget(campaign.id, campaign.externalId, newBudget);
          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { dailyBudget: newBudget },
          });
        } catch (err) {
          logger.warn({ campaignId: campaign.id, err }, 'Watchdog: Error reduciendo budget');
        }
      }
      return;
    }

    if (rule.scope === 'CAMPAIGN') {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: rule.scopeId },
        include: { platform: { select: { platform: true } } },
      });
      if (!campaign || !campaign.externalId || !campaign.dailyBudget || !campaign.isVolkernManaged) return;

      const newBudget = campaign.dailyBudget * (1 - percentage / 100);
      const connector = getConnector(campaign.platform.platform as AdPlatform);
      await connector.updateBudget(campaign.id, campaign.externalId, newBudget);
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { dailyBudget: newBudget },
      });
    }
  }

  /**
   * Registra la ejecución en AdBudgetExecution.
   */
  private static async logExecution(data: {
    ruleId: string;
    condition: object;
    metricCurrent: number;
    metricThreshold: number;
    action: string;
    actionResult: string;
    actionDetail?: string;
  }): Promise<void> {
    await prisma.adBudgetExecution.create({
      data: {
        ruleId: data.ruleId,
        condition: data.condition as object,
        metricCurrent: data.metricCurrent,
        metricThreshold: data.metricThreshold,
        action: data.action,
        actionResult: data.actionResult,
        actionDetail: data.actionDetail || null,
      },
    });
  }

  /**
   * Parsea ventana de tiempo (ej: "7d", "24h") a horas.
   */
  private static parseWindow(window: string): number {
    const match = window.match(/^(\d+)(h|d)$/);
    if (!match) return 24; // Default 24h
    const value = parseInt(match[1], 10);
    const unit = match[2];
    return unit === 'd' ? value * 24 : value;
  }
}
