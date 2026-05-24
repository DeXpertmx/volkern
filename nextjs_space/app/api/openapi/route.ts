export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

/**
 * GET /api/openapi
 *
 * Devuelve la especificación OpenAPI 3.0 completa generada
 * automáticamente desde los schemas Zod del proyecto.
 *
 * Tags: Sistema
 *
 * NOTA: Se usa import() dinámico + try-catch porque
 * @asteasolutions/zod-to-openapi (OpenApiGeneratorV3.generateDocument)
 * falla en build-time con "Cannot read properties of undefined (reading 'parent')"
 * al recorrer referencias internas de Zod. La generación se hace en runtime.
 */
export async function GET() {
  try {
    const { openApiDocument } = await import('@/lib/openapi');

    // Serializar quitando internals de Zod que NO son serializables a JSON
    const safe = JSON.parse(
      JSON.stringify(openApiDocument, (_key: string, value: unknown) => {
        if (_key === 'parent' || _key === 'ZY' || _key === '_def') return undefined;
        return value;
      }),
    );

    return NextResponse.json(safe);
  } catch (err) {
    console.error('[openapi] Error al generar documento:', err);
    return NextResponse.json(
      {
        openapi: '3.0.3',
        info: {
          title: 'Volkern CRM API',
          version: '1.0.0',
          description: 'Documentación no disponible en este momento. Error al generar la especificación.',
        },
        paths: {},
      },
      { status: 503 },
    );
  }
}
