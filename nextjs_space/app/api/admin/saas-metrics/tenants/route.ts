import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';
import { getPlanConfig } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const plan = searchParams.get('plan') || '';

    const where: any = {};

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { dominio: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status && status !== 'all') {
      where.estado = status;
    }

    if (plan && plan !== 'all') {
      where.plan = plan;
    }

    const [tenants, total] = await Promise.all([
      globalPrisma.tenant.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          slug: true,
          plan: true,
          estado: true,
          dominio: true,
          mrr: true,
          moneda: true,
          fechaCreacion: true,
          fechaVencimiento: true,
          fechaActualizacion: true,
          _count: { select: { users: true } }
        },
        orderBy: { fechaCreacion: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      globalPrisma.tenant.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      tenants: tenants.map(t => ({
        ...t,
        lastActivity: t.fechaActualizacion
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('[SaaS Tenants] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants', details: (error as Error).message },
      { status: 500 }
    );
  }
}
