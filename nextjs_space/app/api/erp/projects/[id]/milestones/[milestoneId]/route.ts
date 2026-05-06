export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { InvoicingService } from '@/lib/invoicing-service';

/**
 * PATCH /api/erp/projects/[id]/milestones/[milestoneId] - Actualizar hito
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId, milestoneId } = params;
    const body = await request.json();

    // 1. Obtener estado actual del hito y del proyecto
    const currentMilestone = await prisma.projectMilestone.findUnique({
      where: { id: milestoneId },
      include: { project: true }
    });

    if (!currentMilestone) {
      return NextResponse.json({ error: 'Hito no encontrado' }, { status: 404 });
    }

    const milestone = await prisma.projectMilestone.update({
      where: { 
        id: milestoneId,
        tenantId: auth.tenant!.id
      },
      data: {
        status: body.status,
        completedAt: body.status === 'COMPLETED' ? new Date() : null,
        name: body.name,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        isCritical: body.isCritical,
        billingPercentage: body.billingPercentage
      }
    });

    // 2. Si se marca como completado y tiene porcentaje de facturación, crear factura
    if (body.status === 'COMPLETED' && currentMilestone.status !== 'COMPLETED' && milestone.billingPercentage > 0) {
      const amount = (currentMilestone.project.budget * milestone.billingPercentage) / 100;
      
      try {
        await InvoicingService.createInvoice({
          tenantId: auth.tenant!.id,
          leadId: currentMilestone.project.leadId || undefined,
          amount,
          currency: currentMilestone.project.currency || 'EUR',
          description: `Facturación por hito: ${milestone.name} (Proyecto: ${currentMilestone.project.name})`,
          items: [{
            name: milestone.name,
            quantity: 1,
            price: amount,
            description: `Hito completado en el proyecto ${currentMilestone.project.name}`
          }]
        });
        console.log(`[Billing] Factura generada para hito ${milestone.id} por valor de ${amount}`);

        // --- SMART CONNECT NOTIFICATION ---
        try {
          const { ConnectService } = await import('@/lib/connect/connect-service');
          await ConnectService.notifySystem(
            auth.tenant!.id,
            'Finanzas',
            `💰 Factura generada automáticamente por hito: ${milestone.name}. Monto: ${currentMilestone.project.currency} ${amount.toLocaleString()}. Proyecto: ${currentMilestone.project.name}`,
            { entityType: 'Project', entityId: currentMilestone.project.id }
          );
        } catch (e) {
          console.error('Error in Smart Connect billing notification:', e);
        }
      } catch (invoiceError) {
        console.error('[Billing] Error al generar factura automática:', invoiceError);
        // No bloqueamos la actualización del hito si la factura falla, 
        // pero idealmente deberíamos notificar al usuario.
      }
    }

    return NextResponse.json(milestone);
  } catch (error) {
    console.error('Error updating milestone:', error);
    return NextResponse.json({ error: 'Error al actualizar hito' }, { status: 500 });
  }
}, ['erp:write']);

/**
 * DELETE /api/erp/projects/[id]/milestones/[milestoneId] - Eliminar hito
 */
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { milestoneId } = params;

    await prisma.projectMilestone.delete({
      where: { 
        id: milestoneId,
        tenantId: auth.tenant!.id
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    return NextResponse.json({ error: 'Error al eliminar hito' }, { status: 500 });
  }
}, ['erp:write']);
