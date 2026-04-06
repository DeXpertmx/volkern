export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/admin/plans - Obtener todos los planes y sus estadísticas (Control Plane)
export const GET = withTenantAuth(async (req, auth) => {
  try {
    // 1. Verificar si el usuario es superadmin
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado: requiere rol de Superadmin' }, { status: 403 });
    }

    // Obtener los planes de la base de datos Global
    const dbPlans = await globalPrisma.subscriptionPlan.findMany({
      orderBy: { ordenamiento: 'asc' }
    });

    // Obtener estadísticas de cada plan (cuántos tenants lo usan)
    // Tenant es un modelo global, por lo que esta consulta es directa.
    const tenantStats = await globalPrisma.tenant.groupBy({
      by: ['plan'],
      _count: { id: true },
      where: { estado: { in: ['trial', 'activo'] } }
    });

    // Calcular MRR total por plan
    const mrrByPlan = await globalPrisma.tenant.groupBy({
      by: ['plan'],
      _sum: { mrr: true },
      where: { estado: 'activo' }
    });

    const plansWithStats = dbPlans.map(plan => {
      const stats = tenantStats.find(s => s.plan === plan.slug) || { _count: { id: 0 } };
      const mrr = mrrByPlan.find(m => m.plan === plan.slug)?._sum?.mrr || 0;
      
      const limits = {
        users: plan.limiteUsuarios,
        leads: plan.limiteLeads,
        storage_gb: plan.limiteStorage,
        courses: plan.limiteCursos,
        students: plan.limiteEstudiantes,
        ...(plan.features as any)?.raw_limits
      };

      return {
        id: plan.slug,
        dbId: plan.id,
        nombre: plan.nombre,
        precio: plan.precio,
        moneda: plan.moneda,
        intervalo: plan.intervalo,
        stripePriceId: (plan.features as any)?.stripePriceId || '',
        limites: limits,
        features: (plan.features as any)?.ui_features || [],
        modules: (plan.features as any)?.modules || [],
        activo: plan.activo,
        esPublico: plan.esPublico,
        esPopular: plan.esPopular,
        _count: {
          subscriptions: stats._count.id
        },
        mrr: Number(mrr) || 0
      };
    });

    return NextResponse.json(plansWithStats);
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json({ error: 'Error al obtener planes' }, { status: 500 });
  }
}, ['admin:read'])

// POST /api/admin/plans - Crear un nuevo plan de suscripción (Control Plane)
export const POST = withTenantAuth(async (req, auth) => {
  try {
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado: requiere rol de Superadmin' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      nombre, 
      precio, 
      moneda, 
      intervalo,
      limiteUsuarios, 
      limiteLeads, 
      limiteStorage, 
      limiteCursos, 
      limiteEstudiantes,
      stripePriceId,
      activo,
      esPublico,
      esPopular,
      ui_features,
      modules
    } = body;

    if (!nombre || precio === undefined) {
      return NextResponse.json({ error: 'Nombre y precio son requeridos' }, { status: 400 });
    }

    const slug = nombre.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existingPlan = await globalPrisma.subscriptionPlan.findUnique({
      where: { slug }
    });

    if (existingPlan) {
      return NextResponse.json({ error: 'Ya existe un plan con un nombre similar' }, { status: 400 });
    }

    // Mapear flags de módulos para la lógica de habilitación
    const moduleFlags = {
      whatsappHabilitado: modules?.includes('whatsapp') || modules?.includes('chatbot_whatsapp'),
      emailHabilitado: true,
      smsHabilitado: modules?.includes('sms'),
      telegramHabilitado: modules?.includes('telegram'),
      facebookHabilitado: modules?.includes('meta_integration') || modules?.includes('facebook'),
      instagramHabilitado: modules?.includes('meta_integration') || modules?.includes('instagram'),
      lmsHabilitado: modules?.includes('academy') || modules?.includes('cursos') || modules?.includes('estudiantes'),
      pageBuilderHabilitado: modules?.includes('builder') || modules?.includes('cms') || modules?.includes('builder_premium'),
      automationsHabilitado: modules?.includes('automations') || modules?.includes('automatizaciones'),
      campaignsHabilitado: modules?.includes('campanas') || modules?.includes('campaigns') || modules?.includes('email_marketing'),
      whitelabelHabilitado: modules?.includes('white_label'),
      dominioPersonalizadoHabilitado: modules?.includes('custom_domain'),
      apiAccessHabilitado: modules?.includes('api_access'),
    };

    const newPlan = await globalPrisma.subscriptionPlan.create({
      data: {
        nombre,
        slug,
        precio: Number(precio),
        moneda: moneda || 'MXN',
        intervalo: intervalo || 'mensual',
        limiteUsuarios: Number(limiteUsuarios) || 0,
        limiteLeads: Number(limiteLeads) || 0,
        limiteStorage: Number(limiteStorage) || 0,
        limiteCursos: Number(limiteCursos) || 0,
        limiteEstudiantes: Number(limiteEstudiantes) || 0,
        activo: activo !== undefined ? activo : true,
        esPublico: esPublico !== undefined ? esPublico : true,
        esPopular: esPopular !== undefined ? esPopular : false,
        features: {
          ui_features: ui_features || [],
          modules: modules || [],
          stripePriceId: stripePriceId || ''
        },
        ...moduleFlags
      }
    });

    // Auditoría global
    await globalPrisma.auditLog.create({
      data: {
        userId: auth.user!.id,
        accion: 'crear',
        entidad: 'subscriptionPlan',
        entidadId: newPlan.id,
        descripcion: `Nuevo plan creado: ${nombre} (${slug})`,
        cambiosDespues: JSON.stringify(newPlan)
      }
    });

    return NextResponse.json(newPlan);
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json({ error: 'Error al crear el plan' }, { status: 500 });
  }
}, ['admin:write'])
