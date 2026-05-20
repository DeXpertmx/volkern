export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/ausencias - Obtener ausencias del usuario
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user!.id;
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get('mes'); // Formato: "2026-05"

    let whereClause: any = { userId, activo: true };

    // Filtrar por mes si se proporciona
    if (mes) {
      const [year, month] = mes.split('-').map(Number);
      const fechaInicio = new Date(year, month - 1, 1);
      const fechaFin = new Date(year, month, 0, 23, 59, 59);
      
      whereClause = {
        ...whereClause,
        OR: [
          { fechaInicio: { gte: fechaInicio, lte: fechaFin } },
          { fechaFin: { gte: fechaInicio, lte: fechaFin } },
          { fechaInicio: { lte: fechaInicio }, fechaFin: { gte: fechaFin } }
        ]
      };
    }

    const ausencias = await prisma.ausencia.findMany({
      where: whereClause,
      orderBy: { fechaInicio: 'asc' }
    });

    return NextResponse.json(ausencias);
  } catch (error: any) {
    console.error('Error fetching ausencias:', error);
    return NextResponse.json(
      { error: 'Error al obtener ausencias' },
      { status: 500 }
    )
  }
})

// POST /api/ausencias - Crear ausencia
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user!.id;
    const body = await request.json();
    const { titulo, fechaInicio, fechaFin, razon, tipo, color } = body;

    if (!titulo || !fechaInicio || !fechaFin) {
      return NextResponse.json(
        { error: 'Se requiere título, fecha inicio y fecha fin' },
        { status: 400 }
      );
    }

    // Validar que la fecha fin sea mayor o igual a fecha inicio
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    if (fin < inicio) {
      return NextResponse.json(
        { error: 'La fecha fin debe ser mayor o igual a la fecha inicio' },
        { status: 400 }
      );
    }

    const ausencia = await prisma.ausencia.create({
      data: {
        userId,
        titulo,
        fechaInicio: inicio,
        fechaFin: fin,
        razon,
        tipo: tipo || 'vacaciones',
        color: color || '#ef4444',
        activo: true
      }
    });

    return NextResponse.json(ausencia);
  } catch (error: any) {
    console.error('Error creating ausencia:', error);
    return NextResponse.json(
      { error: 'Error al crear ausencia' },
      { status: 500 }
    )
  }
})

// PUT /api/ausencias - Actualizar ausencia
export const PUT = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user!.id;
    const body = await request.json();
    const { id, titulo, fechaInicio, fechaFin, razon, tipo, color, activo } = body;

    if (!id) {
      return NextResponse.json({ error: 'Se requiere el ID de la ausencia' }, { status: 400 });
    }

    // Verificar que la ausencia pertenece al usuario
    const existente = await prisma.ausencia.findFirst({
      where: { id, userId }
    });

    if (!existente) {
      return NextResponse.json({ error: 'Ausencia no encontrada' }, { status: 404 });
    }

    const ausencia = await prisma.ausencia.update({
      where: { id },
      data: {
        titulo: titulo ?? existente.titulo,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : existente.fechaInicio,
        fechaFin: fechaFin ? new Date(fechaFin) : existente.fechaFin,
        razon: razon ?? existente.razon,
        tipo: tipo ?? existente.tipo,
        color: color ?? existente.color,
        activo: activo ?? existente.activo
      }
    });

    return NextResponse.json(ausencia);
  } catch (error: any) {
    console.error('Error updating ausencia:', error);
    return NextResponse.json(
      { error: 'Error al actualizar ausencia' },
      { status: 500 }
    )
  }
})

// DELETE /api/ausencias - Eliminar ausencia
export const DELETE = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user!.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Se requiere el ID de la ausencia' }, { status: 400 });
    }

    // Verificar que la ausencia pertenece al usuario
    const existente = await prisma.ausencia.findFirst({
      where: { id, userId }
    });

    if (!existente) {
      return NextResponse.json({ error: 'Ausencia no encontrada' }, { status: 404 });
    }

    // Eliminación lógica (marcar como inactivo)
    await prisma.ausencia.update({
      where: { id },
      data: { activo: false }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting ausencia:', error);
    return NextResponse.json(
      { error: 'Error al eliminar ausencia' },
      { status: 500 }
    )
  }
})