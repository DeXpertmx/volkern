import { prisma } from '../db';
import { calculateSignificance, declareWinner } from '../ads/ab-test-engine';

/**
 * Crea una programación horaria para una campaña
 */
export async function create_ad_schedule(params: {
  tenantId: string;
  campaignId: string;
  name: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  action: 'ACTIVATE' | 'PAUSE';
  timezone?: string;
}) {
  const schedule = await prisma.adSchedule.create({
    data: {
      tenantId: params.tenantId,
      campaignId: params.campaignId,
      name: params.name,
      daysOfWeek: params.daysOfWeek,
      startTime: params.startTime,
      endTime: params.endTime,
      action: params.action,
      timezone: params.timezone || 'America/Mexico_City',
    },
    include: {
      campaign: { select: { name: true } },
    },
  });

  return {
    success: true,
    message: `Programación "${schedule.name}" creada para campaña ${schedule.campaign.name}`,
    schedule,
  };
}

/**
 * Lista las programaciones de un tenant
 */
export async function list_ad_schedules(params: { tenantId: string; campaignId?: string }) {
  const where: any = { tenantId: params.tenantId };
  if (params.campaignId) where.campaignId = params.campaignId;

  const schedules = await prisma.adSchedule.findMany({
    where,
    include: { campaign: { select: { name: true, platform: { select: { platform: true } } } } },
    orderBy: { createdAt: 'desc' },
  });

  return { schedules, total: schedules.length };
}

/**
 * Activa o desactiva una programación
 */
export async function toggle_ad_schedule(params: { tenantId: string; scheduleId: string; enabled: boolean }) {
  const schedule = await prisma.adSchedule.update({
    where: { id: params.scheduleId },
    data: { enabled: params.enabled },
  });

  return {
    success: true,
    message: `Programación "${schedule.name}" ${params.enabled ? 'activada' : 'desactivada'}`,
    schedule,
  };
}

/**
 * Elimina una programación
 */
export async function delete_ad_schedule(params: { tenantId: string; scheduleId: string }) {
  const schedule = await prisma.adSchedule.findUnique({ where: { id: params.scheduleId } });
  if (!schedule) throw new Error('Programación no encontrada');

  await prisma.adSchedule.delete({ where: { id: params.scheduleId } });

  return {
    success: true,
    message: `Programación "${schedule.name}" eliminada`,
  };
}

/**
 * Crea un test A/B
 */
export async function create_ab_test(params: {
  tenantId: string;
  campaignId: string;
  name: string;
  description?: string;
  metric: string;
  variants: Array<{ label: string; adSetId?: string; adId?: string; trafficAllocation?: number }>;
  autoDeclare?: boolean;
}) {
  const test = await prisma.adABTest.create({
    data: {
      tenantId: params.tenantId,
      campaignId: params.campaignId,
      name: params.name,
      description: params.description || null,
      metric: params.metric,
      status: 'DRAFT',
      significanceThreshold: 0.95,
      trafficSplit: 'FIFTY_FIFTY',
      autoDeclare: params.autoDeclare || false,
    },
  });

  for (const v of params.variants) {
    await prisma.adABTestVariant.create({
      data: {
        abTestId: test.id,
        label: v.label,
        adSetId: v.adSetId || null,
        adId: v.adId || null,
        trafficAllocation: v.trafficAllocation || null,
      },
    });
  }

  const fullTest = await prisma.adABTest.findUnique({
    where: { id: test.id },
    include: { variants: true, campaign: { select: { name: true } } },
  });

  return {
    success: true,
    message: `Test A/B "${fullTest?.name}" creado con ${params.variants.length} variantes`,
    test: fullTest,
  };
}

/**
 * Inicia un test A/B (cambia estado a RUNNING)
 */
export async function start_ab_test(params: { tenantId: string; testId: string }) {
  const test = await prisma.adABTest.update({
    where: { id: params.testId },
    data: { status: 'RUNNING', startDate: new Date() },
  });

  return {
    success: true,
    message: `Test A/B "${test.name}" iniciado`,
    test,
  };
}

/**
 * Calcula la significancia estadística de un test A/B
 */
export async function calculate_ab_test_significance(params: { tenantId: string; testId: string }) {
  const result = await calculateSignificance(params.testId);

  return {
    success: true,
    significance: result,
    message: result.significant
      ? `El test tiene significancia estadística (p=${result.pValue.toFixed(3)}). Variante ganadora: ${result.winnerLabel}`
      : `El test aún no alcanza significancia (p=${result.pValue.toFixed(3)}, umbral=${result.confidence.toFixed(3)})`,
  };
}

/**
 * Declara un ganador en un test A/B
 */
export async function declare_ab_test_winner(params: { tenantId: string; testId: string; variantId?: string }) {
  const result = await declareWinner(params.testId, params.variantId);

  return {
    success: true,
    message: `Ganador declarado: variante ${result.winnerLabel}`,
    result,
  };
}
