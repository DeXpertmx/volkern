import { prisma } from '@/lib/db';
import { skillsLogger, trackSkillExecution } from './observability';
import { eventBus, EVENTS } from './event-bus';

/**
 * ERP Project Skills
 */

/**
 * Calcular Rentabilidad Operativa del Proyecto
 */
export async function getProjectProfitability(input: { tenantId: string, projectId: string }) {
  return await trackSkillExecution('get_project_profitability', async () => {
    const { tenantId, projectId } = input;

    // 1. Obtener Ingresos (Invoices pagadas vinculadas al Lead/Proyecto a través del Lead)
    // Nota: En una versión más avanzada, vinculamos Invoices directamente al Proyecto.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        lead: {
          include: {
             invoices: { where: { estado: 'pagada' } }
          }
        }
      }
    });

    if (!project) throw new Error('Proyecto no encontrado');

    const totalIncome = project.lead?.invoices.reduce((acc, inv) => acc + inv.monto, 0) || 0;

    // 2. Obtener Gastos Directos
    const expenses = await prisma.expense.aggregate({
      where: { tenantId, projectId, status: 'PAID' },
      _sum: { amount: true }
    });

    const totalExpenses = expenses._sum.amount || 0;

    // 3. Obtener Costo de Materiales (Inventario)
    // Nota: Necesitaríamos guardar el costo unitario en StockMovement para precisión total.
    // Usamos el precioBase del CatalogoItem como proxy de costo por ahora.
    const movements = await prisma.stockMovement.findMany({
      where: { tenantId, projectId, type: 'OUT' },
      include: { catalogoItem: { select: { precioBase: true } } }
    });

    const materialCosts = movements.reduce((acc, mov) => acc + (mov.quantity * (mov.catalogoItem?.precioBase || 0)), 0);

    const totalCost = totalExpenses + materialCosts;
    const netProfit = totalIncome - totalCost;
    const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    return {
      projectId,
      totalIncome,
      totalExpenses,
      materialCosts,
      totalCost,
      netProfit,
      margin: parseFloat(margin.toFixed(2)),
      status: margin < 10 ? 'CRITICAL' : margin < 25 ? 'WARNING' : 'HEALTHY'
    };
  });
}

/**
 * Análisis Proactivo de Desviación (IA Gemma 4)
 */
export async function detectProjectDrifting(input: { tenantId: string, projectId: string }) {
  return await trackSkillExecution('detect_project_drifting', async () => {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      include: { milestones: true }
    });

    if (!project) throw new Error('Proyecto no encontrado');

    const delayedMilestones = project.milestones.filter(m => 
      m.status !== 'COMPLETED' && m.dueDate && new Date(m.dueDate) < new Date()
    );

    const profitability = await getProjectProfitability(input);
    
    let driftLevel = 'LOW';
    let recommendation = "El proyecto avanza según lo planeado.";

    if (delayedMilestones.length > 0) {
      driftLevel = 'MEDIUM';
      recommendation = `Hay ${delayedMilestones.length} hitos retrasados. Se recomienda reasignar recursos.`;
    }

    if (profitability.margin < 15) {
      driftLevel = 'HIGH';
      recommendation = "Alerta: El margen operativo es peligrosamente bajo. Revisa costos directos.";
    }

    return {
      projectId: input.projectId,
      driftLevel,
      delayedMilestonesCount: delayedMilestones.length,
      currentMargin: profitability.margin,
      recommendation
    };
  });
}
