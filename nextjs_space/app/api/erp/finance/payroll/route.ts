export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/finance/payroll - Listar registros de nómina
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const payroll = await prisma.payrollRecord.findMany({
      where: { tenantId: auth.tenant!.id },
      orderBy: { date: 'desc' }
    });

    return NextResponse.json(payroll);
  } catch (error) {
    console.error('Error fetching payroll:', error);
    return NextResponse.json({ error: 'Error al cargar nóminas' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/finance/payroll - Registrar pago de nómina
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    if (!body.employeeName || !body.amount || !body.period) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const payroll = await prisma.payrollRecord.create({
      data: {
        tenantId: auth.tenant!.id,
        employeeName: body.employeeName,
        userId: body.userId,
        amount: parseFloat(body.amount),
        currency: body.currency || 'EUR',
        period: body.period,
        status: body.status || 'PAID',
        date: body.date ? new Date(body.date) : new Date(),
        notes: body.notes
      }
    });

    return NextResponse.json(payroll);
  } catch (error) {
    console.error('Error creating payroll:', error);
    return NextResponse.json({ error: 'Error al registrar la nómina' }, { status: 500 });
  }
}, ['erp:write']);
