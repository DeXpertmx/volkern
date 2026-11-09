export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { createSystemContext } from '@/lib/skills/context';

// PATCH /api/tasks/[taskId] - Actualizar una tarea
export async function PATCH(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ taskId: string }> }
) {
  const params = await paramsPromise;
  try {
    const auth = await authenticateRequest(request, ['tasks:write']);
    const data = await request.json();
    
    const updateData: any = {};
    
    if (data.completada !== undefined) {
      updateData.completada = data.completada;
      if (data.completada) {
        updateData.fechaCompletado = new Date();
      } else {
        updateData.fechaCompletado = null;
      }
    }
    
    if (data.titulo) updateData.titulo = data.titulo;
    if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
    if (data.tipo) updateData.tipo = data.tipo;
    if (data.fechaVencimiento) updateData.fechaVencimiento = new Date(data.fechaVencimiento);
    if (data.asignadoA !== undefined) updateData.asignadoA = data.asignadoA;

    const task = await prisma.task.update({
      where: { id: params.taskId },
      data: updateData
    });

    // Notificación por Telegram al admin cuando se completa una tarea
    if (updateData.completada === true) {
      const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
      // Obtener tenantId de la tarea
      const taskWithTenant = await prisma.task.findUnique({
        where: { id: params.taskId },
        select: { tenantId: true }
      });
      if (taskWithTenant?.tenantId) {
        notifyByTelegram(
          `✅ *Tarea Completada*\n\n📝 *Título:* ${task.titulo}\n👤 *Asignado a:* ${task.asignadoA || 'Sin asignar'}\n⏰ *Creada:* ${new Date(task.fechaCreacion).toLocaleDateString('es-MX')}`,
          createSystemContext(taskWithTenant.tenantId)
        ).catch(() => {})
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la tarea' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[taskId] - Eliminar una tarea
export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ taskId: string }> }
) {
  const params = await paramsPromise;
  try {
    await prisma.task.delete({
      where: { id: params.taskId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la tarea' },
      { status: 500 }
    );
  }
}
