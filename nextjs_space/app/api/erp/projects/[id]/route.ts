export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/projects/[id] - Obtener un proyecto por ID
 */
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;

    const project = await prisma.project.findUnique({
      where: {
        id,
        tenantId: auth.tenant!.id
      },
      include: {
        lead: { select: { id: true, nombre: true, email: true, empresa: true } },
        milestones: { orderBy: { dueDate: 'asc' } },
        _count: { select: { milestones: true, expenses: true, qualityChecks: true } }
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Proyecto no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Error al obtener el proyecto' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * PATCH /api/erp/projects/[id] - Actualizar un proyecto
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;
    const body = await request.json();

    // Verificar que el proyecto existe y pertenece al tenant
    const existing = await prisma.project.findUnique({
      where: { id, tenantId: auth.tenant!.id }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Proyecto no encontrado' },
        { status: 404 }
      );
    }

    // Construir data solo con campos enviados
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.budget !== undefined) data.budget = parseFloat(body.budget);
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.progress !== undefined) data.progress = parseFloat(body.progress);
    if (body.leadId !== undefined) data.leadId = body.leadId;
    if (body.latitude !== undefined) data.latitude = parseFloat(body.latitude);
    if (body.longitude !== undefined) data.longitude = parseFloat(body.longitude);
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;

    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        lead: { select: { id: true, nombre: true } },
        milestones: { orderBy: { dueDate: 'asc' } }
      }
    });

    // Audit log
    try {
      const { AuditService } = await import('@/lib/audit-service');
      const requestIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
      const userAgent = request.headers.get('user-agent') || undefined;
      await AuditService.log({
        tenantId: auth.tenant!.id,
        userId: auth.user!.id,
        action: 'UPDATE',
        entity: 'Project',
        entityId: project.id,
        description: `Proyecto "${project.name}" actualizado por ${auth.user!.name || auth.user!.email}`,
        changesAfter: { name: project.name, status: project.status, budget: project.budget },
        ipAddress: requestIp,
        userAgent
      });
    } catch (e) {
      console.error('Error logging project update audit:', e);
    }

    // Notificar cambios de estado vía Smart Connect
    if (body.status && body.status !== existing.status) {
      try {
        const { ConnectService } = await import('@/lib/connect/connect-service');
        await ConnectService.notifySystem(
          auth.tenant!.id,
          'ERP',
          `📋 Proyecto "${project.name}" cambió de estado: ${existing.status} → ${body.status}`,
          { entityType: 'Project', entityId: project.id }
        );
      } catch (e) {
        console.error('Error sending project status notification:', e);
      }
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Error al actualizar el proyecto' }, { status: 500 });
  }
}, ['erp:write']);

/**
 * DELETE /api/erp/projects/[id] - Eliminar un proyecto
 */
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;

    // Verificar que el proyecto existe y pertenece al tenant
    const existing = await prisma.project.findUnique({
      where: { id, tenantId: auth.tenant!.id },
      include: { _count: { select: { expenses: true, qualityChecks: true } } }
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Proyecto no encontrado' },
        { status: 404 }
      );
    }

    // Prevenir eliminación si tiene gastos registrados
    if (existing._count.expenses > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar un proyecto con gastos registrados. Archívalo en su lugar.' },
        { status: 409 }
      );
    }

    // Eliminar en transacción para mantener consistencia
    await prisma.$transaction(async (tx) => {
      // Eliminar hitos primero (cascade debería manejarlo, pero explícito por seguridad)
      await tx.projectMilestone.deleteMany({ where: { projectId: id } });

      // Eliminar el proyecto
      await tx.project.delete({ where: { id } });
    });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant!.id,
          userId: auth.user!.id,
          accion: 'DELETE',
          entidad: 'Project',
          entidadId: id,
          descripcion: `Proyecto "${existing.name}" eliminado por ${auth.user!.name || auth.user!.email}`,
          cambiosAntes: JSON.stringify({
            name: existing.name,
            status: existing.status,
            budget: existing.budget
          })
        }
      });
    } catch (e) {
      console.error('Error logging project deletion audit:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Proyecto eliminado correctamente'
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Error al eliminar el proyecto' }, { status: 500 });
  }
}, ['erp:write']);
