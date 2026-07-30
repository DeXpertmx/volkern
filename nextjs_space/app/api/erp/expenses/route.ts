export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * GET /api/erp/expenses - Listar gastos con filtros
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {
      tenantId: auth.tenant!.id
    };

    if (category) where.category = category;
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        supplier: {
          select: { id: true, name: true }
        },
        lead: {
          select: { id: true, nombre: true }
        }
      },
      orderBy: { date: 'desc' },
      take: limit
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenant!.id },
      select: { baseLatitude: true, baseLongitude: true }
    });

    return NextResponse.json({
      expenses,
      tenantConfig: {
        baseLatitude: tenant?.baseLatitude || 40.416775,
        baseLongitude: tenant?.baseLongitude || -3.703790
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: 'Error al cargar gastos' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/expenses - Crear un nuevo gasto (usando el skill central)
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    // Validaciones básicas
    if (!body.description || !body.amount || !body.supplierId) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const expense = await (skills as any).create_expense({
      tenantId: auth.tenant!.id,
      createdById: auth.user!.id,
      supplierId: body.supplierId,
      leadId: body.leadId,
      description: body.description,
      amount: parseFloat(body.amount),
      category: body.category || 'General',
      receiptUrl: body.receiptUrl,
      status: body.status || 'PAID',
      // Verifactu fields
      invoiceNumber: body.invoiceNumber,
      serie: body.serie,
      taxableBase: body.taxableBase ? parseFloat(body.taxableBase) : undefined,
      vatRate: body.vatRate ? parseFloat(body.vatRate) : undefined,
      vatAmount: body.vatAmount ? parseFloat(body.vatAmount) : undefined,
      irpfRate: body.irpfRate ? parseFloat(body.irpfRate) : undefined,
      irpfAmount: body.irpfAmount ? parseFloat(body.irpfAmount) : undefined,
      totalFactura: body.totalFactura ? parseFloat(body.totalFactura) : undefined,
      operationDate: body.operationDate ? new Date(body.operationDate) : undefined,
      issuerName: body.issuerName,
      issuerAddress: body.issuerAddress,
      issuerTaxId: body.issuerTaxId,
      receptorNombre: body.receptorNombre,
      receptorNif: body.receptorNif,
      receptorDireccion: body.receptorDireccion,
      iban: body.iban,
      lineas: body.lineas,
    });

    return NextResponse.json(expense);
  } catch (error) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: 'Error al registrar el gasto' }, { status: 500 });
  }
}, ['erp:write']);
