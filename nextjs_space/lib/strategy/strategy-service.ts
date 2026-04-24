import { prisma } from '@/lib/db';
import { subMonths, startOfMonth, endOfMonth, addMonths } from 'date-fns';

export class StrategyService {
  /**
   * Ejecuta el Profitability Sniffer para un tenant
   * Cruza horas de soporte, facturación y costes para detectar rentabilidad
   */
  static async runProfitabilitySniffer(tenantId: string, months: number = 3) {
    const startDate = startOfMonth(subMonths(new Date(), months));
    
    // 1. Obtener todos los clientes (leads/deals convertidos) o entidades
    // Para simplificar, analizaremos por Proyecto y por Cliente
    const projects = await prisma.project.findMany({
      where: { tenantId },
      include: { 
        tasks: true // Asumiendo que las tareas tienen horas o vinculación
      }
    });

    const results = [];

    for (const project of projects) {
      // Obtener facturación vinculada al proyecto (asumiendo relación en Invoice)
      const invoices = await prisma.invoice.findMany({
        where: { tenantId, entityId: project.id, entityType: 'PROJECT', status: 'PAID' }
      });
      const revenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

      // Obtener tickets de soporte vinculados al proyecto
      const tickets = await prisma.supportTicket.findMany({
        where: { tenantId, entityId: project.id, entityType: 'PROJECT' },
        include: { timeline: true }
      });

      // Calcular coste operativo (asumiendo un coste por hora de soporte)
      // En un sistema real, mediríamos el tiempo real en el timeline
      const supportHours = tickets.length * 2; // Mock: 2h por ticket
      const hourlyRate = 50; // Mock: 50 USD/h de coste interno
      const operationalCost = supportHours * hourlyRate;

      // Otros costes (asumiendo que hay gastos vinculados)
      const expenses = await prisma.expense.findMany({
        where: { tenantId, entityId: project.id, entityType: 'PROJECT' }
      });
      const directCosts = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

      const margin = revenue - directCosts - operationalCost;
      const roi = directCosts + operationalCost > 0 ? (margin / (directCosts + operationalCost)) * 100 : 0;

      // Calcular Score de Rentabilidad (0-100)
      let score = 50; // Base
      if (margin > 0) score += 20;
      if (roi > 20) score += 20;
      if (tickets.length > 10) score -= 15; // Penalizar exceso de soporte

      const record = await prisma.profitabilityRecord.create({
        data: {
          tenantId,
          entityType: 'PROJECT',
          entityId: project.id,
          revenue,
          directCosts,
          operationalCost,
          margin,
          roi,
          score: Math.min(100, Math.max(0, score)),
          period: `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`,
          recommendation: score < 40 ? 'ALERTA: Este proyecto consume excesivos recursos de soporte. Evaluar renegociación de contrato.' : 'Proyecto saludable.'
        }
      });

      results.push(record);
    }

    return results;
  }

  /**
   * Genera Proyecciones de Cashflow (30, 60, 90 días)
   */
  static async generateCashflowProjections(tenantId: string) {
    const projections = [];
    const horizons = [30, 60, 90];
    
    // Obtener balance actual (asumiendo tabla FinancialSummary o similar)
    const currentBalance = 50000; // Mock

    for (const days of horizons) {
      const targetDate = addMonths(new Date(), Math.floor(days / 30));
      
      // Facturación esperada (basada en deals en pipeline con fecha de cierre estimada)
      const pendingDeals = await prisma.deal.findMany({
        where: { tenantId, status: 'OPEN', expectedCloseDate: { lte: targetDate } }
      });
      const expectedInflow = pendingDeals.reduce((sum, d) => sum + (d.value || 0) * (d.probability || 0.5), 0);

      // Gastos recurrentes (Nóminas, etc.)
      const payrolls = await prisma.employee.findMany({ where: { tenantId } });
      const monthlyPayroll = payrolls.reduce((sum, e) => sum + (e.salary || 0), 0);
      const expectedOutflow = monthlyPayroll * (days / 30);

      const netBalance = currentBalance + expectedInflow - expectedOutflow;

      const projection = await prisma.cashflowProjection.create({
        data: {
          tenantId,
          targetDate,
          expectedInflow,
          expectedOutflow,
          netBalance,
          riskLevel: netBalance < 0 ? 'HIGH' : (netBalance < currentBalance * 0.5 ? 'MEDIUM' : 'LOW'),
          confidence: 0.75,
          metadata: {
            dealCount: pendingDeals.length,
            payrollBase: monthlyPayroll
          }
        }
      });

      projections.push(projection);
    }

    return projections;
  }

  /**
   * Genera alertas estratégicas mediante Gemma
   */
  static async generateStrategicAlerts(tenantId: string) {
    // Aquí llamaríamos a Gemma con el contexto de Profitability y Cashflow
    // Por ahora creamos una alerta de ejemplo
    return await prisma.executiveAlert.create({
      data: {
        tenantId,
        severity: 'WARNING',
        category: 'PROFITABILITY',
        message: 'Se han detectado 3 proyectos con margen negativo debido a un pico de incidencias en Taskforce.',
        actionLink: '/dashboard/strategy/profitability'
      }
    });
  }
}
