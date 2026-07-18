export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const auth = process.env.CRON_SECRET
      ? { headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` } }
      : {}

    const { pollAllTenants } = await import('@/lib/imap/imap-engine');
    await pollAllTenants();

    return NextResponse.json({ success: true, message: 'IMAP polling completado' });
  } catch (error: any) {
    console.error('[Cron IMAP] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const POST = GET;
