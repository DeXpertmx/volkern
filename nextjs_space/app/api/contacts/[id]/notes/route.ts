
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// GET /api/contacts/[id]/notes - Obtener notas de un contacto
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:read'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const notes = await prisma.note.findMany({
      where: { contactId: params.id },
      orderBy: { fechaCreacion: 'desc' },
      include: {
        creador: { select: { id: true, name: true, image: true } }
      }
    })

    return NextResponse.json({ success: true, notes })
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar notas' }, { status: 500 })
  }
}

// POST /api/contacts/[id]/notes - Crear nota para un contacto
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:write'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await request.json()
    const { contenido, metadata } = data

    const note = await prisma.note.create({
      data: {
        contactId: params.id,
        contenido,
        metadata: metadata || {},
        creadoPor: auth.user?.id || null
      },
      include: {
        creador: { select: { id: true, name: true, image: true } }
      }
    })

    return NextResponse.json({ success: true, note }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear nota' }, { status: 500 })
  }
}
