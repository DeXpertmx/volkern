export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPlanDefaultMaxPipelines } from '@/lib/pipelines';
import { PLAN_LIMITS } from '@/lib/plans';

// ─── Limitable definitions ─────────────────────────────────────────────────

interface LimitDefinition {
  key: string
  label: string
  icon: string
  description: string
  getPlanDefault: (plan: string) => number
}

const LIMIT_DEFINITIONS: LimitDefinition[] = [
  {
    key: 'users',
    label: 'Usuarios',
    icon: '👥',
    description: 'Máximo de usuarios del equipo',
    getPlanDefault: (plan) => getPlanLimit(plan, 'users'),
  },
  {
    key: 'leads',
    label: 'Leads',
    icon: '👤',
    description: 'Máximo de leads en CRM',
    getPlanDefault: (plan) => getPlanLimit(plan, 'leads'),
  },
  {
    key: 'emails_per_month',
    label: 'Emails/mes',
    icon: '✉️',
    description: 'Límite de envío de emails mensuales',
    getPlanDefault: (plan) => getPlanLimit(plan, 'emails_per_month'),
  },
  {
    key: 'storage_gb',
    label: 'Storage (GB)',
    icon: '💾',
    description: 'Almacenamiento en gigabytes',
    getPlanDefault: (plan) => getPlanLimit(plan, 'storage_gb'),
  },
  {
    key: 'max_pipelines',
    label: 'Pipelines',
    icon: '📈',
    description: 'Máximo de pipelines que puede crear',
    getPlanDefault: getPlanDefaultMaxPipelines,
  },
  {
    key: 'automation_runs',
    label: 'Automation Runs',
    icon: '⚡',
    description: 'Ejecuciones de automatización por mes',
    getPlanDefault: (plan) => getPlanLimit(plan, 'automation_runs'),
  },
  {
    key: 'whatsapp_messages',
    label: 'WhatsApp/mes',
    icon: '💬',
    description: 'Mensajes de WhatsApp mensuales',
    getPlanDefault: (plan) => getPlanLimit(plan, 'whatsapp_messages'),
  },
  {
    key: 'sms_messages',
    label: 'SMS/mes',
    icon: '📱',
    description: 'Mensajes SMS mensuales',
    getPlanDefault: (plan) => getPlanLimit(plan, 'sms_messages'),
  },
  {
    key: 'courses',
    label: 'Cursos',
    icon: '📚',
    description: 'Máximo de cursos en Academia',
    getPlanDefault: (plan) => getPlanLimit(plan, 'courses'),
  },
  {
    key: 'students',
    label: 'Estudiantes',
    icon: '🎓',
    description: 'Máximo de estudiantes',
    getPlanDefault: (plan) => getPlanLimit(plan, 'students'),
  },
  {
    key: 'automations_count',
    label: 'Automatizaciones',
    icon: '🤖',
    description: 'Cantidad máxima de automatizaciones activas',
    getPlanDefault: (plan) => getPlanLimit(plan, 'automations_count'),
  },
  {
    key: 'pages',
    label: 'Páginas Web',
    icon: '🌐',
    description: 'Máximo de páginas en el CMS',
    getPlanDefault: (plan) => getPlanLimit(plan, 'pages'),
  },
  {
    key: 'catalogo_items',
    label: 'Productos/Servicios',
    icon: '🏷️',
    description: 'Máximo de productos en el catálogo',
    getPlanDefault: (plan) => getPlanLimit(plan, 'catalogo_items'),
  },
  {
    key: 'published_pages',
    label: 'Landing pages publicadas',
    icon: '🚀',
    description: 'Máximo de landing pages publicadas simultáneamente',
    getPlanDefault: (plan) => getPlanLimit(plan, 'published_pages'),
  },
  {
    key: 'invoices',
    label: 'Facturas emitidas',
    icon: '🧾',
    description: 'Máximo de facturas que puede emitir',
    getPlanDefault: (plan) => getPlanLimit(plan, 'invoices'),
  },
  {
    key: 'contratos_sign',
    label: 'Contratos firmados',
    icon: '📝',
    description: 'Máximo de contratos firmados digitalmente',
    getPlanDefault: (plan) => getPlanLimit(plan, 'contratos_sign'),
  },
]

function getPlanLimit(plan: string, key: string): number {
  const limits = (PLAN_LIMITS as any)[plan.toLowerCase()]
  if (!limits) return 0
  const val = limits[key]
  return val !== undefined ? val : 0
}

// GET - Listar features y límites del tenant
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { id: true, plan: true, nombre: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const features = await prisma.tenantFeature.findMany({
      where: { tenantId: params.id },
      select: {
        id: true,
        feature: true,
        habilitado: true,
        limitePersonalizado: true,
        configuracion: true,
        razon: true,
        habilitadoPor: true,
        fechaActualizacion: true,
      },
      orderBy: { feature: 'asc' },
    });

    // Compute current values for all limits
    const limits = LIMIT_DEFINITIONS.map(def => {
      const feature = features.find(f => f.feature === def.key)
      const planDefault = def.getPlanDefault(tenant.plan)
      const currentValue = feature?.limitePersonalizado ?? planDefault

      return {
        key: def.key,
        label: def.label,
        icon: def.icon,
        description: def.description,
        currentValue,
        planDefault,
        isOverridden: !!feature?.limitePersonalizado,
        overrideId: feature?.id || null,
        unlimited: currentValue === -1,
      }
    })

    return NextResponse.json({
      tenantId: tenant.id,
      plan: tenant.plan,
      features,
      definitions: LIMIT_DEFINITIONS.map(d => ({
        key: d.key,
        label: d.label,
        icon: d.icon,
        description: d.description,
      })),
      limits,
    });

  } catch (error) {
    console.error('Error fetching features:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PATCH - Actualizar un feature/límite del tenant
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();
    const { feature, limitePersonalizado, razon } = body;

    if (!feature) {
      return NextResponse.json({ error: 'feature requerido' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { id: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // Si limitePersonalizado es null/undefined, eliminar el override (volver al default del plan)
    if (limitePersonalizado === null || limitePersonalizado === undefined) {
      await prisma.tenantFeature.deleteMany({
        where: { tenantId: params.id, feature },
      });
    } else {
      // Upsert con el nuevo límite
      await prisma.tenantFeature.upsert({
        where: {
          tenantId_feature: {
            tenantId: params.id,
            feature,
          }
        },
        update: {
          limitePersonalizado,
          habilitado: true,
          razon: razon || `Límite configurado a ${limitePersonalizado}`,
          habilitadoPor: session.user.id,
        },
        create: {
          tenantId: params.id,
          feature,
          limitePersonalizado,
          habilitado: true,
          razon: razon || `Límite configurado a ${limitePersonalizado}`,
          habilitadoPor: session.user.id,
        }
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: 'configurar_feature',
        entidad: 'tenant_feature',
        entidadId: params.id,
        descripcion: `Feature ${feature} configurado a ${limitePersonalizado ?? 'default (sin override)'}`,
      }
    });

    return NextResponse.json({
      success: true,
      feature,
      limitePersonalizado: limitePersonalizado ?? null,
    });

  } catch (error) {
    console.error('Error updating feature:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

