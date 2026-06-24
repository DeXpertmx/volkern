export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/projects/[id]/analysis - Análisis financiero detallado del proyecto
 */
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId } = params;

    // 1. Obtener datos base del proyecto
    const project = await prisma.project.findUnique({
      where: { id: projectId, tenantId: auth.tenant!.id },
      include: {
        milestones: true,
        expenses: true,
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // 2. Calcular Ingresos (Facturas generadas para este proyecto)
    // Buscamos facturas vinculadas a este proyecto. 
    // Nota: Actualmente las facturas se vinculan vía leadId o descripción, 
    // pero podemos buscarlas por la descripción que incluya el ID del proyecto si no hay relación directa.
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: auth.tenant!.id,
        OR: [
          { leadId: project.leadId || undefined },
          { metadata: { path: ['projectId'], equals: projectId } } as any
        ]
      }
    });

    const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.monto, 0);

    // 3. Calcular Gastos de Materiales (StockMovements)
    const stockMovements = await prisma.stockMovement.findMany({
      where: { projectId, tenantId: auth.tenant!.id, type: 'OUT' },
      include: {
        catalogoItem: { select: { costOfAcquisition: true } }
      }
    });

    const materialCosts = stockMovements.reduce((acc, move) => {
      const cost = move.catalogoItem?.costOfAcquisition || 0;
      return acc + (Math.abs(move.quantity) * cost);
    }, 0);

    // 4. Calcular Otros Gastos (Expense records)
    const otherCosts = (project.expenses as any[]).reduce((acc: number, exp: any) => acc + exp.monto, 0);

    const totalCosts = materialCosts + otherCosts;
    const netMargin = totalInvoiced - totalCosts;
    const marginPercentage = totalInvoiced > 0 ? (netMargin / totalInvoiced) * 100 : 0;

    return NextResponse.json({
      projectId,
      projectName: project.name,
      budget: project.budget,
      financials: {
        totalInvoiced,
        totalCosts,
        materialCosts,
        otherCosts,
        netMargin,
        marginPercentage,
      },
      breakdown: {
        invoicesCount: invoices.length,
        movementsCount: stockMovements.length,
        expensesCount: project.expenses.length
      }
    });
  } catch (error) {
    console.error('Error calculating project analysis:', error);
    return NextResponse.json({ error: 'Error al calcular análisis financiero' }, { status: 500 });
  }
}, ['erp:read']);
