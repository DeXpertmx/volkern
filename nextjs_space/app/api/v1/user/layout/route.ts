export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * API: Gestión de Layouts Dinámicos (Dashboard, HR, Strategy)
 * Soporta persistencia estanca basada en el parámetro 'type' y tenant actual.
 * Refactorizado con withTenantAuth para asegurar aislamiento y soporte de impersonación.
 */

export const PATCH = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'dashboard';
    
    // Validación de tipos permitidos
    const validTypes = ['dashboard', 'hr', 'strategy'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Tipo de layout no válido' }, { status: 400 });
    }

    const body = await request.json();
    const { layout, isLocked, visibleWidgets } = body;

    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    // Recuperar metadata actual del usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { metadata: true }
    });

    const currentMetadata = (user?.metadata as Record<string, any>) || {};
    const layoutKey = `${type}Layout_${tenantId}`;
    const lockKey = `${type}LayoutLocked_${tenantId}`;
    const widgetsKey = `${type}VisibleWidgets_${tenantId}`;

    const updateData: Record<string, any> = { ...currentMetadata };
    if (layout !== undefined) updateData[layoutKey] = layout;
    if (typeof isLocked === 'boolean') updateData[lockKey] = isLocked;
    if (Array.isArray(visibleWidgets)) updateData[widgetsKey] = visibleWidgets;
    
    await prisma.user.update({
      where: { id: userId },
      data: { metadata: updateData }
    });

    return NextResponse.json({ success: true, type, key: layoutKey });

  } catch (error: any) {
    console.error('[UserLayoutAPI PATCH] Error:', error);
    return NextResponse.json({ error: 'Error al persistir el layout' }, { status: 500 });
  }
}, ['settings:write']);

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'dashboard';
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    const validTypes = ['dashboard', 'hr', 'strategy'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Tipo de layout no válido' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { metadata: true }
    });

    const metadata = (user?.metadata as Record<string, any>) || {};
    const layoutKey = `${type}Layout_${tenantId}`;
    const lockKey = `${type}LayoutLocked_${tenantId}`;
    const widgetsKey = `${type}VisibleWidgets_${tenantId}`;

    return NextResponse.json({ 
      layout: metadata[layoutKey] || null,
      isLocked: typeof metadata[lockKey] === 'boolean' ? metadata[lockKey] : null,
      visibleWidgets: Array.isArray(metadata[widgetsKey]) ? metadata[widgetsKey] : null,
      type,
      tenantId 
    });

  } catch (error: any) {
    console.error('[UserLayoutAPI GET] Error:', error);
    return NextResponse.json({ error: 'Error al recuperar el layout' }, { status: 500 });
  }
}, ['settings:read']);
