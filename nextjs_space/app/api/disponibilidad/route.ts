export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/disponibilidad - Obtener horarios de disponibilidad del usuario
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user!.id;

    // Obtener horarios de disponibilidad
    const horarios = await prisma.disponibilidad.findMany({
      where: { userId },
      orderBy: { diaSemana: 'asc' }
    });

    // Si no hay horarios, crear los defaults
    if (horarios.length === 0) {
      const defaultHorarios = [
        { userId, diaSemana: 1, bloques: [{inicio: '09:00', fin: '18:00'}], activo: true, intervaloMin: 30 },
        { userId, diaSemana: 2, bloques: [{inicio: '09:00', fin: '18:00'}], activo: true, intervaloMin: 30 },
        { userId, diaSemana: 3, bloques: [{inicio: '09:00', fin: '18:00'}], activo: true, intervaloMin: 30 },
        { userId, diaSemana: 4, bloques: [{inicio: '09:00', fin: '18:00'}], activo: true, intervaloMin: 30 },
        { userId, diaSemana: 5, bloques: [{inicio: '09:00', fin: '18:00'}], activo: true, intervaloMin: 30 },
      ];
      
      await prisma.disponibilidad.createMany({ data: defaultHorarios });
      
      return NextResponse.json(defaultHorarios);
    }

    return NextResponse.json(horarios);
  } catch (error: any) {
    console.error('Error fetching disponibilidad:', error);
    return NextResponse.json(
      { error: 'Error al obtener horarios de disponibilidad' },
      { status: 500 }
    )
  }
}, ['citas:read'])

// PUT /api/disponibilidad - Actualizar horarios de disponibilidad
export const PUT = withTenantAuth(async (request, auth) => {
  try {
    const userId = auth.user!.id;
    const body = await request.json();
    const { horarios } = body;

    if (!Array.isArray(horarios)) {
      return NextResponse.json({ error: 'Horarios debe ser un array' }, { status: 400 });
    }

    // Eliminar horarios existentes y crear nuevos
    await prisma.disponibilidad.deleteMany({ where: { userId } });

    const created = await prisma.disponibilidad.createMany({
      data: horarios.map((h: any) => ({
        userId,
        diaSemana: h.diaSemana,
        bloques: h.bloques || [{inicio: '09:00', fin: '18:00'}],
        activo: h.activo ?? true,
        intervaloMin: h.intervaloMin ?? 30,
      }))
    });

    return NextResponse.json({ success: true, count: created.count });
  } catch (error: any) {
    console.error('Error updating disponibilidad:', error);
    return NextResponse.json(
      { error: 'Error al guardar horarios' },
      { status: 500 }
    )
  }
}, ['citas:write'])