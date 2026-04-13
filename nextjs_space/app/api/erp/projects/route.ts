import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * GET /api/erp/projects - Listar proyectos del tenant
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const leadId = searchParams.get('leadId');

    const where: any = {
      tenantId: auth.tenant!.id
    };

    if (status) where.status = status;
    if (leadId) where.leadId = leadId;

    const projects = await prisma.project.findMany({
      where,
      include: {
        lead: { select: { id: true, nombre: true } },
        _count: { select: { milestones: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Error al cargar proyectos' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/projects - Crear un nuevo proyecto
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    if (!body.name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        tenantId: auth.tenant!.id,
        name: body.name,
        description: body.description,
        leadId: body.leadId,
        budget: body.budget ? parseFloat(body.budget) : 0,
        currency: body.currency || 'EUR',
        status: 'PLANNING',
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : undefined
      }
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Error al crear el proyecto' }, { status: 500 });
  }
}, ['erp:write']);
