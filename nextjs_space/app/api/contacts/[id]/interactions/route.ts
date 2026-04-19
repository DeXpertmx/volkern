
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'
import { logAuditAction } from '@/lib/permissions'

// GET /api/contacts/[id]/interactions - Obtener interacciones de un contacto
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:read'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const interactions = await prisma.interaction.findMany({
      where: { contactId: params.id },
      orderBy: { fechaCreacion: 'desc' },
      include: {
        creador: { select: { id: true, name: true, email: true } }
      }
    })

    return NextResponse.json({ success: true, interactions })
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar interacciones' }, { status: 500 })
  }
}

// POST /api/contacts/[id]/interactions - Crear interacción para un contacto
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:write'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await request.json()
    const { tipo, contenido, resultado, metadatos } = data

    const interaction = await prisma.interaction.create({
      data: {
        contactId: params.id,
        tipo: tipo.toLowerCase(),
        contenido,
        resultado: resultado ? resultado.toLowerCase() : null,
        creadoPor: auth.user?.id || null,
        metadatos: metadatos || null
      },
      include: {
        creador: { select: { id: true, name: true, email: true } }
      }
    })

    return NextResponse.json({ success: true, interaction }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear interacción' }, { status: 500 })
  }
}
