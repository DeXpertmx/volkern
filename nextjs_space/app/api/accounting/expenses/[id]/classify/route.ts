export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ExpenseClassifier } from '@/lib/accounting/expense-classifier';

export const POST = withTenantAuth(async (req, auth, params) => {
  try {
    const { id } = params as { id: string };
    const result = await ExpenseClassifier.classify(id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Expense Classify] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al clasificar gasto' }, { status: 500 });
  }
}, ['accounting:write']);
