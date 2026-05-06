export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/audit-service';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    
    const whereClause: any = { tenantId };
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status) whereClause.status = status;
    if (category) whereClause.category = category;
    
    const assets = await prisma.asset.findMany({
      where: whereClause,
      include: {
        assignments: {
          where: { returnedAt: null },
          include: { employee: true }
        }
      },
      orderBy: { name: 'asc' },
      take: 50
    });
    
    return NextResponse.json(assets);
  } catch (error) {
    console.error('[AssetsAPI] Error:', error);
    return NextResponse.json({ fallback: true, data: [] });
  }
}, { requiredScopes: ['hr:read'] });

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    
    const asset = await prisma.asset.create({
      data: {
        ...body,
        tenantId
      }
    });
    
    // Protocolo de Confianza
    await AuditService.log({
      tenantId,
      userId: auth.user!.id,
      action: 'ASSET_CREATE',
      resourceType: 'Asset',
      resourceId: asset.id,
      details: `Nuevo activo registrado: ${asset.name} (${asset.serialNumber || 'S/N'})`
    });
    
    return NextResponse.json(asset);
  } catch (error) {
    console.error('[AssetsAPI] Error:', error);
    return NextResponse.json({ error: 'Error al crear activo' }, { status: 500 });
  }
}, { requiredScopes: ['hr:write'] });
