export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generarFeedDeToken, PortalNotConfiguredError } from '@/lib/portals/orchestrator';
import { PortalCryptoError } from '@/lib/portals/crypto';
import { PortalFeedError } from '@/lib/portals/types';

/**
 * GET /feeds/[token]
 *
 * Feed público que descargan Kyero (y, más adelante, Fotocasa). La credencial
 * es el token de 32 bytes; no hay sesión.
 *
 * Se regenera en cada petición desde el registro maestro y se valida contra el
 * XSD antes de responder: si el documento no es válido se devuelve 500 y queda
 * registrado en `portal_sync_logs`/`portal_connections.last_error`. Nunca se
 * sirve XML inválido (Kyero lo rechazaría y podría retirar inmuebles).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // Next 15+ entrega `params` como promesa.
  const { token } = await params;

  if (!token || token.length < 32) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const { document } = await generarFeedDeToken(token);

    return new NextResponse(document, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Disposition': 'inline; filename="kyero.xml"',
      },
    });
  } catch (error) {
    if (error instanceof PortalNotConfiguredError) {
      // Mismo 404 para token inexistente, revocado o portal desactivado: no se
      // revela si el token existió.
      return new NextResponse('Not found', { status: 404 });
    }

    if (error instanceof PortalFeedError) {
      logger.error(
        { err: error, errors: error.errors },
        '[portals] Feed no servido: el documento no cumple el XSD'
      );
      return new NextResponse(
        'El feed no está disponible: el documento generado no es válido.',
        { status: 500 }
      );
    }

    if (error instanceof PortalCryptoError) {
      logger.error({ err: error }, '[portals] Feed no servido: credenciales ilegibles');
      return new NextResponse('El feed no está disponible.', { status: 500 });
    }

    logger.error({ err: error }, '[portals] Error generando el feed');
    return new NextResponse('El feed no está disponible.', { status: 500 });
  }
}
