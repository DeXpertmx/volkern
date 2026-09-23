import { prisma } from '@/lib/db';
import { skillsLogger, trackSkillExecution } from './observability';
import { Decimal } from 'decimal.js';
import { generateIntegrityHash, verifyFinancialIntegrity } from '@/lib/security/integrity-service';
import { formatearImporte, MONEDA_MINIMA_ESQUEMA } from '@/lib/moneda';
import { fxConvert } from '@/lib/insurance/currency';

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

    // El resumen viaja a la interfaz: la divisa es la del tenant, no un euro fijo.
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { moneda: true } });
    const moneda = tenant?.moneda || MONEDA_MINIMA_ESQUEMA;

    const margin = new Decimal(summary.margin);
    // Sin ingresos ni gastos no hay salud que juzgar: llamar CRÍTICO a un periodo
    // sin movimientos es alarmar con datos que no existen.
    const sinMovimientos = !summary.revenue && !summary.expenses;
    const status = sinMovimientos ? 'SIN DATOS' : margin.gt(15) ? 'SALUDABLE' : 'CRÍTICO';

    return {
      content: `Análisis de Rentabilidad (${period}): \n      - Ingresos: ${formatearImporte(summary.revenue, moneda)}\n      - Gastos Totales: ${formatearImporte(summary.expenses, moneda)}\n      - Margen: ${summary.margin}%\n      - Estado: ${status}`,
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
 *
 * Las dos consultas que sostenían esto pedían campos que no existen en el
 * esquema (`Lead.valorEstimado` y `Expense.type`), así que la habilidad lanzaba
 * en cada llamada y con ella el cockpit financiero. Ahora sale de datos reales:
 * el pipeline activo de Deals —valor convertido a la divisa del tenant y
 * ponderado por la probabilidad de su etapa— y el gasto mensual medio de los
 * últimos tres meses, que es lo más cerca que está el esquema de un gasto fijo.
 *
 * No hay valores de relleno: sin pipeline o sin gasto el dato es 0 o `null`, y
 * quien lo muestre decide cómo decirlo. Antes devolvía 5.000 y 1.200 euros
 * inventados cuando no encontraba nada.
 */
export async function projectFinancialForecast(input: { tenantId: string }) {
  return await trackSkillExecution('project_financial_forecast', async () => {
    const now = new Date();
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { moneda: true },
    });
    const moneda = tenant?.moneda || MONEDA_MINIMA_ESQUEMA;

    const [deals, etapas] = await Promise.all([
      prisma.deal.findMany({
        where: { tenantId: input.tenantId, estado: 'activo' },
        select: { valor: true, moneda: true, etapa: true },
      }),
      prisma.pipelineStage.findMany({
        where: { tenantId: input.tenantId },
        select: { nombre: true, probabilidad: true },
      }),
    ]);
    const probabilidadPorEtapa = new Map(etapas.map((e) => [e.nombre, e.probabilidad]));

    let expectedIn = new Decimal(0);
    for (const deal of deals) {
      const probabilidad = probabilidadPorEtapa.get(deal.etapa) ?? 100;
      const valor = fxConvert(Number(deal.valor) || 0, deal.moneda || moneda, moneda);
      expectedIn = expectedIn.add(new Decimal(valor).mul(probabilidad).div(100));
    }

    const desde = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const gastos = await prisma.expense.aggregate({
      where: { tenantId: input.tenantId, status: 'PAID', date: { gte: desde } },
      _sum: { amount: true },
    });
    const committedOut = (gastos._sum.amount || 0) / 3;

    // Días de caja: cuántos días cubre el pipeline al ritmo de gasto actual. Sin
    // gasto declarado no hay nada que cubrir y el dato no es calculable.
    const runwayDays = committedOut > 0 ? expectedIn.div(committedOut / 30).toNumber() : null;

    return {
      content: `Proyección a 30 días: \n      - Ingreso esperado (pipeline ponderado): ${expectedIn.toNumber().toLocaleString()}\n      - Gasto mensual medio: ${committedOut.toLocaleString()}\n      - Salud de Runway: ${runwayDays === null ? 'no calculable (sin gasto registrado)' : `${runwayDays.toFixed(0)} días estimados`}.`,
      data: { expectedIn: expectedIn.toNumber(), committedOut, runwayDays }
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
