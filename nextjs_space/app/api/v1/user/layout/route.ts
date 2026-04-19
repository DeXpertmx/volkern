import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * API: Gestión de Layouts Dinámicos (Dashboard & RRHH)
 * Soporta persistencia estanca basada en el parámetro 'type'
 */

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'dashboard'; // 'dashboard' o 'hr'
    
    // Validación estricta del tipo
    if (!['dashboard', 'hr'].includes(type)) {
      return NextResponse.json({ error: 'Tipo de layout no válido' }, { status: 400 });
    }

    const body = await request.json();
    const { layout, tenantId } = body;

    if (!layout || !tenantId) {
      return NextResponse.json({ error: 'Layout o tenantId no proporcionado' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { metadata: true }
    });

    const currentMetadata = (user?.metadata as Record<string, any>) || {};
    const layoutKey = type === 'hr' ? `hrLayout_${tenantId}` : `dashboardLayout_${tenantId}`;
    
    await prisma.user.update({
      where: { email: session.user.email! },
      data: {
        metadata: {
          ...currentMetadata,
          [layoutKey]: layout
        }
      }
    });

    return NextResponse.json({ success: true, type, key: layoutKey });

  } catch (error: any) {
    console.error('[UserLayoutAPI] Error:', error);
    return NextResponse.json({ error: 'Error al persistir el layout' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'dashboard';
    let tenantId = searchParams.get('tenantId');
    
    // Fallback al tenantId de la sesión si no viene en la URL
    if (!tenantId) {
      tenantId = (session.user as any).tenantId;
    }

    if (!['dashboard', 'hr'].includes(type) || !tenantId) {
      return NextResponse.json({ error: 'Parámetros no válidos (se requiere tenantId)' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { metadata: true }
    });

    const metadata = (user?.metadata as Record<string, any>) || {};
    const layoutKey = type === 'hr' ? `hrLayout_${tenantId}` : `dashboardLayout_${tenantId}`;

    return NextResponse.json({ layout: metadata[layoutKey] || null, type });

  } catch (error: any) {
    console.error('[UserLayoutAPI GET] Error:', error);
    return NextResponse.json({ error: 'Error al recuperar el layout' }, { status: 500 });
  }
}
