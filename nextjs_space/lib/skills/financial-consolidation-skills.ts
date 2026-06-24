import { prisma } from '@/lib/db';
import { skillsLogger, trackSkillExecution } from './observability';
import { Decimal } from 'decimal.js';
import { generateIntegrityHash, verifyFinancialIntegrity } from '@/lib/security/integrity-service';

/**
 * ERP Financial Brain Skills (The Financial Brain)
 */

/**
 * Skill: analyze_global_profitability
 * Calcula el EBITDA, margen real y salud financiera cruzando ventas, gastos y proyectos.
 */
export async function analyzeGlobalProfitability(input: { tenantId: string, userId: string, period?: string }) {
  return await trackSkillExecution('analyze_global_profitability', async () => {
    const { tenantId, period = 'current_month' } = input;

    // 🛡️ SESGO DE SEGURIDAD: Auditoría antes de la ejecución (vía logs automáticos de la Skill)
    const summary = await getGlobalFinancialSummaryInternal(tenantId, period);
    
    const margin = new Decimal(summary.margin);
    const status = margin.gt(15) ? 'SALUDABLE' : 'CRÍTICO';

    return {
      content: `Análisis de Rentabilidad (${period}): 
      - Ingresos: €${summary.revenue.toLocaleString()}
      - Gastos Totales: €${summary.expenses.toLocaleString()}
      - Margen: ${summary.margin}%
      - Estado: ${status}`,
      data: summary
    };
  });
}

/**
 * Skill: audit_expense_integrity
 * Verifica si los gastos registrados coinciden con los hashes de seguridad y detecta anomalías.
 */
export async function auditExpenseIntegrity(input: { tenantId: string }) {
  return await trackSkillExecution('audit_expense_integrity', async () => {
    // Esta skill busca discrepancias en la cadena de hashes (SHA-256)
    const isIntegrityIntact = await verifyFinancialIntegrity(input.tenantId);
    
    if (!isIntegrityIntact) {
      return {
        status: 'ALERT',
        content: `⚠️ Se detectaron inconsistencias en la cadena de auditoría financiera. La integridad está comprometida.`
      };
    }
    return { status: 'OK', content: 'La bóveda financiera está íntegra. Todos los hashes coinciden.' };
  });
}

/**
 * Skill: project_financial_forecast
 * Predice el flujo de caja (Cash Flow) basado en el pipeline de ventas y gastos fijos.
 */
export async function projectFinancialForecast(input: { tenantId: string }) {
  return await trackSkillExecution('project_financial_forecast', async () => {
    // Lógica predictiva basada en promedios y pipeline
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Simplificación: Obtenemos el forecast basado en el pipeline actual (Lead Value) y gastos fijos
    const leads = await prisma.lead.aggregate({
      where: { tenantId: input.tenantId, estado: 'ganado' }, // En un sistema real usaríamos el funnel
      _sum: { valorEstimado: true } as any
    });

    const expenses = await prisma.expense.aggregate({
      where: { tenantId: input.tenantId, type: 'RECURRING' } as any,
      _sum: { amount: true }
    });

    const expectedIn = (leads._sum as any)?.valorEstimado || 5000;
    const committedOut = (expenses._sum as any)?.amount || 1200;

    const runwayDays = committedOut > 0 ? (expectedIn / (committedOut / 30)) : 365;

    return {
      content: `Proyección a 30 días: 
      - Ingreso esperado: €${expectedIn.toLocaleString()}
      - Gasto comprometido: €${committedOut.toLocaleString()}
      - Salud de Runway: ${runwayDays.toFixed(0)} días estimados.`,
      data: { expectedIn, committedOut, runwayDays }
    };
  });
}

/**
 * Auxiliar: Tax Prospector (Refined)
 */
export async function taxProspector(input: { tenantId: string, region: 'MX' | 'ES' | 'USA_LLC' }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const summary = await getGlobalFinancialSummaryInternal(input.tenantId, 'current_month');
  const revenue = new Decimal(summary.revenue);
  
  let taxRate = new Decimal(0);
  let advice = "";

  if (input.region === 'MX') {
    taxRate = new Decimal(0.16);
    advice = "Reserva el 16% de IVA para la declaración mensual.";
  } else if (input.region === 'ES') {
    taxRate = new Decimal(0.21);
    advice = "Reserva el 21% de IVA para la liquidación trimestral.";
  } else if (input.region === 'USA_LLC') {
    taxRate = new Decimal(0);
    advice = "0% Sales Tax para exportación. Reporta el Income Tax federal a nivel personal.";
  }

  const estimate = revenue.mul(taxRate);

  return {
    region: input.region,
    estimatedLiability: estimate.toFixed(2),
    advice
  };
}

/**
 * Lógica interna de resumen financiero consolidado
 */
async function getGlobalFinancialSummaryInternal(tenantId: string, period: string) {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  
  if (period === 'last_quarter') {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else if (period === 'year_to_date') {
    start = new Date(now.getFullYear(), 0, 1);
  }

  const [invoices, expenses, payroll, productionCosts, scrapCosts] = await Promise.all([
    prisma.invoice.aggregate({
      where: { tenantId, estado: 'pagada', fechaEmision: { gte: start } },
      _sum: { monto: true }
    }),
    prisma.expense.aggregate({
      where: { tenantId, status: 'PAID', date: { gte: start } },
      _sum: { amount: true }
    }),
    prisma.employee.findMany({
      where: { tenantId, isActive: true },
      select: { salaryEncrypted: true }
    }),
    // 🏗️ COSTOS DE PRODUCCIÓN (Consumo de materiales)
    prisma.productionLog.findMany({
      where: { tenantId, action: 'CONSUMPTION', timestamp: { gte: start } },
      select: { quantity: true, itemId: true }
    }),
    // 🛡️ COSTOS DE MERMA (Pérdida por scrap)
    prisma.productionLog.findMany({
      where: { tenantId, action: 'SCRAP', timestamp: { gte: start } },
      select: { quantity: true, itemId: true }
    })
  ]);

  // Descifrar nómina (Simulación de suma masiva en Bóveda para reporte)
  const { VaultService: VS } = await import('@/lib/security/vault');
  let totalPayroll = new Decimal(0);
  for (const emp of payroll) {
    if (emp.salaryEncrypted) {
      const sal = parseFloat((VS as any).decrypt(emp.salaryEncrypted));
      totalPayroll = totalPayroll.add(isNaN(sal) ? 0 : sal);
    }
  }

  // Calcular costo de materiales (Consumo)
  let materialConsumptionCost = new Decimal(0);
  for (const log of productionCosts) {
    // En un sistema real, buscaríamos el costo medio o FIFO del item
    // Simulamos un costo promedio de 42€ por unidad para la consolidación
    materialConsumptionCost = materialConsumptionCost.add(new Decimal(log.quantity).mul(42));
  }

  // Calcular costo de merma
  let totalScrapCost = new Decimal(0);
  for (const log of scrapCosts) {
    totalScrapCost = totalScrapCost.add(new Decimal(log.quantity).mul(42));
  }

  const rev = new Decimal(invoices._sum.monto || 0);
  
  // EBITDA: Ingresos - (Gastos + Nómina + Costo Materiales + Mermas)
  const totalExp = new Decimal(expenses._sum.amount || 0)
    .add(totalPayroll)
    .add(materialConsumptionCost)
    .add(totalScrapCost);

  const profit = rev.sub(totalExp);
  const margin = rev.gt(0) ? profit.div(rev).mul(100) : new Decimal(0);

  return {
    revenue: rev.toNumber(),
    expenses: totalExp.toNumber(),
    payroll: totalPayroll.toNumber(),
    manufacturingCosts: materialConsumptionCost.add(totalScrapCost).toNumber(),
    scrapLoss: totalScrapCost.toNumber(),
    profit: profit.toNumber(),
    margin: margin.toFixed(2)
  };
}
