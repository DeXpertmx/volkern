export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { ExpirationWorker } from '@/lib/academy/expiration-worker';

/**
 * GET /api/cron/academy-audit
 * Dispara el proceso de auditoría y cumplimiento de la academia.
 * Protegido por CRON_SECRET en producción.
 */
export async function GET(request: NextRequest) {
  // Validación de seguridad (Vercel Cron / GitHub Actions)
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await ExpirationWorker.scanExpirations();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processedCerts: result.processed
    });
  } catch (error: any) {
    console.error('Error in Academy Audit Cron:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
