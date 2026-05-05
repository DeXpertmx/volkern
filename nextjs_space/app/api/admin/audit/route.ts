import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/audit-service';
import { createAuditHashChain, verifyAuditIntegrity } from '@/lib/audit-hash';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await isAdminRequest(request);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const tenantId = url.searchParams.get('tenantId');
    const userId = url.searchParams.get('userId');
    const entity = url.searchParams.get('entity');
    const action = url.searchParams.get('action');
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');
    const entityId = url.searchParams.get('entityId');
    const verifyChain = url.searchParams.get('verifyChain') === 'true';

    const skip = (page - 1) * limit;

    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (userId) where.userId = userId;
    if (entity) where.entidad = entity;
    if (action) where.accion = action;
    if (entityId) where.entidadId = entityId;
    if (fromDate) where.fechaCreacion = { ...where.fechaCreacion, gte: new Date(fromDate) };
    if (toDate) where.fechaCreacion = { ...where.fechaCreacion, lte: new Date(toDate) };

    const [records, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { fechaCreacion: 'desc' },
        take: limit,
        skip,
        include: {
          user: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, nombre: true, slug: true } }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    let chainIntegrity = null;
    if (verifyChain && tenantId) {
      chainIntegrity = await createAuditHashChain(
        tenantId,
        fromDate ? new Date(fromDate) : undefined,
        toDate ? new Date(toDate) : undefined
      );
    }

    return NextResponse.json({
      success: true,
      records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      chainIntegrity
    });
  } catch (error) {
    console.error('[GET /api/admin/audit] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await isAdminRequest(request);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { action, entity, entityId, description, tenantId, userId, metadata, changesBefore, changesAfter } = body;

    if (!action || !entity || !entityId || !description || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, entity, entityId, description, tenantId' },
        { status: 400 }
      );
    }

    const requestIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const auditLog = await AuditService.log({
      tenantId,
      userId: userId || 'admin-manual',
      action,
      entity,
      entityId,
      description,
      changesBefore,
      changesAfter,
      ipAddress: requestIp,
      userAgent,
      metadata
    });

    return NextResponse.json({ success: true, auditLog });
  } catch (error) {
    console.error('[POST /api/admin/audit] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function isAdminRequest(request: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  const adminKey = process.env.INTERNAL_API_KEY;

  if (!adminKey || token !== adminKey) {
    return { ok: false, error: 'Invalid authorization token' };
  }

  return { ok: true };
}