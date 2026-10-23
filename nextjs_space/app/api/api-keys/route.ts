export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateApiKey, AVAILABLE_SCOPES } from '@/lib/api-keys';
import { crmAllows, getCrmEntitlements, upgradeMessage } from '@/lib/crm-entitlements';

// GET - Listar todas las API keys del tenant
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Obtener API keys del tenant
    const apiKeys = await prisma.apiKey.findMany({
      where: { tenantId: user.tenantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // No devolver el hash completo, solo información segura
    const safeApiKeys = apiKeys.map(key => ({
      id: key.id,
      nombre: key.nombre,
      descripcion: key.descripcion,
      prefix: key.prefix,
      scopes: key.scopes,
      activo: key.activo,
      expiraEn: key.expiraEn,
      ultimoUso: key.ultimoUso,
      totalUsos: key.totalUsos,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      user: key.user
    }));

    return NextResponse.json({ apiKeys: safeApiKeys });

  } catch (error: any) {
    console.error('Error listando API keys:', error);
    return NextResponse.json(
      { error: 'Error al listar API keys' },
      { status: 500 }
    );
  }
}

// POST - Crear nueva API key
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const ent = await getCrmEntitlements(user.tenantId);
    if (!crmAllows(ent, 'api')) {
      return NextResponse.json({ error: upgradeMessage('api', ent) }, { status: 403 });
    }

    const body = await request.json();
    const {
      nombre,
      descripcion,
      scopes,
      expiraEn
    } = body;

    // Validaciones
    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json(
        { error: 'Debe seleccionar al menos un scope' },
        { status: 400 }
      );
    }

    // Validar que los scopes sean válidos
    const invalidScopes = scopes.filter(scope => !AVAILABLE_SCOPES.includes(scope as any));
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { error: `Scopes inválidos: ${invalidScopes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generar API key
    const { key, keyHash, prefix } = generateApiKey();

    // Crear API key en la base de datos
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        nombre,
        descripcion: descripcion || undefined,
        keyHash,
        prefix,
        scopes,
        expiraEn: expiraEn ? new Date(expiraEn) : undefined,
        activo: true
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
        accion: 'crear',
        entidad: 'api_key',
        entidadId: apiKey.id,
        descripcion: `API Key creada: ${nombre}`
      }
    });

    // Devolver la key SOLO en la creación (nunca más se podrá ver)
    return NextResponse.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        nombre: apiKey.nombre,
        descripcion: apiKey.descripcion,
        key: key, // ⚠️ SOLO SE MUESTRA AQUÍ
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        activo: apiKey.activo,
        expiraEn: apiKey.expiraEn,
        createdAt: apiKey.createdAt,
        user: apiKey.user
      },
      warning: 'Guarda esta API key en un lugar seguro. No podrás verla de nuevo.'
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creando API key:', error);
    return NextResponse.json(
      { error: 'Error al crear API key', details: error.message },
      { status: 500 }
    );
  }
}
