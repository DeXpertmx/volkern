import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/skills/observability';
import { addEvent } from '@/lib/analytics/store';

const analyticsLogger = createLogger('analytics-public');

/**
 * POST /api/analytics/event
 * Endpoint público para registrar eventos de analytics desde páginas sin autenticación.
 * Acepta: { event: string, metadata?: Record<string, unknown> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, metadata } = body;

    if (!event || typeof event !== 'string') {
      return NextResponse.json(
        { error: 'Se requiere un nombre de evento (string)' },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const referer = req.headers.get('referer') || 'direct';

    // Log estructurado con metadata de request
    analyticsLogger.info(`[Analytics] ${event}`, null, {
      event,
      metadata: metadata || {},
      ip,
      userAgent,
      referer,
      timestamp,
    });

    // Guardar en store en memoria para el dashboard
    addEvent({
      event,
      metadata: metadata || {},
      ip,
      userAgent,
      referer,
      timestamp,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    analyticsLogger.error('Error procesando evento de analytics', error as Error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500 }
    );
  }
}
