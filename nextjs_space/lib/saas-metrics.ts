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
  /** Tasa guardada en el snapshot; null si la fila es anterior a la unificación. */
  churnRate: number | null;
  newCustomers: number;
  trialConversionRate: number;
}

/** Fila mínima de `saas_metrics` que necesita el histórico. */
export interface FilaHistorialMetricas {
  date: Date;
  mrr: number;
  arr: number;
  activeCustomers: number;
  churnRate: number | null;
  newCustomers: number;
  trialConversionRate: number;
}

/**
 * Histórico con la tasa guardada en el snapshot.
 *
 * Antes se recalculaba aquí como `churnedCustomers / activeCustomers`, una
 * segunda fórmula de churn que no coincidía con la definición única. Ahora la
 * tasa la escribe `recordMetrics` con `calcularVentanaChurn` y esta función
 * solo la transporta.
 */
export function mapearHistorialMetricas(filas: FilaHistorialMetricas[]): MetricHistoryItem[] {
  return filas.map((m) => ({
    date: m.date.toISOString().split('T')[0],
    mrr: m.mrr,
    arr: m.arr,
    activeCustomers: m.activeCustomers,
    churnRate: m.churnRate,
    newCustomers: m.newCustomers,
    trialConversionRate: m.trialConversionRate,
  }));
}

// Los estados de baja viven en `tenant-estado`, junto con el sellado de la
// fecha correspondiente.
export { ESTADOS_DE_BAJA } from './tenant-estado';

export interface VentanaChurn {
  desde: Date;
  hasta: Date;
  /** Cuentas que eran clientes al empezar la ventana. */
  base: number;
  /** Cuentas que causaron baja dentro de la ventana. */
  bajas: number;
  /** Porcentaje de bajas sobre la base; null si no había base que medir. */
  tasa: number | null;
}

/** Churn = bajas del periodo / cuentas al inicio del periodo. */
export function calcularTasaChurn(base: number, bajas: number): number {
  if (base <= 0) return 0;
  return (bajas / base) * 100;
}

/**
 * ─── Definición única de churn de la plataforma ────────────────────────────
 *
 * Se mide sobre cuentas (`Tenant`), que es donde viven el estado comercial y
 * el MRR. La tabla `Subscription` no se mantiene en producción: calcularlo ahí
 * daría otro número para el mismo concepto.
 *
 * La fecha que manda es `Tenant.fechaBaja`, escrita solo al entrar en un estado
 * de baja (ver `datosCambioEstado` en `lib/tenant-estado.ts`). No se usa
 * `fechaActualizacion`: ese campo cambia con cualquier edición de la cuenta y
 * movería una baja de periodo.
 *
 *   base  = cuentas creadas antes de `desde` que seguían siendo clientes al
 *           empezar la ventana: sin fecha de baja, o con una posterior al
 *           inicio (estaban vivas al comenzar).
 *   bajas = cuentas con `fechaBaja` dentro de [desde, hasta].
 *   tasa  = bajas / base × 100, con null cuando no hay base.
 *
 * La consumen `/admin/saas` (KPIs), `/admin/saas/churn` (radar y evolución
 * mensual), `/api/admin/saas-metrics` y `/api/admin/analytics`.
 */
export async function calcularVentanaChurn(desde: Date, hasta: Date): Promise<VentanaChurn> {
  const [base, bajas] = await Promise.all([
    globalPrisma.tenant.count({
      where: {
        fechaCreacion: { lt: desde },
        OR: [{ fechaBaja: null }, { fechaBaja: { gte: desde } }],
      },
    }),
    globalPrisma.tenant.count({
      where: { fechaBaja: { gte: desde, lte: hasta } },
    }),
  ]);

  return {
    desde,
    hasta,
    base,
    bajas,
    tasa: base > 0 ? calcularTasaChurn(base, bajas) : null,
  };
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
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const ventana = await calcularVentanaChurn(desde, hasta);
    return ventana.tasa ?? 0;
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
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const ventana = await calcularVentanaChurn(desde, hasta);
    return ventana.bajas;
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
    // Snapshot con la definición única de churn: se guardan la tasa y su base,
    // no una tasa recalculable a posteriori con otra fórmula.
    const hastaChurn = new Date();
    const desdeChurn = new Date(hastaChurn.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ventanaChurn = await calcularVentanaChurn(desdeChurn, hastaChurn);
    const churnedCustomers = ventanaChurn.bajas;
    const churnRate = ventanaChurn.tasa;
    const churnBase = ventanaChurn.base;
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
        churnRate,
        churnBase,
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
        churnRate,
        churnBase,
        expansionRevenue,
        contractionRevenue,
        trialConversions,
        trialStarts,
        trialConversionRate
      }
    });

    return {
      ...(metrics as any),
      churnRate: churnRate ?? 0,
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

    return mapearHistorialMetricas(metrics);
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
      // La tasa del snapshot ya viene de la definición única; se recalcula solo
      // si la fila es anterior a la unificación.
      const churnRate = todayMetrics.churnRate ?? (await this.calculateChurnRate());
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