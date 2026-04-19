
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// GET /api/contacts/[id]/tasks - Obtener tareas de un contacto
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:read'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tasks = await prisma.task.findMany({
      where: { contactId: params.id, tenantId: auth.tenant.id },
      orderBy: { fechaVencimiento: 'asc' },
      include: {
        asignadoUsuario: { select: { id: true, name: true, image: true } }
      }
    })

    return NextResponse.json(tasks)
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar tareas' }, { status: 500 })
  }
}

// POST /api/contacts/[id]/tasks - Crear tarea para un contacto
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:write'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await request.json()
    const { tipo, titulo, descripcion, fechaVencimiento } = data

    const task = await prisma.task.create({
      data: {
        contactId: params.id,
        tenantId: auth.tenant.id,
        tipo: tipo.toLowerCase(),
        titulo,
        descripcion,
        fechaVencimiento: new Date(fechaVencimiento),
        completada: false,
        asignadoA: auth.user?.id || null
      }
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 })
  }
}
