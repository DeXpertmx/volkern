export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { validateBody } from '@/lib/validation';
import { CitaCreateSchema } from '@/lib/validation/schemas';
import { createCitaConEfectos, CitaError } from '@/lib/services/appointments';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado')
    const tipo = searchParams.get('tipo')
    const fecha = searchParams.get('fecha')
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')
    const sort = searchParams.get('sort')

    const whereClause: any = {
      tenantId: auth.tenant!.id
    }

    const estadosValidos = estado && estado !== 'all'
      ? estado.split(',').map((e: string) => e.toLowerCase().trim())
      : null

    if (tipo && tipo !== 'all') {
      whereClause.tipo = tipo
    }

    if (fecha) {
      const fechaInicioDay = new Date(fecha)
      const fechaFinDay = new Date(fecha)
      fechaFinDay.setDate(fechaFinDay.getDate() + 1)
      whereClause.fechaHora = { gte: fechaInicioDay, lt: fechaFinDay }
    }

    if (fechaInicio && fechaFin) {
      whereClause.fechaHora = {
        gte: new Date(fechaInicio),
        lte: new Date(fechaFin)
      }
    }

    const citas = await prisma.cita.findMany({
      where: whereClause,
      include: { lead: true, servicio: true },
      orderBy: { fechaHora: sort === 'asc' ? 'asc' : 'desc' }
    })

    const result = estadosValidos
      ? citas.filter(c => estadosValidos.includes(c.estado.toLowerCase()))
      : citas

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('CRITICAL ERROR fetching citas:', error?.message || error)
    return NextResponse.json(
      { error: 'Error al obtener citas', details: error?.message },
      { status: 500 }
    )
  }
}, ['citas:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    const data = validateBody(CitaCreateSchema, body);
    if (data instanceof NextResponse) return data;

    // Lógica compartida con el skill MCP create_cita:
    // lib/services/appointments.ts (validaciones, conflictos, efectos)
    const { cita } = await createCitaConEfectos({
      tenantId: auth.tenant!.id,
      actor: { id: auth.user!.id, name: auth.user!.name, email: auth.user!.email },
      tenantNombre: auth.tenant!.nombre,
      data: {
        ...data,
        bufferMinutos: body?.bufferMinutos,
        avisoMinimo: body?.avisoMinimo,
      },
    })

    return NextResponse.json({ success: true, cita })
  } catch (error: any) {
    if (error instanceof CitaError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[POST /api/citas] Error completo:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      name: error?.name,
    })
    return NextResponse.json(
      {
        error: 'Error al crear cita',
        ...(process.env.NODE_ENV === 'development' && { details: error?.message, code: error?.code })
      },
      { status: 500 }
    )
  }
}, ['citas:write'])
