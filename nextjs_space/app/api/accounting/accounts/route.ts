export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (req, auth) => {
  const url = new URL(req.url);
  const group = url.searchParams.get('group');

  const where: any = { tenantId: auth.tenant!.id };
  if (group) {
    where.code = { startsWith: group };
  }

  const accounts = await prisma.accountingAccount.findMany({
    where,
    select: { code: true, name: true },
    orderBy: { code: 'asc' },
  });

  return NextResponse.json(accounts);
});
