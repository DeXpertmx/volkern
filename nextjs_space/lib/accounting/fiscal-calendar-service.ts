import { prisma } from '@/lib/db';
import { notificationService } from '@/lib/skills/notification-layer';
import { skillsLogger } from '@/lib/skills/observability';
import { TaxType } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FiscalModelDeadline {
  model: string;            // '303', '111', '130', '349', '347', '390'
  name: string;             // 'IVA Trimestral'
  type: 'quarterly' | 'annual' | 'monthly';
  quarter?: number;         // 1-4 para trimestrales
  year: number;
  dueDate: Date;            // Fecha exacta de vencimiento
  periodLabel: string;      // 'T1 2026', 'Anual 2026'
  status: 'pending' | 'notified' | 'filed' | 'overdue';
  daysUntilDue: number;     // Días hasta vencimiento (negativo si vencido)
  estimatedAmount?: number; // Estimación del importe a declarar (desde TaxRecord)
}

export interface FiscalCalendarSummary {
  today: Date;
  upcomingDeadlines: FiscalModelDeadline[];
  overdueDeadlines: FiscalModelDeadline[];
  nextDeadline: FiscalModelDeadline | null;
  totalPending: number;
  totalOverdue: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class FiscalCalendarService {
  /**
   * Plazos estándar de cada modelo fiscal en España.
   * Base legal: Orden HAC/1177/2024, Ley General Tributaria, RD 1065/2007
   * 
   * Trimestres: 
   *   Q1 = enero-marzo, Q2 = abril-junio, Q3 = julio-septiembre, Q4 = octubre-diciembre
   * 
   * Modelo 303 (IVA): 20 abril, 20 julio, 20 octubre, 30 enero
   * Modelo 111 (IRPF retenciones): 20 abril, 20 julio, 20 octubre, 30 enero  
   * Modelo 130 (IRPF estimación directa): 20 abril, 20 julio, 20 octubre, 30 enero
   * Modelo 349 (IVA intracomunitario): 30 abril, 30 julio, 30 octubre, 30 enero
   * Modelo 347 (Operaciones terceros): 31 marzo (anual)
   * Modelo 390 (IVA anual): 30 enero (anual, resumen anual IVA)
   */
  static readonly MODELS: Record<string, {
    name: string;
    description: string;
    type: 'quarterly' | 'annual';
    dueDayMonth: Record<number, { day: number; month: number }>; // quarter => {day, month}
    annualDueDayMonth?: { day: number; month: number };          // Para modelos anuales
    taxType?: TaxType;                                            // Tipo de TaxRecord relacionado
  }> = {
    '303': {
      name: 'IVA Trimestral',
      description: 'Declaración-liquidación trimestral del IVA',
      type: 'quarterly',
      dueDayMonth: {
        1: { day: 20, month: 4 },   // Abril
        2: { day: 20, month: 7 },   // Julio
        3: { day: 20, month: 10 },  // Octubre
        4: { day: 30, month: 1 },   // Enero (año siguiente)
      },
    },
    '111': {
      name: 'Retenciones IRPF',
      description: 'Declaración trimestral de retenciones e ingresos a cuenta del IRPF',
      type: 'quarterly',
      dueDayMonth: {
        1: { day: 20, month: 4 },
        2: { day: 20, month: 7 },
        3: { day: 20, month: 10 },
        4: { day: 30, month: 1 },
      },
    },
    '130': {
      name: 'IRPF Estimación Directa',
      description: 'Pago fraccionado del IRPF para autónomos en estimación directa',
      type: 'quarterly',
      dueDayMonth: {
        1: { day: 20, month: 4 },
        2: { day: 20, month: 7 },
        3: { day: 20, month: 10 },
        4: { day: 30, month: 1 },
      },
    },
    '349': {
      name: 'IVA Intracomunitario',
      description: 'Declaración recapitulativa de operaciones intracomunitarias',
      type: 'quarterly',
      dueDayMonth: {
        1: { day: 30, month: 4 },
        2: { day: 30, month: 7 },
        3: { day: 30, month: 10 },
        4: { day: 30, month: 1 },
      },
    },
    '347': {
      name: 'Operaciones Terceros',
      description: 'Declaración anual de operaciones con terceras personas',
      type: 'annual',
      annualDueDayMonth: { day: 31, month: 3 },
    },
    '390': {
      name: 'IVA Anual',
      description: 'Declaración-resumen anual del IVA',
      type: 'annual',
      annualDueDayMonth: { day: 30, month: 1 },
    },
  };

  /**
   * Calcula el año fiscal para un trimestre.
   * Para Q4 (octubre-diciembre), el año de vencimiento es el siguiente.
   */
  private static getDueYear(year: number, quarter: number): number {
    if (quarter === 4) {
      return year + 1; // Q4 vence en enero del año siguiente
    }
    return year;
  }

  /**
   * Calcula todas las deadlines para un año y trimestre dado.
   */
  static getDeadlinesForPeriod(year: number, quarter?: number): FiscalModelDeadline[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlines: FiscalModelDeadline[] = [];

    // Modelos trimestrales
    const quarterlyModels = ['303', '111', '130', '349'];
    const quartersToCheck = quarter ? [quarter] : [1, 2, 3, 4];

    for (const modelId of quarterlyModels) {
      const model = this.MODELS[modelId];
      for (const q of quartersToCheck) {
        const dueMap = model.dueDayMonth[q];
        const dueYear = this.getDueYear(year, q);
        const dueDate = new Date(dueYear, dueMap.month - 1, dueMap.day);
        
        // Si la fecha ya pasó y es Q1, también verificar año anterior para modelos pendientes
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // No incluir deadlines demasiado antiguas (más de 90 días pasados)
        if (diffDays < -90) continue;
        
        deadlines.push({
          model: modelId,
          name: model.name,
          type: 'quarterly',
          quarter: q,
          year,
          dueDate,
          periodLabel: `T${q} ${year}`,
          status: diffDays < 0 ? 'overdue' : 'pending',
          daysUntilDue: diffDays,
        });
      }
    }

    // Modelo 347 (anual - vence 31 marzo)
    const model347 = this.MODELS['347'];
    const due347 = new Date(year + 1, model347.annualDueDayMonth!.month - 1, model347.annualDueDayMonth!.day);
    const diff347 = Math.ceil((due347.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff347 >= -90) {
      deadlines.push({
        model: '347',
        name: model347.name,
        type: 'annual',
        year,
        dueDate: due347,
        periodLabel: `Anual ${year}`,
        status: diff347 < 0 ? 'overdue' : 'pending',
        daysUntilDue: diff347,
      });
    }

    // Modelo 390 (anual - vence 30 enero)
    const model390 = this.MODELS['390'];
    const due390 = new Date(year + 1, model390.annualDueDayMonth!.month - 1, model390.annualDueDayMonth!.day);
    const diff390 = Math.ceil((due390.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff390 >= -90) {
      deadlines.push({
        model: '390',
        name: model390.name,
        type: 'annual',
        year,
        dueDate: due390,
        periodLabel: `Anual ${year}`,
        status: diff390 < 0 ? 'overdue' : 'pending',
        daysUntilDue: diff390,
      });
    }

    // Ordenar por fecha
    deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return deadlines;
  }

  /**
   * Obtiene el resumen completo del calendario fiscal para un tenant.
   * Incluye estimaciones de importes desde TaxRecord cuando hay datos.
   */
  static async getCalendarSummary(
    tenantId: string,
    year?: number
  ): Promise<FiscalCalendarSummary> {
    const currentYear = year || new Date().getFullYear();
    const deadlines = this.getDeadlinesForPeriod(currentYear);

    // Enriquecer con datos reales del tenant
    const enrichedDeadlines = await this.enrichWithTenantData(tenantId, deadlines);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcomingDeadlines = enrichedDeadlines.filter(d => d.daysUntilDue >= 0 && d.daysUntilDue <= 90);
    const overdueDeadlines = enrichedDeadlines.filter(d => d.daysUntilDue < 0 && d.daysUntilDue >= -90);
    const nextDeadline = upcomingDeadlines.length > 0 ? upcomingDeadlines[0] : null;

    return {
      today: now,
      upcomingDeadlines,
      overdueDeadlines,
      nextDeadline,
      totalPending: enrichedDeadlines.filter(d => d.status === 'pending').length,
      totalOverdue: enrichedDeadlines.filter(d => d.status === 'overdue').length,
    };
  }

  /**
   * Enriquece las deadlines con datos reales del tenant (importes, estado filed).
   */
  private static async enrichWithTenantData(
    tenantId: string,
    deadlines: FiscalModelDeadline[]
  ): Promise<FiscalModelDeadline[]> {
    return Promise.all(
      deadlines.map(async (deadline) => {
        // Estimar importe desde TaxRecord según el modelo
        let estimatedAmount: number | undefined;
        let isFiled = false;

        if (deadline.model === '303' && deadline.quarter) {
          const months = this.getMonthsForQuarter(deadline.quarter);
          const records = await prisma.taxRecord.findMany({
            where: {
              tenantId,
              periodYear: deadline.year,
              periodMonth: { in: months },
              type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] },
            },
            select: { taxAmount: true, type: true, isFiled: true },
          });

          let outputVat = 0;
          let inputVat = 0;
          for (const r of records) {
            const amount = Number(r.taxAmount);
            if (r.type === TaxType.IVA_REPERCUTIDO) outputVat += amount;
            else if (r.type === TaxType.IVA_SOPORTADO) inputVat += amount;
            if (r.isFiled) isFiled = true;
          }
          estimatedAmount = outputVat - inputVat;
        }

        if (deadline.model === '111' && deadline.quarter) {
          const months = this.getMonthsForQuarter(deadline.quarter);
          const records = await prisma.taxRecord.findMany({
            where: {
              tenantId,
              periodYear: deadline.year,
              periodMonth: { in: months },
              type: TaxType.IRPF_RETENCION,
            },
            select: { taxAmount: true, isFiled: true },
          });

          let total = 0;
          for (const r of records) {
            total += Number(r.taxAmount);
            if (r.isFiled) isFiled = true;
          }
          estimatedAmount = total;
        }

        return {
          ...deadline,
          estimatedAmount: estimatedAmount && estimatedAmount !== 0 ? Math.abs(estimatedAmount) : undefined,
          status: isFiled ? 'filed' : (deadline.daysUntilDue < 0 ? 'overdue' : deadline.status),
        };
      })
    );
  }

  /**
   * Escanea y envía alertas de vencimientos fiscales próximos.
   * Evita duplicados comprobando si ya se notificó en las últimas 24h.
   */
  static async scanAndNotify(tenantId?: string): Promise<{
    notified: number;
    tenants: number;
  }> {
    skillsLogger.info('[FiscalCalendar] Scanning for upcoming fiscal deadlines...');

    const tenants = tenantId 
      ? await prisma.tenant.findMany({ where: { id: tenantId }, include: { users: { where: { role: 'OWNER' }, take: 1 } } })
      : await prisma.tenant.findMany({ include: { users: { where: { role: 'OWNER' }, take: 1 } } });

    let totalNotified = 0;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const tenant of tenants) {
      const summary = await this.getCalendarSummary(tenant.id);
      const owner = tenant.users[0];
      if (!owner) continue;

      // Comprobar notificaciones recientes para evitar duplicados
      const recentNotifications = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          accion: 'FISCAL_DEADLINE_NOTIFIED',
          fechaCreacion: { gte: twentyFourHoursAgo },
        },
        select: { entidadId: true },
      });
      const alreadyNotified = new Set(recentNotifications.map(n => n.entidadId));

      // Alertar deadlines que vencen en <= 7 días (no notificadas aún)
      const urgentDeadlines = summary.upcomingDeadlines.filter(
        d => d.daysUntilDue <= 7 && d.daysUntilDue >= 0 && d.status === 'pending'
      );

      // Alertar deadlines vencidas
      const overdueDeadlines = summary.overdueDeadlines.filter(
        d => d.status === 'overdue'
      );

      for (const dl of urgentDeadlines) {
        const notifKey = `${dl.model}_${dl.periodLabel}`;
        if (alreadyNotified.has(notifKey)) continue;

        const amountText = dl.estimatedAmount 
          ? ` (${dl.estimatedAmount.toFixed(2)}€ estimados)` : '';

        await notificationService.send(
          { type: 'user', id: owner.id },
          {
            title: `⚠️ Vence ${dl.model} - ${dl.periodLabel}`,
            body: `El Modelo ${dl.model} (${dl.name}) del periodo ${dl.periodLabel} vence en ${dl.daysUntilDue} día(s)${amountText}. Revisa tu contabilidad y prepara la declaración.`,
            actions: [
              {
                label: 'Ver calendario fiscal',
                url: '/dashboard/finanzas/contabilidad/calendario-fiscal',
              },
            ],
          },
          { channel: 'in_app', priority: 'high' },
          { tenantId: tenant.id, source: 'fiscal_calendar', timestamp: new Date(), correlationId: `fiscal-dl-${dl.model}-${dl.periodLabel}` }
        );
        await this.markNotified(tenant.id, dl.model, dl.periodLabel);
        totalNotified++;
      }

      for (const dl of overdueDeadlines) {
        const notifKey = `${dl.model}_${dl.periodLabel}`;
        if (alreadyNotified.has(notifKey)) continue;

        await notificationService.send(
          { type: 'user', id: owner.id },
          {
            title: `🚨 VENCIDO: Modelo ${dl.model} - ${dl.periodLabel}`,
            body: `El Modelo ${dl.model} (${dl.name}) del periodo ${dl.periodLabel} venció hace ${Math.abs(dl.daysUntilDue)} día(s). Regulariza tu situación cuanto antes.`,
            actions: [
              {
                label: 'Ver calendario fiscal',
                url: '/dashboard/finanzas/contabilidad/calendario-fiscal',
              },
            ],
          },
          { channel: 'in_app', priority: 'urgent' },
          { tenantId: tenant.id, source: 'fiscal_calendar', timestamp: new Date(), correlationId: `fiscal-od-${dl.model}-${dl.periodLabel}` }
        );
        await this.markNotified(tenant.id, dl.model, dl.periodLabel);
        totalNotified++;
      }
    }

    skillsLogger.info(`[FiscalCalendar] Scan complete: ${totalNotified} alerts sent across ${tenants.length} tenants`);
    return { notified: totalNotified, tenants: tenants.length };
  }

  /**
   * Marca un modelo como notificado (para evitar duplicados).
   */
  static async markNotified(tenantId: string, model: string, periodLabel: string) {
    // Usamos el AuditLog o una tabla de control para registrar notificaciones
    await prisma.auditLog.create({
      data: {
        tenantId,
        accion: 'FISCAL_DEADLINE_NOTIFIED',
        entidad: 'FISCAL_CALENDAR',
        entidadId: `${model}_${periodLabel}`,
        descripcion: `Notificación enviada para Modelo ${model} - ${periodLabel}`,
        metadata: { model, periodLabel, notifiedAt: new Date().toISOString() },
      },
    });
    return { success: true };
  }

  private static getMonthsForQuarter(quarter: number): number[] {
    switch (quarter) {
      case 1: return [1, 2, 3];
      case 2: return [4, 5, 6];
      case 3: return [7, 8, 9];
      case 4: return [10, 11, 12];
      default: throw new Error('Trimestre no válido');
    }
  }
}
