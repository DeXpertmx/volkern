import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getConnector } from './connectors';
import type { AdPlatform } from './types';

function chiSquarePValue(chi2: number, df: number): number {
  const n = df / 2;
  const x = chi2 / 2;

  let sum = 0;
  let term = Math.exp(-x);
  for (let i = 0; i < 100; i++) {
    sum += term;
    term *= x / (n + i + 1);
  }
  return Math.min(1, Math.max(0, sum));
}

interface VariantStats {
  id: string;
  label: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
}

interface SignificanceResult {
  winnerId: string | null;
  winnerLabel: string | null;
  confidence: number;
  significant: boolean;
  chiSquare: number;
  pValue: number;
  metric: string;
  variantResults: Array<{
    label: string;
    value: number;
    isWinner: boolean;
  }>;
}

export async function calculateSignificance(testId: string): Promise<SignificanceResult> {
  const test = await prisma.adABTest.findUnique({
    where: { id: testId },
    include: { variants: true },
  });
  if (!test) throw new Error('Test no encontrado');

  const variants: VariantStats[] = test.variants.map(v => ({
    id: v.id,
    label: v.label,
    impressions: v.currentImpressions,
    clicks: v.currentClicks,
    conversions: v.currentConversions,
    spend: v.currentSpend,
  }));

  if (variants.length < 2 || variants.every(v => v.impressions === 0)) {
    return {
      winnerId: null,
      winnerLabel: null,
      confidence: 0,
      significant: false,
      chiSquare: 0,
      pValue: 1,
      metric: test.metric,
      variantResults: variants.map(v => ({ label: v.label, value: 0, isWinner: false })),
    };
  }

  let observed: number[] = [];
  let expected: number[] = [];
  let valueLabels: string[] = [];
  let values: number[] = [];

  switch (test.metric) {
    case 'CTR': {
      const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
      const totalClicks = variants.reduce((s, v) => s + v.clicks, 0);
      const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

      for (const v of variants) {
        if (v.impressions > 0) {
          observed.push(v.clicks);
          expected.push(v.impressions * avgCtr);
          values.push(v.clicks / v.impressions);
          valueLabels.push(v.label);
        }
      }
      break;
    }
    case 'CPC': {
      for (const v of variants) {
        if (v.clicks > 0) {
          const cpc = v.spend / v.clicks;
          observed.push(v.spend);
          expected.push(v.clicks * (variants.reduce((s, vv) => s + vv.spend, 0) / Math.max(1, variants.reduce((s, vv) => s + vv.clicks, 0))));
          values.push(cpc);
          valueLabels.push(v.label);
        }
      }
      break;
    }
    case 'CPA': {
      for (const v of variants) {
        if (v.conversions > 0) {
          const cpa = v.spend / v.conversions;
          observed.push(v.spend);
          expected.push(v.conversions * (variants.reduce((s, vv) => s + vv.spend, 0) / Math.max(1, variants.reduce((s, vv) => s + vv.conversions, 0))));
          values.push(cpa);
          valueLabels.push(v.label);
        }
      }
      break;
    }
    case 'ROAS': {
      for (const v of variants) {
        if (v.spend > 0) {
          values.push(v.conversions / v.spend);
          valueLabels.push(v.label);
        }
      }
      // ROAS use conversion rate significance as proxy
      const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);
      const avgConversionRate = totalConversions / Math.max(1, variants.reduce((s, v) => s + v.impressions, 0));
      for (const v of variants) {
        if (v.impressions > 0) {
          observed.push(v.conversions);
          expected.push(v.impressions * avgConversionRate);
        }
      }
      break;
    }
    case 'CONVERSIONS': {
      const totalConv = variants.reduce((s, v) => s + v.conversions, 0);
      const totalImp = variants.reduce((s, v) => s + v.impressions, 0);
      const avgConvRate = totalImp > 0 ? totalConv / totalImp : 0;
      for (const v of variants) {
        if (v.impressions > 0) {
          observed.push(v.conversions);
          expected.push(v.impressions * avgConvRate);
          values.push(v.conversions / v.impressions);
          valueLabels.push(v.label);
        }
      }
      break;
    }
    default: {
      const total = variants.reduce((s, v) => s + v.conversions, 0);
      const totalBase = variants.reduce((s, v) => s + v.impressions, 0);
      const avg = totalBase > 0 ? total / totalBase : 0;
      for (const v of variants) {
        if (v.impressions > 0) {
          observed.push(v.conversions);
          expected.push(v.impressions * avg);
          values.push(v.conversions / v.impressions);
          valueLabels.push(v.label);
        }
      }
    }
  }

  const df = Math.max(1, observed.length - 1);
  let chiSquare = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] > 0) {
      chiSquare += Math.pow(observed[i] - expected[i], 2) / expected[i];
    }
  }

  const pValue = 1 - chiSquarePValue(chiSquare, df);
  const significant = pValue >= test.significanceThreshold;

  const bestMetric = test.metric === 'CPA' || test.metric === 'CPC' ? Math.min : Math.max;
  const bestIdx = values.length > 0 ? values.indexOf(bestMetric(...values)) : -1;

  const winnerId = bestIdx >= 0 ? variants[bestIdx]?.id || null : null;
  const winnerLabel = bestIdx >= 0 ? valueLabels[bestIdx] || null : null;

  return {
    winnerId,
    winnerLabel,
    confidence: pValue,
    significant,
    chiSquare,
    pValue,
    metric: test.metric,
    variantResults: variants.map((v, i) => ({
      label: v.label,
      value: values[i] || 0,
      isWinner: v.id === winnerId,
    })),
  };
}

export async function declareWinner(testId: string, variantId?: string) {
  const test = await prisma.adABTest.findUnique({
    where: { id: testId },
    include: {
      variants: true,
      campaign: { include: { platform: { select: { platform: true } } } },
    },
  });
  if (!test) throw new Error('Test no encontrado');

  let winnerId = variantId;

  if (!winnerId) {
    const result = await calculateSignificance(testId);
    if (!result.significant) {
      throw new Error('El test no ha alcanzado significancia estadística');
    }
    winnerId = result.winnerId ?? undefined;
  }

  if (!winnerId) throw new Error('No se pudo determinar ganador');

  const winner = test.variants.find(v => v.id === winnerId);
  if (!winner) throw new Error('Variante ganadora no encontrada');

  const losingVariants = test.variants.filter(v => v.id !== winnerId);

  // Pausar variantes perdedoras en la plataforma
  const connector = getConnector(test.campaign.platform.platform as AdPlatform);
  for (const loser of losingVariants) {
    if (loser.adSetId) {
      try {
        await connector.pauseCampaign(loser.adSetId, loser.adSetId);
      } catch (err) {
        logger.warn({ variantId: loser.id, err }, 'No se pudo pausar variante perdedora en la plataforma');
      }
    }
    if (loser.adId) {
      try {
        await connector.pauseCampaign(loser.adId, loser.adId);
      } catch (err) {
        logger.warn({ variantId: loser.id, err }, 'No se pudo pausar anuncio perdedor en la plataforma');
      }
    }
  }

  await prisma.adABTest.update({
    where: { id: testId },
    data: {
      status: 'COMPLETED',
      winnerId,
      declaredAt: new Date(),
    },
  });

  return {
    testId,
    winnerId,
    winnerLabel: winner.label,
    metric: test.metric,
  };
}

export async function evaluateActiveTests() {
  const activeTests = await prisma.adABTest.findMany({
    where: { status: 'RUNNING', autoDeclare: true },
    include: { variants: true },
  });

  for (const test of activeTests) {
    try {
      const result = await calculateSignificance(test.id);
      if (result.significant && result.winnerId) {
        await declareWinner(test.id, result.winnerId);
        console.log(`[ABTest] Ganador declarado automáticamente: test ${test.id}, variante ${result.winnerLabel}`);
      }
    } catch (err) {
      console.error(`[ABTest] Error evaluando test ${test.id}:`, err);
    }
  }
}
