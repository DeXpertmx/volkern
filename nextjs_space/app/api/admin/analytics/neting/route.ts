export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEvents, getEventCounts, clearEvents } from '@/lib/analytics/store';

/**
 * GET /api/admin/analytics/neting
 * Devuelve eventos y conteos de analytics para la landing de Neting.
 * Requiere sesión con rol Superadmin/Admin.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado: inicia sesión primero' },
        { status: 401 }
      );
    }

    // Verificar rol
    const { prisma } = await import('@/lib/db');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: { select: { nombre: true } } },
    });

    const roleName = user?.role?.nombre;
    if (
      roleName !== 'Superadmin' &&
      roleName !== 'Admin' &&
      roleName !== 'Administrador'
    ) {
      return NextResponse.json(
        { error: 'Acceso denegado: requiere rol de Superadmin o Admin' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const eventPrefix = searchParams.get('prefix') || 'neting';
    const since = searchParams.get('since') || undefined;

    const events = await getEvents({ eventPrefix, since, limit });
    const counts = await getEventCounts({ eventPrefix, since });

    // Calcular tasa de conversión post-promo
    const modalShown = counts['neting_promo_expired_modal_shown'] || 0;
    const standardPriceClicked =
      counts['neting_promo_expired_standard_price_clicked'] || 0;
    const conversionRate =
      modalShown > 0
        ? ((standardPriceClicked / modalShown) * 100).toFixed(1)
        : '0.0';

    return NextResponse.json({
      events,
      counts,
      summary: {
        modalShown,
        standardPriceClicked,
        conversionRate: parseFloat(conversionRate),
        totalEvents: events.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching Neting analytics:', error);
    return NextResponse.json(
      { error: 'Error al obtener analytics de Neting' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/analytics/neting
 * Resetea el store en memoria de eventos de analytics.
 * Requiere sesión con rol Superadmin/Admin.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado: inicia sesión primero' },
        { status: 401 }
      );
    }

    const { prisma } = await import('@/lib/db');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: { select: { nombre: true } } },
    });

    const roleName = user?.role?.nombre;
    if (
      roleName !== 'Superadmin' &&
      roleName !== 'Admin' &&
      roleName !== 'Administrador'
    ) {
      return NextResponse.json(
        { error: 'Acceso denegado: requiere rol de Superadmin o Admin' },
        { status: 403 }
      );
    }

    await clearEvents();

    return NextResponse.json({
      ok: true,
      message: 'Store de eventos limpiado correctamente',
    });
  } catch (error: any) {
    console.error('Error clearing Neting analytics:', error);
    return NextResponse.json(
      { error: 'Error al limpiar eventos de Neting' },
      { status: 500 }
    );
  }
}
