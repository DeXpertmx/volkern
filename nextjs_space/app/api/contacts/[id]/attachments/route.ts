
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// GET /api/contacts/[id]/attachments - Obtener adjuntos de un contacto
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:read'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const attachments = await prisma.leadAttachment.findMany({
      where: { contactId: params.id, tenantId: auth.tenant.id },
      orderBy: { fechaSubida: 'desc' },
      include: {
        usuario: { select: { name: true } }
      }
    })

    return NextResponse.json(attachments)
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar adjuntos' }, { status: 500 })
  }
}

// POST /api/contacts/[id]/attachments - Crear adjunto para un contacto
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:write'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await request.json()
    const { nombre, tipoArchivo, tamano, cloud_storage_path, descripcion } = data

    const attachment = await prisma.leadAttachment.create({
      data: {
        contactId: params.id,
        tenantId: auth.tenant.id,
        userId: auth.user?.id || null,
        nombre,
        tipoArchivo,
        tamano,
        cloud_storage_path,
        descripcion: descripcion || ''
      }
    })

    return NextResponse.json(attachment, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear adjunto' }, { status: 500 })
  }
}

// DELETE /api/contacts/[id]/attachments - Eliminar adjunto de un contacto
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:write'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get('attachmentId')

    if (!attachmentId) return NextResponse.json({ error: 'ID de adjunto requerido' }, { status: 400 })

    await prisma.leadAttachment.delete({
      where: { id: attachmentId, contactId: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar adjunto' }, { status: 500 })
  }
}
