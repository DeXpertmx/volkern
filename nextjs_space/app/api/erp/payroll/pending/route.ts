export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { PayrollService } from '@/lib/erp/payroll-service';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/payroll/pending
 * Retorna la lista de nóminas calculadas (borradores) para el periodo actual
 */
export const GET = withTenantAuth(async (request, auth) => {
  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get('month') || '4');
  const year = parseInt(searchParams.get('year') || '2026');

  try {
    const payrolls = await PayrollService.getPendingPayrolls(month, year);
    return NextResponse.json(payrolls);
  } catch (error: any) {
    console.error('Error fetching pending payrolls:', error);
    return NextResponse.json({ 
      data: [], 
      fallback: true, 
      error: error.message 
    });
  }
}, ['erp:read']);
