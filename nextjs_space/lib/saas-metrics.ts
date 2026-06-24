import { globalPrisma } from './db';
import { getPlanConfig } from './subscription';

export interface SaaSMetrics {
  mrr: number;
  arr: number;
  newCustomers: number;
  churnedCustomers: number;
  activeCustomers: number;
  expansionRevenue: number;
  contractionRevenue: number;
  trialConversions: number;
  trialStarts: number;
  trialConversionRate: number;
  churnRate: number;
  date: Date;
  tenantId?: string;
}

export interface MetricHistoryItem {
  date: string;
  mrr: number;
  arr: number;
  activeCustomers: number;
  churnRate: number;
  newCustomers: number;
  trialConversionRate: number;
}

export class SaaSMetricsService {
  static async calculateMRR(tenantId?: string): Promise<number> {
    const whereClause = tenantId 
      ? { tenantId, estado: { in: ['activa', 'trial'] } }
      : { estado: { in: ['activa', 'trial'] } };

    const subscriptions = await globalPrisma.subscription.findMany({
      where: whereClause,
      include: {
        plan: true,
        tenant: { select: { plan: true, mrr: true } }
      }
    });

    let totalMRR = 0;
    for (const sub of subscriptions) {
      const planConfig = await getPlanConfig(sub.tenant.plan || sub.plan.slug);
      totalMRR += planConfig.precio;
    }

    const activeTenants = await globalPrisma.tenant.count({
      where: tenantId ? { id: tenantId, estado: 'activo' } : { estado: 'activo' }
    });

    if (activeTenants > 0 && totalMRR === 0) {
      const tenants = await globalPrisma.tenant.findMany({
        where: tenantId ? { id: tenantId, estado: 'activo' } : { estado: 'activo' },
        select: { mrr: true }
      });
      totalMRR = tenants.reduce((sum, t) => sum + (t.mrr || 0), 0);
    }

    return totalMRR;
  }

  static calculateARR(mrr: number): number {
    return mrr * 12;
  }

  static async calculateChurnRate(periodDays: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    const endDate = new Date();

    const cancelledSubscriptions = await globalPrisma.subscription.count({
      where: {
        estado: 'cancelada',
        fechaCancelacion: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const startCustomers = await globalPrisma.subscription.count({
      where: {
        fechaCreacion: { lt: startDate },
        estado: { in: ['activa', 'trial'] }
      }
    });

    if (startCustomers === 0) return 0;
    return (cancelledSubscriptions / startCustomers) * 100;
  }

  static async calculateActiveCustomers(): Promise<number> {
    return await globalPrisma.tenant.count({
      where: { estado: 'activo' }
    });
  }

  static async calculateNewCustomers(periodDays: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    return await globalPrisma.tenant.count({
      where: {
        fechaCreacion: { gte: startDate },
        estado: { in: ['activo', 'trial'] }
      }
    });
  }

  static async calculateChurnedCustomers(periodDays: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    return await globalPrisma.subscription.count({
      where: {
        estado: 'cancelada',
        fechaCancelacion: { gte: startDate }
      }
    });
  }

  static async calculateExpansionRevenue(periodDays: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const upgadedSubscriptions = await globalPrisma.subscription.findMany({
      where: {
        fechaActualizacion: { gte: startDate },
        metadata: {
          path: ['upgrade'],
          equals: true
        }
      }
    });

    return upgadedSubscriptions.reduce((sum, sub) => {
      const amount = (sub.metadata as any)?.expansionAmount || 0;
      return sum + amount;
    }, 0);
  }

  static async calculateContractionRevenue(periodDays: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const downgradedSubscriptions = await globalPrisma.subscription.findMany({
      where: {
        fechaActualizacion: { gte: startDate },
        metadata: {
          path: ['downgrade'],
          equals: true
        }
      }
    });

    return downgradedSubscriptions.reduce((sum, sub) => {
      const amount = (sub.metadata as any)?.contractionAmount || 0;
      return sum + amount;
    }, 0);
  }

  static async calculateTrialConversionRate(periodDays: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const trialStarts = await globalPrisma.subscription.count({
      where: {
        esTrial: true,
        fechaCreacion: { gte: startDate }
      }
    });

    const trialConversions = await globalPrisma.subscription.count({
      where: {
        esTrial: true,
        fechaInicio: { gte: startDate },
        estado: 'activa'
      }
    });

    if (trialStarts === 0) return 0;
    return (trialConversions / trialStarts) * 100;
  }

  static async recordMetrics(tenantId?: string): Promise<SaaSMetrics> {
    const mrr = await this.calculateMRR(tenantId);
    const arr = this.calculateARR(mrr);
    const activeCustomers = await this.calculateActiveCustomers();
    const newCustomers = await this.calculateNewCustomers();
    const churnedCustomers = await this.calculateChurnedCustomers();
    const churnRate = await this.calculateChurnRate();
    const expansionRevenue = await this.calculateExpansionRevenue();
    const contractionRevenue = await this.calculateContractionRevenue();
    const trialConversions = await globalPrisma.subscription.count({
      where: {
        esTrial: true,
        estado: 'activa',
        fechaInicio: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    });
    const trialStarts = await globalPrisma.subscription.count({
      where: {
        esTrial: true,
        fechaCreacion: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    });
    const trialConversionRate = trialStarts > 0 ? (trialConversions / trialStarts) * 100 : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const metrics = await (globalPrisma as any).saaSMetric.upsert({
      where: {
        tenantId_date: {
          tenantId: tenantId || 'global',
          date: today
        }
      },
      update: {
        mrr,
        arr,
        newCustomers,
        churnedCustomers,
        activeCustomers,
        expansionRevenue,
        contractionRevenue,
        trialConversions,
        trialStarts,
        trialConversionRate
      },
      create: {
        tenantId: tenantId || 'global',
        date: today,
        mrr,
        arr,
        newCustomers,
        churnedCustomers,
        activeCustomers,
        expansionRevenue,
        contractionRevenue,
        trialConversions,
        trialStarts,
        trialConversionRate
      }
    });

    return {
      ...(metrics as any),
      churnRate,
      date: (metrics as any).date
    } as SaaSMetrics;
  }

  static async getMetricsHistory(periodDays: number = 30): Promise<MetricHistoryItem[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const metrics = await globalPrisma.saaSMetric.findMany({
      where: {
        date: { gte: startDate },
        tenantId: 'global'
      },
      orderBy: { date: 'asc' }
    });

    return metrics.map(m => ({
      date: m.date.toISOString().split('T')[0],
      mrr: m.mrr,
      arr: m.arr,
      activeCustomers: m.activeCustomers,
      churnRate: m.churnedCustomers / (m.activeCustomers || 1) * 100,
      newCustomers: m.newCustomers,
      trialConversionRate: m.trialConversionRate
    }));
  }

  static async getCurrentMetrics(): Promise<SaaSMetrics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMetrics = await globalPrisma.saaSMetric.findFirst({
      where: {
        tenantId: 'global',
        date: { gte: today }
      }
    });

    if (todayMetrics) {
      const churnRate = await this.calculateChurnRate();
      return { ...todayMetrics, churnRate, date: todayMetrics.date } as SaaSMetrics;
    }

    return await this.recordMetrics();
  }

  static calculateLTV(averageRevenue: number, churnRate: number): number {
    if (churnRate === 0) return 0;
    return averageRevenue / (churnRate / 100);
  }

  static calculateCAC(totalMarketingSpend: number, newCustomers: number): number {
    if (newCustomers === 0) return 0;
    return totalMarketingSpend / newCustomers;
  }

  static async createSnapshot(): Promise<void> {
    const currentMetrics = await this.getCurrentMetrics();

    await (globalPrisma as any).saaSMetricSnapshot.create({
      data: {
        date: new Date(),
        metrics: currentMetrics,
        generatedAt: new Date()
      }
    });
  }

  static async getSnapshots(limit: number = 30): Promise<any[]> {
    return await globalPrisma.saaSMetricSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: limit
    });
  }
}