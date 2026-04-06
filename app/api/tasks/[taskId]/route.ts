export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// PATCH /api/tasks/[taskId] - Actualizar una tarea
export async function PATCH(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
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
  { params }: { params: { taskId: string } }
) {
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
