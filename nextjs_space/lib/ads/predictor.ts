/**
 * Predictor de Rendimiento con IA — ADS Intelligence Module
 *
 * Predice el rendimiento futuro de campañas publicitarias usando un
 * enfoque escalonado basado en la cantidad de datos históricos disponibles:
 *
 *   1. < 7 días  →  Promedio simple de los días disponibles
 *   2. 7-30 días  →  Media móvil ponderada con tendencia lineal
 *   3. > 30 días  →  LLM (OpenRouter / Gemma 2) con contexto de serie temporal
 *
 * Incluye detección de anomalías mediante desviación estándar sobre media móvil.
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 5
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type {
  CampaignPrediction,
  MetricPrediction,
  HistoricalDataPoint,
  AdObjective,
  AdBidStrategy,
} from './types';

// ─── Constantes ─────────────────────────────────────────────────────────────

const METRICS = ['spend', 'impressions', 'clicks', 'cpc', 'conversions', 'cpa', 'roas'] as const;
type MetricName = (typeof METRICS)[number];

const CONFIDENCE_HIGH = 0.95;
const CONFIDENCE_MEDIUM = 0.80;
const CONFIDENCE_LOW = 0.55;

// ─── AdPredictor ────────────────────────────────────────────────────────────

export class AdPredictor {
  /**
   * Predice el rendimiento de una campaña para los próximos 24h, 7d y 30d.
   */
  static async predictCampaign(campaignId: string): Promise<CampaignPrediction> {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        tenantId: true,
        objective: true,
        dailyBudget: true,
        bidStrategy: true,
        startDate: true,
      },
    });

    if (!campaign) {
      throw new Error(`Campaña no encontrada: ${campaignId}`);
    }

    // Obtener datos históricos de los últimos 90 días
    const insights = await prisma.adInsight.findMany({
      where: {
        campaignId,
        dateStart: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { dateStart: 'asc' },
      select: {
        dateStart: true,
        impressions: true,
        clicks: true,
        spend: true,
        conversions: true,
        cpc: true,
        cpm: true,
        ctr: true,
        cpa: true,
        roas: true,
      },
    });

    const daysOfData = this.countUniqueDays(insights);
    const historicalDataPoints = this.toHistoricalDataPoints(insights);
    const anomalyScore = this.detectAnomalies(historicalDataPoints);

    // Elegir método según cantidad de datos
    let predictions: CampaignPrediction['predictions'];
    let confidence: number;

    if (daysOfData < 7) {
      predictions = this.predictSimpleAverage(historicalDataPoints);
      confidence = CONFIDENCE_LOW;
      logger.info(
        { campaignId, daysOfData, method: 'simple_average' },
        'AdPredictor: Usando promedio simple (< 7 días de datos)',
      );
    } else if (daysOfData < 30) {
      predictions = this.predictWeightedMovingAverage(historicalDataPoints);
      confidence = CONFIDENCE_MEDIUM;
      logger.info(
        { campaignId, daysOfData, method: 'weighted_moving_average' },
        'AdPredictor: Usando media móvil ponderada (7-30 días de datos)',
      );
    } else {
      // Intentar AI primero, fallback a estadístico
      try {
        const aiResult = await this.predictWithAI(campaign, historicalDataPoints);
        predictions = aiResult.predictions;
        confidence = aiResult.confidence;
        logger.info(
          { campaignId, daysOfData, method: 'ai_gemma', confidence },
          'AdPredictor: Predicción con IA exitosa',
        );
      } catch (err) {
        logger.warn(
          { campaignId, err },
          'AdPredictor: Falló predicción con IA, usando fallback estadístico',
        );
        predictions = this.predictWeightedMovingAverage(historicalDataPoints);
        confidence = CONFIDENCE_MEDIUM;
      }
    }

    // Ajustar confianza si hay anomalías detectadas
    if (anomalyScore > 0.5) {
      confidence = Math.max(0.3, confidence - 0.2);
    }

    return {
      campaignId,
      predictions,
      confidence: Math.round(confidence * 100) / 100,
      anomalyScore: Math.round(anomalyScore * 100) / 100,
    };
  }

  /**
   * Predice el rendimiento de todas las campañas activas de un tenant.
   */
  static async predictAllCampaigns(tenantId: string): Promise<CampaignPrediction[]> {
    const campaigns = await prisma.adCampaign.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true },
    });

    const results: CampaignPrediction[] = [];

    for (const campaign of campaigns) {
      try {
        const prediction = await this.predictCampaign(campaign.id);
        results.push(prediction);
      } catch (err) {
        logger.error(
          { campaignId: campaign.id, err },
          'AdPredictor: Error prediciendo campaña individual',
        );
      }
    }

    return results;
  }

  // ─── Método 1: Promedio simple (< 7 días) ─────────────────────────────

  private static predictSimpleAverage(
    dataPoints: HistoricalDataPoint[],
  ): CampaignPrediction['predictions'] {
    if (dataPoints.length === 0) {
      return this.zeroPredictions();
    }

    const avg = this.averageMetrics(dataPoints);
    const singleDay = this.toMetricRecord(avg, dataPoints.length);
    const dailyVariance = this.estimateDailyVariance(dataPoints);

    return {
      nextDay: this.applyRange(singleDay, dailyVariance),
      nextWeek: this.applyRange(
        this.scaleMetrics(singleDay, 7),
        dailyVariance.map((v) => v * 7),
      ),
      nextMonth: this.applyRange(
        this.scaleMetrics(singleDay, 30),
        dailyVariance.map((v) => v * 30),
      ),
    };
  }

  // ─── Método 2: Media móvil ponderada con tendencia lineal (7-30 días) ─

  private static predictWeightedMovingAverage(
    dataPoints: HistoricalDataPoint[],
  ): CampaignPrediction['predictions'] {
    if (dataPoints.length === 0) {
      return this.zeroPredictions();
    }

    const n = dataPoints.length;
    // Usar últimos 30 días si hay más
    const window = dataPoints.slice(-30);

    // Calcular tendencia lineal para cada métrica
    const trend = this.computeLinearTrend(window);

    // Media ponderada (más peso a datos recientes)
    const weighted = this.weightedAverage(window);
    const projected: Record<string, number> = {};

    for (const metric of METRICS) {
      const baseValue = weighted[metric] ?? 0;
      const slope = trend[metric] ?? 0;
      // Proyectar 1 día con tendencia
      projected[metric] = Math.max(0, baseValue + slope);
    }

    const dayRecord = this.toMetricRecord(projected, window.length);
    const variance = this.estimateDailyVariance(window);

    return {
      nextDay: this.applyRange(dayRecord, variance),
      nextWeek: this.applyRange(
        this.scaleMetrics(dayRecord, 7),
        variance.map((v) => v * 7),
      ),
      nextMonth: this.applyRange(
        this.scaleMetrics(dayRecord, 30),
        variance.map((v) => v * 30),
      ),
    };
  }

  // ─── Método 3: Predicción con IA (> 30 días) ─────────────────────────

  private static async predictWithAI(
    campaign: {
      id: string;
      objective: string | null;
      dailyBudget: number | null;
      bidStrategy: string | null;
    },
    dataPoints: HistoricalDataPoint[],
  ): Promise<{ predictions: CampaignPrediction['predictions']; confidence: number }> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY no configurada');
    }

    // Usar últimos 60-90 días
    const window = dataPoints.slice(-90);
    const timeSeries = window.map((dp) => ({
      date: dp.date,
      impressions: dp.impressions,
      clicks: dp.clicks,
      spend: dp.spend,
      conversions: dp.conversions,
      cpc: dp.cpc,
      cpm: dp.cpm,
      ctr: dp.ctr,
      cpa: dp.cpa,
      roas: dp.roas,
    }));

    // Calcular patrones de día de semana y mes
    const dayOfWeekPattern = this.computeDayOfWeekPattern(window);
    const monthPattern = this.computeMonthPattern(window);

    const prompt = this.buildAIPrompt(
      timeSeries,
      {
        objective: campaign.objective,
        dailyBudget: campaign.dailyBudget,
        bidStrategy: campaign.bidStrategy,
      },
      dayOfWeekPattern,
      monthPattern,
    );

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter: respuesta vacía o sin contenido');
    }

    const parsed = JSON.parse(content) as {
      predictions: {
        nextDay: Record<string, { value: number; min: number; max: number }>;
        nextWeek: Record<string, { value: number; min: number; max: number }>;
        nextMonth: Record<string, { value: number; min: number; max: number }>;
      };
      confidence: number;
    };

    if (!parsed.predictions?.nextDay || !parsed.predictions?.nextWeek || !parsed.predictions?.nextMonth) {
      throw new Error('OpenRouter: respuesta JSON incompleta');
    }

    const mapToMetricPrediction = (
      raw: Record<string, { value: number; min: number; max: number }>,
    ): Record<string, MetricPrediction> => {
      const result: Record<string, MetricPrediction> = {};
      for (const key of METRICS) {
        if (raw[key] !== undefined) {
          result[key] = {
            value: Math.round(raw[key].value * 10000) / 10000,
            range: [
              Math.round(raw[key].min * 10000) / 10000,
              Math.round(raw[key].max * 10000) / 10000,
            ] as [number, number],
          };
        }
      }
      return result;
    };

    const predictions: CampaignPrediction['predictions'] = {
      nextDay: mapToMetricPrediction(parsed.predictions.nextDay),
      nextWeek: mapToMetricPrediction(parsed.predictions.nextWeek),
      nextMonth: mapToMetricPrediction(parsed.predictions.nextMonth),
    };

    // Rellenar métricas faltantes con estimaciones
    for (const period of ['nextDay', 'nextWeek', 'nextMonth'] as const) {
      for (const metric of METRICS) {
        if (!predictions[period][metric]) {
          predictions[period][metric] = { value: 0, range: [0, 0] };
        }
      }
    }

    return {
      predictions,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? CONFIDENCE_HIGH)),
    };
  }

  // ─── Construcción del prompt para la IA ──────────────────────────────

  private static buildAIPrompt(
    timeSeries: HistoricalDataPoint[],
    campaignMeta: {
      objective: string | null;
      dailyBudget: number | null;
      bidStrategy: string | null;
    },
    dayOfWeekPattern: Record<string, number>,
    monthPattern: Record<string, number>,
  ): string {
    const seriesJson = JSON.stringify(timeSeries, null, 2);
    const dowJson = JSON.stringify(dayOfWeekPattern, null, 2);
    const monthJson = JSON.stringify(monthPattern, null, 2);

    return `Eres un analista de rendimiento publicitario. Analiza la siguiente serie temporal de métricas de una campaña de anuncios y genera predicciones estructuradas.

## Metadatos de la campaña
- Objetivo: ${campaignMeta.objective || 'No especificado'}
- Presupuesto diario: ${campaignMeta.dailyBudget ?? 'No especificado'}
- Estrategia de puja: ${campaignMeta.bidStrategy || 'No especificada'}

## Patrones semanales (day of week index)
${dowJson}

## Patrones mensuales
${monthJson}

## Serie temporal (últimos días)
\`\`\`json
${seriesJson}
\`\`\`

Genera predicciones para:
- **nextDay**: próximas 24 horas
- **nextWeek**: próximos 7 días
- **nextMonth**: próximos 30 días

Para cada métrica proporciona:
- \`value\`: valor esperado
- \`min\`: límite inferior del intervalo de confianza (85% CI)
- \`max\`: límite superior del intervalo de confianza (85% CI)

Métricas requeridas (asegúrate de incluir todas):
- spend (gasto estimado en la moneda local)
- impressions (impresiones estimadas)
- clicks (clics estimados)
- cpc (costo por clic)
- conversions (conversiones estimadas)
- cpa (costo por adquisición)
- roas (return on ad spend)

Además, incluye un campo \`confidence\` (0-1) que refleje tu nivel de confianza general en la predicción basado en la consistencia de los datos históricos.

Responde ÚNICAMENTE con un objeto JSON válido en este formato exacto (sin markdown ni bloques de código):
{
  "predictions": {
    "nextDay": { "spend": {"value": 0, "min": 0, "max": 0}, ... },
    "nextWeek": { "spend": {"value": 0, "min": 0, "max": 0}, ... },
    "nextMonth": { "spend": {"value": 0, "min": 0, "max": 0}, ... }
  },
  "confidence": 0.85
}`;
  }

  // ─── Detección de anomalías ──────────────────────────────────────────

  /**
   * Detecta anomalías comparando el gasto real con la media móvil.
   * Si el gasto real se desvía > 2 desviaciones estándar → anomalía.
   * Retorna un score entre 0 (normal) y 1 (alta anomalía).
   */
  private static detectAnomalies(dataPoints: HistoricalDataPoint[]): number {
    if (dataPoints.length < 7) return 0;

    const spendValues = dataPoints.map((dp) => dp.spend);
    const n = spendValues.length;
    const windowSize = Math.min(7, n);

    let anomalyCount = 0;
    let totalChecks = 0;

    for (let i = windowSize; i < n; i++) {
      const window = spendValues.slice(i - windowSize, i);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const variance =
        window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        const currentValue = spendValues[i];
        const zScore = Math.abs(currentValue - mean) / stdDev;

        if (zScore > 2) {
          anomalyCount++;
        }
        totalChecks++;
      }
    }

    return totalChecks > 0 ? anomalyCount / totalChecks : 0;
  }

  // ─── Helpers estadísticos ────────────────────────────────────────────

  private static countUniqueDays(
    insights: { dateStart: Date }[],
  ): number {
    const unique = new Set<string>();
    for (const i of insights) {
      unique.add(i.dateStart.toISOString().slice(0, 10));
    }
    return unique.size;
  }

  private static toHistoricalDataPoints(
    insights: {
      dateStart: Date;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      cpc: number;
      cpm: number;
      ctr: number;
      cpa: number;
      roas: number;
    }[],
  ): HistoricalDataPoint[] {
    return insights.map((i) => ({
      date: i.dateStart.toISOString().slice(0, 10),
      impressions: i.impressions,
      clicks: i.clicks,
      spend: i.spend,
      conversions: i.conversions,
      cpc: i.cpc,
      cpm: i.cpm,
      ctr: i.ctr,
      cpa: i.cpa,
      roas: i.roas,
    }));
  }

  /**
   * Promedia cada métrica a través de todos los data points.
   */
  private static averageMetrics(
    dataPoints: HistoricalDataPoint[],
  ): Record<string, number> {
    const n = dataPoints.length;
    if (n === 0) return {};

    const sums: Record<string, number> = {};
    for (const metric of METRICS) {
      sums[metric] = dataPoints.reduce((s, dp) => s + (dp[metric] as number), 0);
    }

    const avg: Record<string, number> = {};
    for (const metric of METRICS) {
      avg[metric] = sums[metric] / n;
    }

    return avg;
  }

  /**
   * Convierte un record de métricas diarias a Record<string, MetricPrediction>
   * usando el número de días como factor de calidad para el rango.
   */
  private static toMetricRecord(
    dailyValues: Record<string, number>,
    daysCount: number,
  ): Record<string, MetricPrediction> {
    const record: Record<string, MetricPrediction> = {};
    const rangeFactor = daysCount > 0 ? 1 / Math.sqrt(daysCount) : 0.5;

    for (const metric of METRICS) {
      const value = dailyValues[metric] ?? 0;
      record[metric] = {
        value: Math.round(value * 10000) / 10000,
        range: [
          Math.round(Math.max(0, value * (1 - rangeFactor)) * 10000) / 10000,
          Math.round(value * (1 + rangeFactor) * 10000) / 10000,
        ] as [number, number],
      };
    }

    return record;
  }

  /**
   * Calcula la varianza diaria estimada para cada métrica.
   * Retorna un array de factores de escala (uno por métrica).
   */
  private static estimateDailyVariance(
    dataPoints: HistoricalDataPoint[],
  ): number[] {
    if (dataPoints.length < 2) {
      return METRICS.map(() => 0.3); // Factor por defecto
    }

    const avg = this.averageMetrics(dataPoints);
    const factors: number[] = [];

    for (const metric of METRICS) {
      const mean = avg[metric] ?? 0;
      if (mean === 0) {
        factors.push(0.3);
        continue;
      }
      const squaredDiffs = dataPoints.map((dp) => {
        const val = (dp[metric] as number) ?? 0;
        return (val - mean) ** 2;
      });
      const variance =
        squaredDiffs.reduce((s, v) => s + v, 0) / squaredDiffs.length;
      const stdDev = Math.sqrt(variance);
      // Coeficiente de variación como factor de rango
      factors.push(Math.min(0.5, stdDev / mean));
    }

    return factors;
  }

  /**
   * Aplica un factor de rango a cada predicción.
   */
  private static applyRange(
    predictions: Record<string, MetricPrediction>,
    varianceFactors: number[],
  ): Record<string, MetricPrediction> {
    const result: Record<string, MetricPrediction> = {};

    METRICS.forEach((metric, idx) => {
      const pred = predictions[metric];
      if (!pred) return;

      const factor = Math.min(0.5, varianceFactors[idx] ?? 0.3);
      result[metric] = {
        value: pred.value,
        range: [
          Math.round(Math.max(0, pred.value * (1 - factor)) * 10000) / 10000,
          Math.round(pred.value * (1 + factor) * 10000) / 10000,
        ] as [number, number],
      };
    });

    return result;
  }

  /**
   * Escala todas las métricas por un factor (útil para 7d o 30d).
   */
  private static scaleMetrics(
    predictions: Record<string, MetricPrediction>,
    factor: number,
  ): Record<string, MetricPrediction> {
    const result: Record<string, MetricPrediction> = {};

    for (const [metric, pred] of Object.entries(predictions)) {
      result[metric] = {
        value: Math.round(pred.value * factor * 10000) / 10000,
        range: [
          Math.round(pred.range[0] * factor * 10000) / 10000,
          Math.round(pred.range[1] * factor * 10000) / 10000,
        ] as [number, number],
      };
    }

    return result;
  }

  /**
   * Calcula tendencia lineal (pendiente) para cada métrica usando
   * regresión lineal simple sobre los últimos data points.
   */
  private static computeLinearTrend(
    dataPoints: HistoricalDataPoint[],
  ): Record<string, number> {
    const n = dataPoints.length;
    if (n < 2) {
      const empty: Record<string, number> = {};
      for (const m of METRICS) empty[m] = 0;
      return empty;
    }

    const xMean = (n - 1) / 2;
    const trend: Record<string, number> = {};

    for (const metric of METRICS) {
      const values = dataPoints.map((dp) => dp[metric] as number);
      const yMean = values.reduce((s, v) => s + v, 0) / n;

      let numerator = 0;
      let denominator = 0;

      for (let i = 0; i < n; i++) {
        const x = i - xMean;
        const y = values[i] - yMean;
        numerator += x * y;
        denominator += x * x;
      }

      trend[metric] = denominator > 0 ? numerator / denominator : 0;
    }

    return trend;
  }

  /**
   * Calcula media ponderada dando más peso a los datos más recientes.
   */
  private static weightedAverage(
    dataPoints: HistoricalDataPoint[],
  ): Record<string, number> {
    const n = dataPoints.length;
    if (n === 0) return {};

    // Pesos lineales: 1, 2, 3, ..., n
    const weights = Array.from({ length: n }, (_, i) => i + 1);
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    const weighted: Record<string, number> = {};
    for (const metric of METRICS) {
      weighted[metric] =
        dataPoints.reduce((s, dp, i) => s + (dp[metric] as number) * weights[i], 0) /
        totalWeight;
    }

    return weighted;
  }

  // ─── Patrones de estacionalidad ──────────────────────────────────────

  /**
   * Calcula el factor promedio por día de la semana (0=domingo...6=sábado).
   * Retorna un record con clave "0".."6" y valor promedio de spend relativo.
   */
  private static computeDayOfWeekPattern(
    dataPoints: HistoricalDataPoint[],
  ): Record<string, number> {
    const daySums: Record<string, number[]> = {};

    for (const dp of dataPoints) {
      const day = new Date(dp.date).getDay().toString();
      if (!daySums[day]) daySums[day] = [];
      daySums[day].push(dp.spend);
    }

    const pattern: Record<string, number> = {};
    let globalAvg = 0;
    let totalCount = 0;

    for (const day of Object.keys(daySums)) {
      const vals = daySums[day];
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      globalAvg += avg * vals.length;
      totalCount += vals.length;
      pattern[day] = avg;
    }

    globalAvg = totalCount > 0 ? globalAvg / totalCount : 0;

    // Normalizar respecto al promedio global
    if (globalAvg > 0) {
      for (const day of Object.keys(pattern)) {
        pattern[day] = pattern[day] / globalAvg;
      }
    }

    return pattern;
  }

  /**
   * Calcula el factor promedio por mes (1=enero...12=diciembre).
   */
  private static computeMonthPattern(
    dataPoints: HistoricalDataPoint[],
  ): Record<string, number> {
    const monthSums: Record<string, number[]> = {};

    for (const dp of dataPoints) {
      const month = (new Date(dp.date).getMonth() + 1).toString();
      if (!monthSums[month]) monthSums[month] = [];
      monthSums[month].push(dp.spend);
    }

    const pattern: Record<string, number> = {};
    let globalAvg = 0;
    let totalCount = 0;

    for (const month of Object.keys(monthSums)) {
      const vals = monthSums[month];
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      globalAvg += avg * vals.length;
      totalCount += vals.length;
      pattern[month] = avg;
    }

    globalAvg = totalCount > 0 ? globalAvg / totalCount : 0;

    if (globalAvg > 0) {
      for (const month of Object.keys(pattern)) {
        pattern[month] = pattern[month] / globalAvg;
      }
    }

    return pattern;
  }

  // ─── Valores por defecto ─────────────────────────────────────────────

  /**
   * Retorna predicciones vacías (cero) para todos los períodos.
   */
  private static zeroPredictions(): CampaignPrediction['predictions'] {
    const zeroMetric = (): Record<string, MetricPrediction> => {
      const record: Record<string, MetricPrediction> = {};
      for (const metric of METRICS) {
        record[metric] = { value: 0, range: [0, 0] };
      }
      return record;
    };

    return {
      nextDay: zeroMetric(),
      nextWeek: zeroMetric(),
      nextMonth: zeroMetric(),
    };
  }
}

export default AdPredictor;
