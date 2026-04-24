import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { MaintenanceService } from '@/lib/erp/maintenance-service';

/**
 * GET /api/erp/production/assets - Listar activos y su estado de salud
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const healthData = await MaintenanceService.getAssetsHealth(tenantId);
    return NextResponse.json(healthData);
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json({ error: 'Error al cargar activos' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/production/assets - Crear nuevo activo
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const data = await request.json();

    const asset = await (prisma as any).erp_industrial_assets.create({
      data: {
        id: `AST-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        ...data,
        tenantId
      }
    });

    return NextResponse.json(asset);
  } catch (error) {
    console.error('Error creating asset:', error);
    return NextResponse.json({ error: 'Error al crear activo' }, { status: 500 });
  }
}, ['erp:write']);
