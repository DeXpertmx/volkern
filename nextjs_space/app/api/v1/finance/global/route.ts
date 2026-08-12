export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/v1/finance/global
 *
 * Global Cockpit: consolidación financiera.
 * - Tenants BUSINESS: resumen de su propia actividad (facturas + gastos).
 * - Tenants AGENCY: consolida la actividad de todas sus empresas (slots).
 *
 * Devuelve: totales (ingresos, gastos, margen), flujo mensual de los
 * últimos 6 meses, desglose por empresa (solo AGENCY) y transacciones
 * recientes.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const tenantId = (session.user as any).tenantId;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, nombre: true, accountType: true, moneda: true, parentId: true, estado: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // ── Ámbito: si es AGENCIA, consolidar sus empresas (slots) ──────────
    const isAgency = tenant.accountType === 'AGENCY';
    let entities: { id: string; nombre: string }[];
    if (isAgency) {
      const slots = await prisma.tenant.findMany({
        where: { parentId: tenantId, estado: 'activo' },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      });
      entities = [{ id: tenant.id, nombre: tenant.nombre }, ...slots];
    } else {
      entities = [{ id: tenant.id, nombre: tenant.nombre }];
    }

    // ── Ventana de 12 meses para totales ────────────────────────────────
    const now = new Date();
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const tenantIds = entities.map(e => e.id);

    const [invoices, expenses, suppliers] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          tenantId: { in: tenantIds },
          fechaEmision: { gte: fromDate },
          estado: { notIn: ['anulada', 'cancelada', 'devuelta'] },
        },
        select: {
          id: true, tenantId: true, numero: true, monto: true,
          fechaEmision: true, estado: true, provider: true,
        },
        orderBy: { fechaEmision: 'desc' },
        take: 2000,
      }),
      prisma.expense.findMany({
        where: {
          tenantId: { in: tenantIds },
          date: { gte: fromDate },
          status: { notIn: ['VOID', 'VOIDED'] },
        },
        include: {
          supplier: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: 2000,
      }),
      isAgency
        ? prisma.supplier.groupBy({
            by: ['tenantId'],
            _count: { _all: true },
            where: { tenantId: { in: tenantIds }, active: true },
          })
        : Promise.resolve([]),
    ]);

    // ── Totales por entidad ─────────────────────────────────────────────
    const entitySummary = new Map<string, {
      id: string; nombre: string;
      totalIncome: number; totalExpenses: number;
      invoiceCount: number; expenseCount: number;
    }>();
    for (const e of entities) {
      entitySummary.set(e.id, { id: e.id, nombre: e.nombre, totalIncome: 0, totalExpenses: 0, invoiceCount: 0, expenseCount: 0 });
    }

    for (const inv of invoices) {
      const s = entitySummary.get(inv.tenantId);
      if (!s) continue;
      s.totalIncome += Number(inv.monto);
      s.invoiceCount += 1;
    }
    for (const exp of expenses) {
      const s = entitySummary.get(exp.tenantId);
      if (!s) continue;
      s.totalExpenses += Number(exp.amount);
      s.expenseCount += 1;
    }

    const entitiesSummary = Array.from(entitySummary.values()).map(s => ({
      ...s,
      totalIncome: Math.round(s.totalIncome * 100) / 100,
      totalExpenses: Math.round(s.totalExpenses * 100) / 100,
      netMargin: Math.round((s.totalIncome - s.totalExpenses) * 100) / 100,
    }));

    // ── Totales consolidados ────────────────────────────────────────────
    const totals = entitiesSummary.reduce(
      (acc, s) => ({
        totalIncome: acc.totalIncome + s.totalIncome,
        totalExpenses: acc.totalExpenses + s.totalExpenses,
        invoiceCount: acc.invoiceCount + s.invoiceCount,
        expenseCount: acc.expenseCount + s.expenseCount,
      }),
      { totalIncome: 0, totalExpenses: 0, invoiceCount: 0, expenseCount: 0 }
    );
    totals.totalIncome = Math.round(totals.totalIncome * 100) / 100;
    totals.totalExpenses = Math.round(totals.totalExpenses * 100) / 100;

    // ── Flujo mensual (últimos 6 meses) ────────────────────────────────
    const monthly: { key: string; label: string; income: number; expenses: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      let income = 0;
      let expensesSum = 0;
      for (const inv of invoices) {
        if (inv.fechaEmision >= d && inv.fechaEmision < next) income += Number(inv.monto);
      }
      for (const exp of expenses) {
        if (exp.date >= d && exp.date < next) expensesSum += Number(exp.amount);
      }
      monthly.push({
        key,
        label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expensesSum * 100) / 100,
        net: Math.round((income - expensesSum) * 100) / 100,
      });
    }

    // ── Transacciones recientes (fusionadas y ordenadas) ───────────────
    const recent: {
      id: string; type: 'income' | 'expense'; date: string;
      description: string; counterparty: string; amount: number; tenantName: string;
    }[] = [
      ...invoices.slice(0, 10).map(inv => ({
        id: inv.id,
        type: 'income' as const,
        date: inv.fechaEmision.toISOString(),
        description: `Factura ${inv.numero}`,
        counterparty: inv.provider || 'Cliente',
        amount: Number(inv.monto),
        tenantName: entitySummary.get(inv.tenantId)?.nombre || '',
      })),
      ...expenses.slice(0, 10).map(exp => ({
        id: exp.id,
        type: 'expense' as const,
        date: exp.date.toISOString(),
        description: exp.description,
        counterparty: exp.supplier?.name || 'Proveedor',
        amount: Number(exp.amount),
        tenantName: entitySummary.get(exp.tenantId)?.nombre || '',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

    // ── Nº proveedores por empresa (solo agencias) ─────────────────────
    const supplierCountByTenant = new Map<string, number>();
    for (const row of suppliers) supplierCountByTenant.set(row.tenantId, row._count._all);

    return NextResponse.json({
      scope: isAgency ? 'AGENCY' : 'BUSINESS',
      currency: tenant.moneda || 'EUR',
      tenantName: tenant.nombre,
      period: { from: fromDate.toISOString(), to: now.toISOString() },
      totals: {
        ...totals,
        netMargin: Math.round((totals.totalIncome - totals.totalExpenses) * 100) / 100,
      },
      entities: isAgency
        ? entitiesSummary.map(e => ({
            ...e,
            supplierCount: supplierCountByTenant.get(e.id) || 0,
          }))
        : undefined,
      monthly,
      recent,
    });
  } catch (error) {
    console.error('Error fetching global cockpit:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
