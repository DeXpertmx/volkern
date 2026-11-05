export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ExpenseClassifier } from '@/lib/accounting/expense-classifier';

export const POST = withTenantAuth(async (req, auth, params) => {
  try {
    const { id } = params as { id: string };
    const body = await req.json();
    const { accountCode } = body;
    if (!accountCode) {
      return NextResponse.json({ error: 'accountCode es requerido' }, { status: 400 });
    }
    const result = await ExpenseClassifier.confirmAccount(id, accountCode);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Expense Confirm Account] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al confirmar cuenta' }, { status: 500 });
  }
}, ['accounting:write']);
