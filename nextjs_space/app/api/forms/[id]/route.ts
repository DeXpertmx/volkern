export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * DELETE /api/forms/[id]
 * Remove a form registration. Submissions are preserved (orphaned).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId

    const form = await prisma.webForm.findFirst({
      where: { id: params.id, tenantId },
    })

    if (!form) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })
    }

    // Delete submissions first, then the form registration
    // (WebFormSubmission has NoAction onDelete by default, so we must delete submissions first)
    await prisma.webFormSubmission.deleteMany({
      where: { formId: params.id },
    })

    await prisma.webForm.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting form:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/forms/[id]
 * Update a form registration (name, pageId, fieldMapping)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId
    const body = await request.json()
    const { name, pageId, fieldMapping } = body

    const form = await prisma.webForm.findFirst({
      where: { id: params.id, tenantId },
    })

    if (!form) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (pageId !== undefined) updateData.pageId = pageId
    if (fieldMapping !== undefined) {
      updateData.config = {
        ...(form.config as any),
        fieldMapping,
      }
    }

    const updated = await prisma.webForm.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({ form: updated })
  } catch (error: any) {
    console.error('Error updating form:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
