export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AVAILABLE_SCOPES } from '@/lib/api-keys';

// GET - Obtener detalles de una API key
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que pertenece al tenant
    if (apiKey.tenantId !== user.tenantId) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      );
    }

    // No devolver el hash
    const { keyHash, ...safeApiKey } = apiKey;

    return NextResponse.json({ apiKey: safeApiKey });

  } catch (error: any) {
    console.error('Error obteniendo API key:', error);
    return NextResponse.json(
      { error: 'Error al obtener API key' },
      { status: 500 }
    );
  }
}

// PUT - Actualizar API key (nombre, descripción, scopes, estado)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { id: params.id }
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que pertenece al tenant
    if (apiKey.tenantId !== user.tenantId) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { nombre, descripcion, scopes, activo, expiraEn } = body;

    // Validar scopes si se proporcionan
    if (scopes) {
      if (!Array.isArray(scopes) || scopes.length === 0) {
        return NextResponse.json(
          { error: 'Debe tener al menos un scope' },
          { status: 400 }
        );
      }

      const invalidScopes = scopes.filter(scope => !AVAILABLE_SCOPES.includes(scope as any));
      if (invalidScopes.length > 0) {
        return NextResponse.json(
          { error: `Scopes inválidos: ${invalidScopes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Actualizar API key
    const updatedApiKey = await prisma.apiKey.update({
      where: { id: params.id },
      data: {
        nombre: nombre || undefined,
        descripcion: descripcion !== undefined ? (descripcion || null) : undefined,
        scopes: scopes || undefined,
        activo: activo !== undefined ? activo : undefined,
        expiraEn: expiraEn !== undefined ? (expiraEn ? new Date(expiraEn) : null) : undefined
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'actualizar',
        entidad: 'api_key',
        entidadId: updatedApiKey.id,
        descripcion: `API Key actualizada: ${updatedApiKey.nombre}`
      }
    });

    // No devolver el hash
    const { keyHash, ...safeApiKey } = updatedApiKey;

    return NextResponse.json({
      success: true,
      apiKey: safeApiKey
    });

  } catch (error: any) {
    console.error('Error actualizando API key:', error);
    return NextResponse.json(
      { error: 'Error al actualizar API key' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { id: params.id }
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que pertenece al tenant
    if (apiKey.tenantId !== user.tenantId) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      );
    }

    // Eliminar API key
    await prisma.apiKey.delete({
      where: { id: params.id }
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'eliminar',
        entidad: 'api_key',
        entidadId: apiKey.id,
        descripcion: `API Key eliminada: ${apiKey.nombre}`
      }
    });

    return NextResponse.json({
      success: true,
      message: 'API key eliminada exitosamente'
    });

  } catch (error: any) {
    console.error('Error eliminando API key:', error);
    return NextResponse.json(
      { error: 'Error al eliminar API key' },
      { status: 500 }
    );
  }
}
