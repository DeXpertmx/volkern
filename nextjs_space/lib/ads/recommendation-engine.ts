/**
 * Recommendation Engine — Recomendaciones con IA para ADS Intelligence
 *
 * Genera recomendaciones accionables para optimizar campanas publicitarias
 * basandose en datos historicos (30-90 dias), analisis de audiencia,
 * rendimiento creativo y eficiencia presupuestaria.
 *
 * Tipos de recomendaciones:
 *   BUDGET     — Ajuste de presupuesto basado en ROAS/CPA vs historico
 *   TARGETING  — Optimizacion de segmentacion basada en leads convertidos
 *   CREATIVE   — Comparacion de CTR por tipo creativo y A/B testing
 *   BID        — Eficiencia de estrategia de puja
 *   SCHEDULE   — Analisis de tasa de conversion por hora/dia
 *   PLATFORM   — Comparacion de ROAS entre plataformas
 *
 * Para recomendaciones complejas usa gemini-3.5-flash-lite (Google AI).
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 5
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { getConnector } from './connectors';
import type {
  AdPlatform,
  RecommendationResult,
  BudgetAllocationSuggestion,
} from './types';

// ─── Constantes ───────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const RECOMMENDATION_WINDOW_DAYS = 90;
const MIN_DATA_DAYS = 30;

// ─── Interfaces internas ──────────────────────────────────────────────

interface AggregatedMetric {
  totalImpressions: number;
  totalClicks: number;
  totalSpend: number;
  totalConversions: number;
  totalRevenue: number;
  totalLeads: number;
  avgCpc: number;
  avgCpm: number;
  avgCtr: number;
  avgCpa: number;
  avgRoas: number;
  avgConversionRate: number;
  totalReach: number;
}

interface CampaignMetric {
  campaignId: string;
  campaignName: string;
  platform: string;
  dailyBudget: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  cpa: number;
  roas: number;
  ctr: number;
  cpc: number;
}

interface AIRecommendationPayload {
  type: string;
  title: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  metric: string;
  currentValue: number;
  projectedValue: number;
  implementation?: Record<string, unknown>;
}

// ─── Recommendation Engine ────────────────────────────────────────────

export class RecommendationEngine {
  /**
   * Genera todos los tipos de recomendaciones para un tenant.
   * Ejecuta cada generador y retorna hasta 6 recomendaciones.
   */
  static async generateAll(tenantId: string): Promise<RecommendationResult[]> {
    logger.info({ tenantId }, 'RecommendationEngine: Generando todas las recomendaciones');

    const results: RecommendationResult[] = [];

    try {
      const generators: Array<() => Promise<RecommendationResult | null>> = [
        () => this.generateBudgetRecommendation(tenantId),
        () => this.generateTargetingRecommendation(tenantId),
        () => this.generateCreativeRecommendation(tenantId),
        () => this.generateBidRecommendation(tenantId),
        () => this.generateScheduleRecommendation(tenantId),
        () => this.generatePlatformRecommendation(tenantId),
      ];

      const outcomes = await Promise.allSettled(generators.map((g) => g()));

      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled' && outcome.value) {
          results.push(outcome.value);
        }
      }

      logger.info(
        { tenantId, count: results.length },
        'RecommendationEngine: Recomendaciones generadas',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ tenantId, err }, 'RecommendationEngine: Error generando recomendaciones: ' + msg);
    }

    return results;
  }

  /**
   * Genera recomendaciones especificas para una campana.
   */
  static async generateCampaignRecommendations(campaignId: string): Promise<RecommendationResult[]> {
    logger.info({ campaignId }, 'RecommendationEngine: Generando recomendaciones para campana');

    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { tenantId: true, name: true, platform: { select: { platform: true } } },
    });

    if (!campaign) {
      logger.warn({ campaignId }, 'RecommendationEngine: Campana no encontrada');
      return [];
    }

    const results: RecommendationResult[] = [];

    try {
      const generators: Array<() => Promise<RecommendationResult | null>> = [
        () => this.generateCampaignBudgetRecommendation(campaignId, campaign.tenantId),
        () => this.generateCampaignBidRecommendation(campaignId, campaign.tenantId),
        () => this.generateCampaignScheduleRecommendation(campaignId, campaign.tenantId),
      ];

      const outcomes = await Promise.allSettled(generators.map((g) => g()));

      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled' && outcome.value) {
          results.push(outcome.value);
        }
      }

      // Para TARGETING y CREATIVE usamos IA si hay datos suficientes
      if (campaign.platform?.platform) {
        const aiResult = await this.callAIForCampaign(
          campaignId,
          campaign.tenantId,
          campaign.platform.platform as AdPlatform,
        );
        if (aiResult) {
          results.push(aiResult);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ campaignId, err }, 'RecommendationEngine: Error en campana: ' + msg);
    }

    return results;
  }

  /**
   * Genera sugerencias de distribucion de presupuesto entre campanas
   * basadas en ROAS historico. Si totalBudget se proporciona, lo distribuye;
   * si no, sugiere reasignacion del presupuesto existente.
   */
  static async generateBudgetAllocation(
    tenantId: string,
    totalBudget?: number,
  ): Promise<BudgetAllocationSuggestion[]> {
    logger.info({ tenantId, totalBudget }, 'RecommendationEngine: Generando asignacion de presupuesto');

    const suggestions: BudgetAllocationSuggestion[] = [];

    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

      // Obtener campanas activas con metricas agregadas
      const campaigns = await prisma.adCampaign.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          isVolkernManaged: true,
        },
        select: {
          id: true,
          name: true,
          dailyBudget: true,
          adInsights: {
            where: { dateStart: { gte: dateFrom } },
            select: { spend: true, conversions: true, revenue: true, roas: true, impressions: true, clicks: true },
          },
        },
      });

      if (campaigns.length === 0) {
        logger.info({ tenantId }, 'RecommendationEngine: No hay campanas activas para asignar presupuesto');
        return suggestions;
      }

      // Calcular ROAS historico por campana
      const campaignMetrics: Array<{
        id: string;
        name: string;
        budget: number;
        roas: number;
        spend: number;
        conversions: number;
      }> = [];

      let totalSpend = 0;
      let totalConversions = 0;
      let totalRevenue = 0;

      for (const campaign of campaigns) {
        const spend = campaign.adInsights.reduce((s, i) => s + i.spend, 0);
        const revenue = campaign.adInsights.reduce((s, i) => s + i.revenue, 0);
        const conversions = campaign.adInsights.reduce((s, i) => s + i.conversions, 0);
        const roas = spend > 0 ? revenue / spend : 0;

        campaignMetrics.push({
          id: campaign.id,
          name: campaign.name,
          budget: campaign.dailyBudget || 0,
          roas,
          spend,
          conversions,
        });

        totalSpend += spend;
        totalConversions += conversions;
        totalRevenue += revenue;
      }

      if (totalSpend === 0) {
        logger.info({ tenantId }, 'RecommendationEngine: Sin datos de gasto para asignacion');
        return suggestions;
      }

      // Si no hay totalBudget, sumamos los budgets actuales
      const budgetToDistribute = totalBudget ?? campaigns.reduce((s, c) => s + (c.dailyBudget || 0), 0);

      if (budgetToDistribute <= 0) {
        logger.info({ tenantId }, 'RecommendationEngine: Presupuesto total es 0');
        return suggestions;
      }

      // Distribuir presupuesto proporcional al ROAS ajustado por confianza
      const totalWeightedRoas = campaignMetrics.reduce(
        (sum, m) => sum + Math.max(0, m.roas) * (m.spend > 0 ? Math.min(1, m.spend / totalSpend + 0.5) : 0.1),
        0,
      );

      for (const metric of campaignMetrics) {
        const weight = totalWeightedRoas > 0 ? Math.max(0, metric.roas) : 0;
        const confidenceWeight = metric.spend > 0 ? Math.min(1, metric.spend / totalSpend + 0.5) : 0.1;
        const normalizedWeight = totalWeightedRoas > 0
          ? (weight * confidenceWeight) / totalWeightedRoas
          : 1 / campaignMetrics.length;

        const suggestedBudget = Math.round(budgetToDistribute * normalizedWeight * 100) / 100;

        suggestions.push({
          campaignId: metric.id,
          campaignName: metric.name,
          currentBudget: metric.budget,
          suggestedBudget,
          reason: this.buildBudgetAllocationReason(metric.roas, metric.conversions, metric.spend),
          projectedRoas: metric.roas > 0 ? metric.roas : 0.5,
        });
      }

      // Ordenar por suggestedBudget descendente
      suggestions.sort((a, b) => b.suggestedBudget - a.suggestedBudget);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ tenantId, err }, 'RecommendationEngine: Error generando asignacion: ' + msg);
    }

    return suggestions;
  }

  /**
   * Guarda una recomendacion en la base de datos (AdRecommendation).
   */
  static async saveRecommendation(
    result: RecommendationResult,
    tenantId: string,
    campaignId?: string,
  ): Promise<void> {
    try {
      await prisma.adRecommendation.create({
        data: {
          tenantId,
          campaignId: campaignId || null,
          type: result.type,
          title: result.title,
          description: result.description,
          impact: result.impact,
          confidence: result.confidence,
          metric: result.metric,
          projectedValue: result.projectedValue,
          currentValue: result.currentValue,
          implementation: result.implementation ? JSON.parse(JSON.stringify(result.implementation)) : undefined,
        },
      });

      logger.info(
        { tenantId, campaignId, type: result.type, title: result.title },
        'RecommendationEngine: Recomendacion guardada',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ tenantId, err }, 'RecommendationEngine: Error guardando recomendacion: ' + msg);
      throw err;
    }
  }

  /**
   * Aplica una recomendacion (ej: cambia presupuesto via connector, pausa campana, etc.)
   * Retorna true si se aplico exitosamente.
   */
  static async applyRecommendation(recommendationId: string): Promise<boolean> {
    logger.info({ recommendationId }, 'RecommendationEngine: Aplicando recomendacion');

    try {
      const recommendation = await prisma.adRecommendation.findUnique({
        where: { id: recommendationId },
      });

      if (!recommendation) {
        logger.warn({ recommendationId }, 'RecommendationEngine: Recomendacion no encontrada');
        return false;
      }

      if (recommendation.isApplied) {
        logger.warn({ recommendationId }, 'RecommendationEngine: Recomendacion ya aplicada');
        return false;
      }

      if (recommendation.isDismissed) {
        logger.warn({ recommendationId }, 'RecommendationEngine: Recomendacion descartada');
        return false;
      }

      const impl = recommendation.implementation as Record<string, unknown> | null;

      switch (recommendation.type) {
        case 'BUDGET': {
          if (!recommendation.campaignId || !impl?.budgetChange) {
            logger.warn({ recommendationId }, 'RecommendationEngine: Faltan datos para aplicar BUDGET');
            return false;
          }

          const campaign = await prisma.adCampaign.findUnique({
            where: { id: recommendation.campaignId },
            include: { platform: { select: { platform: true } } },
          });

          if (!campaign || !campaign.externalId) {
            logger.warn(
              { recommendationId, campaignId: recommendation.campaignId },
              'RecommendationEngine: Campana sin externalId',
            );
            return false;
          }

          const budgetChange = impl.budgetChange as number;
          const newBudget = Math.max(1, (campaign.dailyBudget || 0) + budgetChange);

          const connector = getConnector(campaign.platform.platform as AdPlatform);
          await connector.updateBudget(campaign.id, campaign.externalId, newBudget);

          await prisma.adCampaign.update({
            where: { id: campaign.id },
            data: { dailyBudget: newBudget },
          });

          break;
        }

        case 'BID': {
          if (!recommendation.campaignId || !impl?.bidStrategy || !impl?.bidAmount) {
            logger.warn({ recommendationId }, 'RecommendationEngine: Faltan datos para aplicar BID');
            return false;
          }

          await prisma.adCampaign.update({
            where: { id: recommendation.campaignId },
            data: {
              bidStrategy: impl.bidStrategy as string,
              bidAmount: impl.bidAmount as number,
            },
          });

          break;
        }

        case 'TARGETING':
        case 'CREATIVE':
        case 'SCHEDULE':
        case 'PLATFORM': {
          logger.info(
            { recommendationId, type: recommendation.type },
            'RecommendationEngine: Marcada como aplicada (sin accion automatica)',
          );
          break;
        }

        default:
          logger.warn(
            { recommendationId, type: recommendation.type },
            'RecommendationEngine: Tipo desconocido',
          );
          return false;
      }

      await prisma.adRecommendation.update({
        where: { id: recommendationId },
        data: { isApplied: true, appliedAt: new Date() },
      });

      logger.info({ recommendationId }, 'RecommendationEngine: Recomendacion aplicada exitosamente');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ recommendationId, err }, 'RecommendationEngine: Error aplicando: ' + msg);
      return false;
    }
  }

  // ─── Generadores internos de recomendaciones ──────────────────────

  /**
   * BUDGET: Compara ROAS/CPA vs promedio historico por campana.
   * Sugiere incrementar presupuesto si ROAS > umbral o reducirlo si CPA > umbral.
   */
  private static async generateBudgetRecommendation(tenantId: string): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const campaigns = await prisma.adCampaign.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        dailyBudget: true,
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { spend: true, conversions: true, revenue: true, roas: true, cpa: true },
        },
      },
    });

    if (campaigns.length === 0) return null;

    const metrics: Array<{ id: string; name: string; budget: number; roas: number; cpa: number; spend: number; conversions: number }> = [];

    for (const c of campaigns) {
      const spend = c.adInsights.reduce((s, i) => s + i.spend, 0);
      const conversions = c.adInsights.reduce((s, i) => s + i.conversions, 0);
      const revenue = c.adInsights.reduce((s, i) => s + i.revenue, 0);
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = conversions > 0 ? spend / conversions : 0;
      metrics.push({ id: c.id, name: c.name, budget: c.dailyBudget || 0, roas, cpa, spend, conversions });
    }

    const avgRoas = metrics.reduce((s, m) => s + m.roas, 0) / metrics.length;

    const bestCandidate = metrics
      .filter((m) => m.roas > avgRoas && m.spend > 0)
      .sort((a, b) => b.roas - a.roas)[0];

    const worstCandidate = metrics
      .filter((m) => m.roas > 0 && m.roas < avgRoas && m.spend > 0)
      .sort((a, b) => a.roas - b.roas)[0];

    if (!bestCandidate && !worstCandidate) return null;

    // Si hay un candidato con buen ROAS pero baja inversion, sugerir aumentarlo
    if (bestCandidate && bestCandidate.roas >= 2.0) {
      const budgetIncrease = Math.round(bestCandidate.budget * 0.2 * 100) / 100; // +20%
      return {
        type: 'BUDGET',
        title: 'Incrementar presupuesto - ' + bestCandidate.name,
        description: 'Esta campana tiene un ROAS de ' + bestCandidate.roas.toFixed(2) + 'x, superior al promedio de ' + avgRoas.toFixed(2) + 'x. '
          + 'Incrementar su presupuesto en 20% podria generar mas conversiones manteniendo rentabilidad.',
        impact: 'HIGH',
        confidence: Math.min(0.85, 0.5 + bestCandidate.conversions * 0.01),
        metric: 'roas',
        projectedValue: bestCandidate.roas * 0.95, // Ligera dilution esperada
        currentValue: bestCandidate.roas,
        implementation: { budgetChange: budgetIncrease, type: 'INCREASE' },
      };
    }

    // Si hay un candidato con bajo rendimiento, sugerir reducir presupuesto
    if (worstCandidate && worstCandidate.roas < 1.0) {
      const budgetReduction = Math.round(worstCandidate.budget * 0.3 * 100) / 100; // -30%
      return {
        type: 'BUDGET',
        title: 'Reducir presupuesto - ' + worstCandidate.name,
        description: 'La campana tiene un ROAS de ' + worstCandidate.roas.toFixed(2) + 'x, por debajo del promedio. '
          + 'Reducir su presupuesto en 30% y reasignar a campanas con mejor rendimiento.',
        impact: 'MEDIUM',
        confidence: Math.min(0.8, 0.4 + worstCandidate.conversions * 0.01),
        metric: 'roas',
        projectedValue: worstCandidate.roas * 1.1, // Mejora marginal esperada por reduccion de gasto ineficiente
        currentValue: worstCandidate.roas,
        implementation: { budgetChange: -budgetReduction, type: 'REDUCE' },
      };
    }

    // Si hay un buen candidato pero no excelente, sugerencia media
    if (bestCandidate) {
      const budgetIncrease = Math.round(bestCandidate.budget * 0.15 * 100) / 100;
      return {
        type: 'BUDGET',
        title: 'Ajuste de presupuesto - ' + bestCandidate.name,
        description: 'ROAS de ' + bestCandidate.roas.toFixed(2) + 'x (' + (bestCandidate.roas > avgRoas ? 'superior' : 'inferior') + ' al promedio). '
          + 'Se recomienda ajustar presupuesto para optimizar el gasto.',
        impact: 'LOW',
        confidence: 0.5,
        metric: 'roas',
        projectedValue: bestCandidate.roas,
        currentValue: avgRoas,
        implementation: { budgetChange: budgetIncrease, type: 'INCREASE' },
      };
    }

    return null;
  }

  /**
   * TARGETING: Analiza leads convertidos vs audiencia actual.
   * Usa IA para sugerir optimizaciones de segmentacion.
   */
  private static async generateTargetingRecommendation(tenantId: string): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    // Obtener leads generados en el periodo
    const leads = await prisma.lead.findMany({
      where: {
        tenantId: tenantId as string,
        createdAt: { gte: dateFrom },
      } as Prisma.LeadWhereInput,
      select: {
        id: true,
        fuente: true,
        metadataExterna: true,
      },
    });

    if (leads.length < 5) return null;

    // Obtener insights del periodo para analizar audiencia
    const insights = await prisma.adInsight.findMany({
      where: { tenantId, dateStart: { gte: dateFrom } },
      select: { impressions: true, clicks: true, conversions: true, spend: true, leads: true },
    });

    if (insights.length === 0) return null;

    const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
    const totalLeads = insights.reduce((s, i) => s + i.leads, 0);
    const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);

    // Analizar fuentes de leads
    const sourceCount: Record<string, number> = {};
    for (const lead of leads) {
      const source = (lead as any).source || 'unknown';
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    }

    const topSource = Object.entries(sourceCount).sort((a, b) => b[1] - a[1])[0];

    if (!topSource) return null;

    return {
      type: 'TARGETING',
      title: 'Optimizar segmentacion - ' + topSource[0],
      description: 'Se generaron ' + totalLeads + ' leads en los ultimos 90 dias. '
        + 'La fuente principal es "' + topSource[0] + '" con ' + topSource[1] + ' leads. '
        + 'Se recomienda crear audiencias similares (lookalike) basadas en leads convertidos para escalar.',
      impact: 'HIGH',
      confidence: Math.min(0.85, 0.3 + totalLeads * 0.001),
      metric: 'leads',
      projectedValue: totalLeads * 1.3,
      currentValue: totalLeads,
      implementation: { source: topSource[0], leadCount: topSource[1], totalLeads, totalConversions },
    };
  }

  /**
   * CREATIVE: Compara CTR por tipo creativo y sugiere A/B testing.
   */
  private static async generateCreativeRecommendation(tenantId: string): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const ads = await prisma.ad.findMany({
      where: {
        adSet: { campaign: { tenantId } },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        creativeType: true,
        headline: true,
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { impressions: true, clicks: true, ctr: true, conversions: true, spend: true },
        },
      },
    });

    if (ads.length === 0) return null;

    // Agrupar CTR por tipo creativo
    const ctrByType: Record<string, { impressions: number; clicks: number; conversions: number; spend: number; count: number }> = {};
    for (const ad of ads) {
      const type = ad.creativeType || 'UNKNOWN';
      if (!ctrByType[type]) ctrByType[type] = { impressions: 0, clicks: 0, conversions: 0, spend: 0, count: 0 };
      for (const insight of ad.adInsights) {
        ctrByType[type].impressions += insight.impressions;
        ctrByType[type].clicks += insight.clicks;
        ctrByType[type].conversions += insight.conversions;
        ctrByType[type].spend += insight.spend;
      }
      ctrByType[type].count += 1;
    }

    // Calcular CTR promedio por tipo
    const typePerformance = Object.entries(ctrByType)
      .map(([type, data]) => ({
        type,
        ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
        impressions: data.impressions,
        clicks: data.clicks,
        conversions: data.conversions,
        count: data.count,
      }))
      .filter((t) => t.impressions > 100)
      .sort((a, b) => b.ctr - a.ctr);

    if (typePerformance.length < 2) return null;

    const best = typePerformance[0];
    const worst = typePerformance[typePerformance.length - 1];

    if (best.ctr === worst.ctr) return null;

    return {
      type: 'CREATIVE',
      title: 'A/B testing - ' + best.type + ' vs ' + worst.type,
      description: 'Los anuncios de tipo "' + best.type + '" tienen un CTR de '
        + best.ctr.toFixed(2) + '% vs "' + worst.type + '" con ' + worst.ctr.toFixed(2) + '%. '
        + 'Se recomienda migrar creativos de bajo rendimiento al formato ' + best.type + ' '
        + 'y realizar pruebas A/B para validar.',
      impact: 'MEDIUM',
      confidence: Math.min(0.8, 0.3 + (best.impressions / (best.impressions + worst.impressions)) * 0.5),
      metric: 'ctr',
      projectedValue: best.ctr,
      currentValue: worst.ctr,
      implementation: { bestType: best.type, worstType: worst.type, bestCtr: best.ctr, worstCtr: worst.ctr },
    };
  }

  /**
   * BID: Compara eficiencia de estrategias de puja y sugiere cambios.
   */
  private static async generateBidRecommendation(tenantId: string): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const campaigns = await prisma.adCampaign.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        bidStrategy: true,
        bidAmount: true,
        dailyBudget: true,
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { spend: true, conversions: true, revenue: true, impressions: true, clicks: true, cpa: true, roas: true },
        },
      },
    });

    if (campaigns.length === 0) return null;

    // Analizar rendimiento por estrategia de puja
    const perfByStrategy: Record<string, { spend: number; conversions: number; revenue: number; impressions: number; clicks: number; count: number }> = {};

    for (const c of campaigns) {
      const strategy = c.bidStrategy || 'LOWEST_COST';
      if (!perfByStrategy[strategy]) {
        perfByStrategy[strategy] = { spend: 0, conversions: 0, revenue: 0, impressions: 0, clicks: 0, count: 0 };
      }
      for (const insight of c.adInsights) {
        perfByStrategy[strategy].spend += insight.spend;
        perfByStrategy[strategy].conversions += insight.conversions;
        perfByStrategy[strategy].revenue += insight.revenue;
        perfByStrategy[strategy].impressions += insight.impressions;
        perfByStrategy[strategy].clicks += insight.clicks;
      }
      perfByStrategy[strategy].count += 1;
    }

    const strategyMetrics = Object.entries(perfByStrategy)
      .map(([strategy, data]) => ({
        strategy,
        cpa: data.conversions > 0 ? data.spend / data.conversions : 0,
        roas: data.spend > 0 ? data.revenue / data.spend : 0,
        ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
        spend: data.spend,
        conversions: data.conversions,
        count: data.count,
      }))
      .filter((s) => s.conversions > 0)
      .sort((a, b) => b.roas - a.roas);

    if (strategyMetrics.length < 2) return null;

    const best = strategyMetrics[0];
    const worst = strategyMetrics[strategyMetrics.length - 1];

    // Buscar campanas usando la peor estrategia
    const campaignsUsingWorst = campaigns
      .filter((c) => (c.bidStrategy || 'LOWEST_COST') === worst.strategy)
      .slice(0, 3);

    if (campaignsUsingWorst.length === 0) return null;

    return {
      type: 'BID',
      title: 'Cambiar estrategia de puja a ' + best.strategy,
      description: 'Las campanas con estrategia "' + worst.strategy + '" tienen ROAS de '
        + worst.roas.toFixed(2) + 'x vs "' + best.strategy + '" con ' + best.roas.toFixed(2) + 'x. '
        + 'Se recomienda cambiar ' + campaignsUsingWorst.length + ' campana(s) a "' + best.strategy + '" '
        + 'para mejorar rentabilidad.',
      impact: 'HIGH',
      confidence: Math.min(0.85, 0.4 + (best.conversions / (best.conversions + worst.conversions)) * 0.4),
      metric: 'roas',
      projectedValue: best.roas,
      currentValue: worst.roas,
      implementation: {
        currentStrategy: worst.strategy,
        suggestedStrategy: best.strategy,
        suggestedBidAmount: 0, // Se configura automaticamente en la plataforma
        campaignIds: campaignsUsingWorst.map((c) => c.id),
      },
    };
  }

  /**
   * SCHEDULE: Analiza tasa de conversion por hora/dia.
   * Sugiere mejores horarios para publicar anuncios.
   */
  private static async generateScheduleRecommendation(tenantId: string): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    // Obtener insights con datos diarios
    const insights = await prisma.adInsight.findMany({
      where: { tenantId, dateStart: { gte: dateFrom } },
      select: { dateStart: true, impressions: true, clicks: true, conversions: true, spend: true },
    });

    if (insights.length < 7) return null;

    // Analizar por dia de la semana
    const dayOfWeek: Record<number, { impressions: number; clicks: number; conversions: number; spend: number }> = {};
    for (let d = 0; d < 7; d++) {
      dayOfWeek[d] = { impressions: 0, clicks: 0, conversions: 0, spend: 0 };
    }

    for (const insight of insights) {
      const day = insight.dateStart.getDay();
      dayOfWeek[day].impressions += insight.impressions;
      dayOfWeek[day].clicks += insight.clicks;
      dayOfWeek[day].conversions += insight.conversions;
      dayOfWeek[day].spend += insight.spend;
    }

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

    // Encontrar mejor y peor dia
    let bestDay = -1;
    let bestConversionRate = 0;
    let worstDay = -1;
    let worstConversionRate = Infinity;

    for (let d = 0; d < 7; d++) {
      const data = dayOfWeek[d];
      if (data.impressions < 100) continue;
      const rate = data.conversions / data.impressions;
      if (rate > bestConversionRate) {
        bestConversionRate = rate;
        bestDay = d;
      }
      if (rate < worstConversionRate && data.impressions > 200) {
        worstConversionRate = rate;
        worstDay = d;
      }
    }

    if (bestDay < 0 || worstDay < 0 || bestDay === worstDay) return null;

    const bestData = dayOfWeek[bestDay];
    const worstData = dayOfWeek[worstDay];
    const bestRate = bestData.impressions > 0 ? (bestData.conversions / bestData.impressions) * 100 : 0;
    const worstRateConst = worstData.impressions > 0 ? (worstData.conversions / worstData.impressions) * 100 : 0;

    return {
      type: 'SCHEDULE',
      title: 'Optimizar horario - ' + dayNames[bestDay],
      description: 'La tasa de conversion es mas alta los ' + dayNames[bestDay]
        + ' (' + bestRate.toFixed(2) + '%) vs ' + dayNames[worstDay] + ' (' + worstRateConst.toFixed(2) + '%). '
        + 'Se recomienda concentrar presupuesto en ' + dayNames[bestDay]
        + ' y reducir inversion en ' + dayNames[worstDay] + '.',
      impact: 'MEDIUM',
      confidence: Math.min(0.75, 0.3 + (bestData.conversions / (bestData.conversions + worstData.conversions)) * 0.4),
      metric: 'conversionRate',
      projectedValue: bestRate,
      currentValue: worstRateConst,
      implementation: {
        bestDay: dayNames[bestDay],
        worstDay: dayNames[worstDay],
        bestConversionRate: bestRate,
        worstConversionRate: worstRateConst,
        dayMapping: Object.fromEntries(
          Object.entries(dayOfWeek).map(([d, data]) => [
            dayNames[parseInt(d)],
            data.impressions > 0 ? (data.conversions / data.impressions) * 100 : 0,
          ])
        ),
      },
    };
  }

  /**
   * PLATFORM: Compara ROAS entre plataformas (Meta, Google, LinkedIn, TikTok).
   */
  private static async generatePlatformRecommendation(tenantId: string): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const platforms = await prisma.adPlatformConnection.findMany({
      where: { tenantId, status: 'CONNECTED' },
      select: {
        platform: true,
        accountName: true,
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { spend: true, conversions: true, revenue: true, impressions: true, clicks: true, cpa: true, roas: true },
        },
      },
    });

    if (platforms.length < 2) return null;

    const platformMetrics = platforms
      .map((p) => {
        const spend = p.adInsights.reduce((s, i) => s + i.spend, 0);
        const revenue = p.adInsights.reduce((s, i) => s + i.revenue, 0);
        const conversions = p.adInsights.reduce((s, i) => s + i.conversions, 0);
        const impressions = p.adInsights.reduce((s, i) => s + i.impressions, 0);
        const clicks = p.adInsights.reduce((s, i) => s + i.clicks, 0);
        return {
          platform: p.platform,
          name: p.accountName || p.platform,
          spend,
          revenue,
          conversions,
          impressions,
          clicks,
          roas: spend > 0 ? revenue / spend : 0,
          cpa: conversions > 0 ? spend / conversions : 0,
        };
      })
      .filter((m) => m.spend > 0)
      .sort((a, b) => b.roas - a.roas);

    if (platformMetrics.length < 2) return null;

    const best = platformMetrics[0];
    const worst = platformMetrics[platformMetrics.length - 1];

    return {
      type: 'PLATFORM',
      title: 'Reasignar presupuesto - ' + best.platform + ' vs ' + worst.platform,
      description: best.platform + ' tiene un ROAS de ' + best.roas.toFixed(2) + 'x vs '
        + worst.platform + ' con ' + worst.roas.toFixed(2) + 'x. '
        + 'Se recomienda reasignar presupuesto de ' + worst.platform + ' a ' + best.platform
        + ' para maximizar el retorno de inversion.',
      impact: 'HIGH',
      confidence: Math.min(0.8, 0.3 + (Math.abs(best.roas - worst.roas) / (best.roas + worst.roas)) * 0.5),
      metric: 'roas',
      projectedValue: best.roas,
      currentValue: worst.roas,
      implementation: {
        bestPlatform: best.platform,
        worstPlatform: worst.platform,
        bestRoas: best.roas,
        worstRoas: worst.roas,
        bestSpend: best.spend,
        worstSpend: worst.spend,
      },
    };
  }

  // ─── Generadores especificos por campana ─────────────────────────

  /**
   * Genera recomendacion BUDGET para una campana especifica.
   */
  private static async generateCampaignBudgetRecommendation(
    campaignId: string,
    tenantId: string,
  ): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        dailyBudget: true,
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { spend: true, conversions: true, revenue: true, roas: true, cpa: true },
        },
      },
    });

    if (!campaign) return null;

    const spend = campaign.adInsights.reduce((s, i) => s + i.spend, 0);
    const conversions = campaign.adInsights.reduce((s, i) => s + i.conversions, 0);
    const revenue = campaign.adInsights.reduce((s, i) => s + i.revenue, 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;

    if (spend === 0) return null;

    // Calcular promedio del tenant para comparar
    const allCampaigns = await prisma.adCampaign.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { spend: true, revenue: true, conversions: true },
        },
      },
    });

    let totalSpend = 0;
    let totalRevenue = 0;
    for (const c of allCampaigns) {
      for (const i of c.adInsights) {
        totalSpend += i.spend;
        totalRevenue += i.revenue;
      }
    }
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    if (roas > avgRoas * 1.2 && conversions >= 10) {
      const budgetIncrease = Math.round((campaign.dailyBudget || 0) * 0.2 * 100) / 100;
      return {
        type: 'BUDGET',
        title: 'Incrementar presupuesto - ' + campaign.name,
        description: 'ROAS de ' + roas.toFixed(2) + 'x supera el promedio del tenant (' + avgRoas.toFixed(2) + 'x). '
          + 'Incrementar presupuesto 20% para capturar mas conversiones.',
        impact: 'HIGH',
        confidence: Math.min(0.85, 0.4 + conversions * 0.01),
        metric: 'roas',
        projectedValue: roas * 0.95,
        currentValue: roas,
        implementation: { budgetChange: budgetIncrease, type: 'INCREASE', campaignId },
      };
    }

    if (roas < 0.8 && conversions >= 5) {
      const budgetReduction = Math.round((campaign.dailyBudget || 0) * 0.3 * 100) / 100;
      return {
        type: 'BUDGET',
        title: 'Reducir presupuesto - ' + campaign.name,
        description: 'ROAS de ' + roas.toFixed(2) + 'x por debajo del umbral de 1.0x. '
          + 'Reducir presupuesto 30% para minimizar perdidas mientras se optimiza.',
        impact: 'MEDIUM',
        confidence: Math.min(0.8, 0.3 + conversions * 0.01),
        metric: 'roas',
        projectedValue: roas * 1.1,
        currentValue: roas,
        implementation: { budgetChange: -budgetReduction, type: 'REDUCE', campaignId },
      };
    }

    return null;
  }

  /**
   * Genera recomendacion BID para una campana especifica.
   */
  private static async generateCampaignBidRecommendation(
    campaignId: string,
    tenantId: string,
  ): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, bidStrategy: true, bidAmount: true },
    });

    if (!campaign || !campaign.bidStrategy) return null;

    // Comparar con otras campanas del tenant
    const otherCampaigns = await prisma.adCampaign.findMany({
      where: {
        tenantId,
        id: { not: campaignId },
        status: 'ACTIVE',
        bidStrategy: { not: null },
      },
      select: {
        bidStrategy: true,
        adInsights: {
          where: { dateStart: { gte: dateFrom } },
          select: { spend: true, conversions: true, revenue: true },
        },
      },
    });

    if (otherCampaigns.length === 0) return null;

    const currentStrategy = campaign.bidStrategy;

    // Calcular ROAS por estrategia excluyendo la actual
    const roasByStrategy: Record<string, { spend: number; revenue: number; conversions: number; count: number }> = {};
    for (const c of otherCampaigns) {
      const strat = c.bidStrategy || 'LOWEST_COST';
      if (!roasByStrategy[strat]) roasByStrategy[strat] = { spend: 0, revenue: 0, conversions: 0, count: 0 };
      for (const i of c.adInsights) {
        roasByStrategy[strat].spend += i.spend;
        roasByStrategy[strat].revenue += i.revenue;
        roasByStrategy[strat].conversions += i.conversions;
      }
      roasByStrategy[strat].count += 1;
    }

    // Encontrar la mejor estrategia alternativa
    let bestStrategy = '';
    let bestRoas = 0;
    for (const [strat, data] of Object.entries(roasByStrategy)) {
      const roas = data.spend > 0 ? data.revenue / data.spend : 0;
      if (roas > bestRoas && data.conversions > 0) {
        bestRoas = roas;
        bestStrategy = strat;
      }
    }

    // Calcular ROAS actual de la campana
    const insights = await prisma.adInsight.findMany({
      where: { campaignId, dateStart: { gte: dateFrom } },
      select: { spend: true, revenue: true, conversions: true },
    });
    const currentSpend = insights.reduce((s, i) => s + i.spend, 0);
    const currentRevenue = insights.reduce((s, i) => s + i.revenue, 0);
    const currentRoas = currentSpend > 0 ? currentRevenue / currentSpend : 0;

    if (!bestStrategy || bestRoas <= currentRoas) return null;

    return {
      type: 'BID',
      title: 'Cambiar puja a ' + bestStrategy + ' - ' + campaign.name,
      description: 'La estrategia "' + bestStrategy + '" tiene ROAS promedio de '
        + bestRoas.toFixed(2) + 'x vs la actual "' + currentStrategy + '" con '
        + currentRoas.toFixed(2) + 'x. Cambiar la estrategia de puja podria mejorar el rendimiento.',
      impact: 'MEDIUM',
      confidence: Math.min(0.75, 0.3 + Math.abs(bestRoas - currentRoas) * 0.1),
      metric: 'roas',
      projectedValue: bestRoas,
      currentValue: currentRoas,
      implementation: {
        currentStrategy,
        suggestedStrategy: bestStrategy,
        campaignId,
        bidAmount: campaign.bidAmount || 0,
      },
    };
  }

  /**
   * Genera recomendacion SCHEDULE para una campana especifica.
   */
  private static async generateCampaignScheduleRecommendation(
    campaignId: string,
    _tenantId: string,
  ): Promise<RecommendationResult | null> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

    const insights = await prisma.adInsight.findMany({
      where: { campaignId, dateStart: { gte: dateFrom } },
      select: { dateStart: true, impressions: true, clicks: true, conversions: true, spend: true },
    });

    if (insights.length < 7) return null;

    // Analizar por dia de la semana
    const dayOfWeek: Record<number, { impressions: number; conversions: number }> = {};
    for (let d = 0; d < 7; d++) {
      dayOfWeek[d] = { impressions: 0, conversions: 0 };
    }

    for (const insight of insights) {
      const day = insight.dateStart.getDay();
      dayOfWeek[day].impressions += insight.impressions;
      dayOfWeek[day].conversions += insight.conversions;
    }

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

    let bestDay = -1;
    let bestRate = 0;
    let worstDay = -1;
    let worstRate = Infinity;

    for (let d = 0; d < 7; d++) {
      const data = dayOfWeek[d];
      if (data.impressions < 50) continue;
      const rate = data.conversions / data.impressions;
      if (rate > bestRate) { bestRate = rate; bestDay = d; }
      if (rate < worstRate) { worstRate = rate; worstDay = d; }
    }

    if (bestDay < 0 || worstDay < 0 || bestDay === worstDay) return null;

    return {
      type: 'SCHEDULE',
      title: 'Horario optimo - ' + dayNames[bestDay],
      description: 'Esta campana convierte mejor los ' + dayNames[bestDay]
        + ' vs ' + dayNames[worstDay] + '. Ajustar la programacion para concentrar presupuesto.',
      impact: 'LOW',
      confidence: 0.55,
      metric: 'conversionRate',
      projectedValue: bestRate * 100,
      currentValue: worstRate * 100,
      implementation: { bestDay: dayNames[bestDay], worstDay: dayNames[worstDay], campaignId },
    };
  }

  // ─── Integracion con IA (OpenRouter + Gemini) ─────────────────────

  /**
   * Llama a OpenRouter con Gemini 2.0 Flash para analisis avanzado.
   * Analiza datos de los ultimos 30-90 dias de rendimiento de campana,
   * datos de audiencia de leads convertidos, rendimiento creativo,
   * y eficiencia presupuestaria por plataforma.
   */
  private static async callAIForCampaign(
    campaignId: string,
    tenantId: string,
    _platform: AdPlatform,
  ): Promise<RecommendationResult | null> {
    const apiKey = process.env.GOOGLE_AI_KEY;
    if (!apiKey) {
      logger.warn({ campaignId }, 'RecommendationEngine: GOOGLE_AI_KEY no configurada');
      return null;
    }

    try {
      // Recolectar datos de los ultimos 90 dias
      const dateTo = new Date();
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - RECOMMENDATION_WINDOW_DAYS);

      const insights = await prisma.adInsight.findMany({
        where: { campaignId, dateStart: { gte: dateFrom } },
        select: {
          dateStart: true,
          impressions: true,
          clicks: true,
          spend: true,
          conversions: true,
          revenue: true,
          ctr: true,
          cpa: true,
          roas: true,
          leads: true,
        },
        orderBy: { dateStart: 'asc' },
        take: 90,
      });

      if (insights.length < MIN_DATA_DAYS) return null;

      // Construir prompt con datos agregados
      const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
      const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
      const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
      const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
      const totalRevenue = insights.reduce((s, i) => s + i.revenue, 0);
      const totalLeads = insights.reduce((s, i) => s + i.leads, 0);
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

      const prompt = 'Eres un experto en optimizacion de anuncios digitales. '
        + 'Analiza los siguientes datos de rendimiento de campana publicitaria '
        + 'y genera UNA recomendacion accionable en formato JSON.\n\n'
        + '### Datos de rendimiento (ultimos 90 dias):\n'
        + '- Impresiones: ' + totalImpressions + '\n'
        + '- Clicks: ' + totalClicks + '\n'
        + '- Gasto total: $' + totalSpend.toFixed(2) + '\n'
        + '- Conversion: ' + totalConversions + '\n'
        + '- Ingresos: $' + totalRevenue.toFixed(2) + '\n'
        + '- Leads generados: ' + totalLeads + '\n'
        + '- CTR promedio: ' + avgCtr.toFixed(2) + '%\n'
        + '- CPA promedio: $' + avgCpa.toFixed(2) + '\n'
        + '- ROAS promedio: ' + avgRoas.toFixed(2) + 'x\n\n'
        + 'Responde SOLO con un objeto JSON con esta estructura:\n'
        + '{\n'
        + '  "type": "TARGETING" | "CREATIVE" | "BID" | "BUDGET" | "SCHEDULE" | "PLATFORM",\n'
        + '  "title": "string",\n'
        + '  "description": "string (explicacion detallada en espanol)",\n'
        + '  "impact": "HIGH" | "MEDIUM" | "LOW",\n'
        + '  "confidence": number (0-1),\n'
        + '  "metric": "string",\n'
        + '  "currentValue": number,\n'
        + '  "projectedValue": number,\n'
        + '  "implementation": {}\n'
        + '}';

      const response = await fetch(`${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { campaignId, status: response.status },
          'RecommendationEngine: Error en Gemini: ' + response.status + ' - ' + errorText,
        );
        return null;
      }

      const data = await response.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        logger.warn({ campaignId }, 'RecommendationEngine: Gemini retorno respuesta vacia');
        return null;
      }

      const parsed: AIRecommendationPayload = JSON.parse(content);

      // Validar campos requeridos
      if (!parsed.type || !parsed.title || !parsed.description) {
        logger.warn({ campaignId, content }, 'RecommendationEngine: Respuesta IA incompleta');
        return null;
      }

      return {
        type: parsed.type as RecommendationResult['type'],
        title: parsed.title,
        description: parsed.description,
        impact: parsed.impact,
        confidence: parsed.confidence,
        metric: parsed.metric,
        projectedValue: parsed.projectedValue,
        currentValue: parsed.currentValue,
        implementation: parsed.implementation || undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      logger.error({ campaignId, err }, 'RecommendationEngine: Error en IA: ' + msg);
      return null;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  /**
   * Construye una razon legible para la asignacion de presupuesto.
   */
  private static buildBudgetAllocationReason(
    roas: number,
    conversions: number,
    spend: number,
  ): string {
    if (roas >= 3.0) {
      return 'ROAS excepcional de ' + roas.toFixed(2) + 'x con ' + conversions + ' conversiones y $' + spend.toFixed(2) + ' invertidos. Alta rentabilidad comprobada.';
    }
    if (roas >= 1.5) {
      return 'ROAS solido de ' + roas.toFixed(2) + 'x con ' + conversions + ' conversiones. Rendimiento positivo consistente.';
    }
    if (roas >= 1.0) {
      return 'ROAS de ' + roas.toFixed(2) + 'x, punto de equilibrio. ' + conversions + ' conversiones generadas con $' + spend.toFixed(2) + ' de inversion.';
    }
    if (conversions > 0) {
      return 'ROAS de ' + roas.toFixed(2) + 'x por debajo del punto de equilibrio. ' + conversions + ' conversiones pero con perdida neta. Requiere optimizacion.';
    }
    return 'Sin datos suficientes de conversion (' + spend.toFixed(2) + ' gastados, ' + conversions + ' conversiones). Asignacion conservadora.';
  }
}
