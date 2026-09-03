export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { upgradeOnboarding } from '@/lib/onboarding-service';

// GET /api/admin/tenants - Listar todos los tenants con filtrado y paginación (Control Plane)
export const GET = withTenantAuth(async (req, auth) => {
  try {
    // 1. Verificar si el usuario es superadmin de la plataforma (los roles 'Admin'/'Administrador' de tenant NO acceden)
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado: requiere rol de Superadmin de la plataforma' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const plan = searchParams.get('plan') || 'all';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { dominio: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status !== 'all') {
      where.estado = status;
    }
    
    if (plan !== 'all') {
      where.plan = plan;
    }

    // Consulta sobre la Base de Datos Global
    const [tenants, total] = await Promise.all([
      globalPrisma.tenant.findMany({
        where,
        include: {
          tenantFeatures: {
            where: { feature: 'produccion' },
            select: { habilitado: true }
          },
          _count: {
            select: {
              users: true,
              apiKeys: true
            }
          }
        },
        skip,
        take: limit,
        orderBy: { fechaCreacion: 'desc' }
      }),
      globalPrisma.tenant.count({ where })
    ]);

    return NextResponse.json({
      tenants,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching tenants:', error);
    return NextResponse.json({ error: 'Error al obtener tenants' }, { status: 500 });
  }
}, ['admin:read'])

// POST /api/admin/tenants - Crear nuevo tenant y configurar su infraestructura aislada
export const POST = withTenantAuth(async (req, auth) => {
  try {
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado: requiere rol de Superadmin' }, { status: 403 });
    }

    const body = await req.json();
    const {
      nombre,
      slug,
      plan,
      dominio,
      billingEmail,
      moneda,
      estado,
      limites,
      trialDays,
      autoProvision = true // Por defecto provisionamos la DB aislada
    } = body;

    // Validaciones
    if (!nombre || !slug) {
      return NextResponse.json({ error: 'Nombre y slug son requeridos' }, { status: 400 });
    }

    const existingTenant = await globalPrisma.tenant.findUnique({
      where: { slug }
    });

    if (existingTenant) {
      return NextResponse.json({ error: 'El slug ya está en uso' }, { status: 400 });
    }

    // Generar dbUrl aislada automáticamente
    // NOTA: En producción esto debería usar variables de entorno seguras para el host/user/pass
    const dbHost = process.env.TENANT_DB_HOST || 'localhost';
    const dbUser = process.env.TENANT_DB_USER || 'dexpert';
    const dbPass = process.env.TENANT_DB_PASS || 'volkern';
    const dbPort = process.env.TENANT_DB_PORT || '5432';
    const dbName = `volkern_tenant_${slug.replace(/-/g, '_')}`;
    const dbUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}?schema=public`;

    const isTrial = estado === 'trial';
    const fechaTrialInicio = isTrial ? new Date() : null;
    const fechaTrialFin = isTrial && trialDays 
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    // Crear tenant en el Control Plane
    const tenant = await globalPrisma.tenant.create({
      data: {
        nombre,
        slug,
        plan: plan || 'trial',
        estado: estado || 'activo',
        dominio,
        billingEmail,
        moneda: moneda || 'EUR',
        dbUrl: dbUrl, // Guardamos la URL de su base de datos física
        limites: limites || {
          usuarios: 5,
          leads: 1000,
          storage: 10
        },
        fechaTrialInicio,
        fechaTrialFin
      }
    });

    // --- ONBOARDING 2.0: PROCESO GÉNESIS ---
    let genesisResult = null;
    if (autoProvision) {
      try {
        genesisResult = await upgradeOnboarding(tenant.id, plan);
      } catch (genesisError) {
        console.error('[Genesis] Failed during onboarding:', genesisError);
        // No fallamos toda la creación por esto, pero lo logueamos
      }
    }

    return NextResponse.json({
      tenant,
      genesis: genesisResult,
      message: autoProvision 
        ? 'Tenant creado e infraestructura provisionada (Génesis completa)' 
        : 'Tenant creado exitosamente. Provisionamiento manual requerido.'
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating tenant:', error);
    return NextResponse.json({ error: 'Error al crear tenant' }, { status: 500 });
  }
}, ['admin:write'])
