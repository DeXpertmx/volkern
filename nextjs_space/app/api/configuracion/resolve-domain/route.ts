import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByCustomDomain } from '@/lib/real-estate/portal-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain');
  if (!domain) {
    return NextResponse.json(
      { error: 'domain query parameter is required' },
      { status: 400 }
    );
  }

  const tenant = await resolveTenantByCustomDomain(domain);
  if (!tenant) {
    return NextResponse.json(
      { error: 'domain not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ tenantSlug: tenant.slug });
}
