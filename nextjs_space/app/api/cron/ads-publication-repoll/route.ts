/**
 * Cron endpoint — invokes the Google-Ads publication re-poll on demand.
 *
 * Vercel fires GET requests on the cadence declared in `vercel.json`
 * (5-field cron expression: every 30 minutes). When CRON_SECRET is set
 * in the Vercel project dashboard, Vercel also sends
 * `Authorization: Bearer <CRON_SECRET>` — we verify that header to
 * prevent unauthorized invocations.
 *
 * The HTTP route is a thin wrapper around `runAdsPublicationRepoll()`,
 * which is also wired into `lib/cron/scheduler.ts` for the local
 * long-running process (Node + node-cron) used in development and
 * some on-prem deploys.
 */
import { NextResponse } from 'next/server';
import { runAdsPublicationRepoll } from '@/lib/cron/ads-publication-repoll';

async function handle(req: Request): Promise<NextResponse> {
  // Vercel Cron sends Authorization: Bearer ${CRON_SECRET} when CRON_SECRET
  // is configured in the project's environment.
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const stats = await runAdsPublicationRepoll();
    return NextResponse.json(stats);
  } catch (err: any) {
    console.error(
      '[api/cron/ads-publication-repoll] Fatal:',
      err.message ?? err,
    );
    return NextResponse.json(
      { error: String(err.message ?? err) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
