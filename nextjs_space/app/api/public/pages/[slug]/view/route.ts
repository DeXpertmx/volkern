export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma, getTenantDb, dbContext, prisma } from '@/lib/db';

/**
 * POST /api/public/pages/[slug]/view - Incrementar contador de vistas
 */
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ slug: string }> }
) {
  const params = await paramsPromise;
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlugParam = searchParams.get('tenant');

    let tenantId: string | null = null;

    if (tenantSlugParam) {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { slug: tenantSlugParam },
        select: { id: true }
      });
      tenantId = tenant?.id || null;
    }

    // Fallback: buscar en DB global
    if (!tenantId) {
      const pageInGlobal = await globalPrisma.page.findFirst({
        where: { slug: params.slug, estado: 'published' },
        select: { tenantId: true }
      });
      tenantId = pageInGlobal?.tenantId || null;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    // Estrecho el tipo para poder usarlo dentro del closure asíncrono.
    const tenantIdResuelto: string = tenantId;

    const tenantClient = await getTenantDb(tenantId);

    return await dbContext.run({ tenantId, client: tenantClient }, async () => {
      const page = await prisma.page.findFirst({
        where: { slug: params.slug, estado: 'published' },
      });

      // BD compartida: no contar vistas de páginas de OTRO tenant servidas
      // bajo este (misma fuga que el renderizador).
      if (page && page.tenantId !== null && page.tenantId !== tenantIdResuelto) {
        const tenantInfo = await globalPrisma.tenant.findUnique({
          where: { id: tenantIdResuelto },
          select: { dbUrl: true },
        });
        if (!tenantInfo?.dbUrl) {
          return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }
      }

      if (!page) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
      }

      await prisma.page.update({
        where: { id: page.id },
        data: { vistas: { increment: 1 } },
      });

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
