export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';
import { monedaEscritura } from '@/lib/moneda';

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
        milestones: { orderBy: { dueDate: 'asc' }, take: 10 },
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

    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          tenantId: auth.tenant!.id,
          name: body.name,
          description: body.description,
          leadId: body.leadId,
          budget: body.budget ? parseFloat(body.budget) : 0,
          // Divisa del usuario y, si no la indica, la del tenant: el valor por
          // defecto de la columna ('EUR') la guardaba en euros a un tenant en pesos.
          currency: monedaEscritura(body.currency, auth.tenant?.moneda),
          status: 'PLANNING',
          startDate: body.startDate ? new Date(body.startDate) : new Date(),
          endDate: body.endDate ? new Date(body.endDate) : undefined
        }
      });

      if (body.leadId) {
        await tx.lead.update({
          where: { id: body.leadId },
          data: { estado: 'ganado' }
        });
      }

      // Generar hitos base según contexto
      const context = (body.name + ' ' + (body.description || '')).toLowerCase();
      let milestones: any[] = [];

      if (context.includes('solar') || context.includes('energía')) {
        milestones = [
          { name: 'Estudio de Viabilidad Fotovoltaica', days: 7, critical: true },
          { name: 'Adquisición de Paneles e Inversores', days: 20, critical: true },
          { name: 'Instalación de Estructuras', days: 35, critical: false },
          { name: 'Conexión a Red y Pruebas', days: 45, critical: true },
        ];
      } else if (context.includes('mantenimiento') || context.includes('reparación')) {
        milestones = [
          { name: 'Diagnóstico Técnico Inicial', days: 3, critical: true },
          { name: 'Suministro de Repuestos', days: 10, critical: true },
          { name: 'Ejecución de Trabajos', days: 20, critical: true },
          { name: 'Certificación de Entrega', days: 25, critical: false },
        ];
      } else {
        // Hitos Genéricos
        milestones = [
          { name: 'Inicio de Proyecto / Kickoff', days: 1, critical: true },
          { name: 'Entregable de Fase 1', days: 15, critical: false },
          { name: 'Cierre de Proyecto', days: 30, critical: true },
        ];
      }

      for (const m of milestones) {
        const dueDate = new Date(newProject.startDate);
        dueDate.setDate(dueDate.getDate() + m.days);
        
        await tx.projectMilestone.create({
          data: {
            tenantId: auth.tenant!.id,
            projectId: newProject.id,
            name: m.name,
            status: 'PENDING',
            dueDate,
            isCritical: m.critical
          }
        });
      }

      return newProject;
    });

    // --- SMART CONNECT INTEGRATION ---
    try {
      const { ConnectService } = await import('@/lib/connect/connect-service');
      
      // 1. Notificar a Ventas
      await ConnectService.notifySystem(
        auth.tenant!.id, 
        'Ventas', 
        `🚀 ¡Nuevo proyecto iniciado: ${project.name}! Presupuesto: ${project.currency} ${project.budget.toLocaleString()}`,
        { entityType: 'Project', entityId: project.id }
      );

      // 2. Crear Canal Dedicado para el Proyecto
      const channelName = `${project.name.replace(/\s+/g, '-').toUpperCase().substring(0, 20)}`;
      await ConnectService.createEntityChannel({
        tenantId: auth.tenant!.id,
        name: channelName,
        type: 'project',
        entityId: project.id,
        userIds: [auth.user!.id] // Suscribir al creador
      });

      // 3. Notificar en el Canal del Proyecto
      const projectChannel = await prisma.chatChannel.findFirst({ where: { name: channelName, tenantId: auth.tenant!.id } });
      if (projectChannel) {
        await ConnectService.sendMessage({
          tenantId: auth.tenant!.id,
          channelId: projectChannel.id,
          content: `Bienvenido al canal operativo de ${project.name}. Aquí se registrarán todos los hitos y comunicaciones técnicas.`,
          isSystemMessage: true,
          attributions: [{ entityType: 'Project', entityId: project.id }]
        });
      }
    } catch (e) {
      console.error('Error in Smart Connect triggers:', e);
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Error al crear el proyecto' }, { status: 500 });
  }
}, ['erp:write']);
