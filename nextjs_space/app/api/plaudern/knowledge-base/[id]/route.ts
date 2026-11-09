export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deletePlaudernDocument } from '@/lib/plaudern'

/**
 * DELETE /api/plaudern/knowledge-base/[id]
 * Elimina un documento de la base de conocimiento
 */
export async function DELETE(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    const integration = await prisma.plaudernIntegration.findUnique({
      where: { tenantId: user.tenantId }
    })

    if (!integration || !integration.activo) {
      return NextResponse.json({ error: 'Integración de Plaudern no activa' }, { status: 400 })
    }

    await deletePlaudernDocument(integration.apiKey, params.id)

    // Audit log
    await prisma.auditLog.create({
      data: {
        accion: 'DELETE',
        entidad: 'PlaudernDocument',
        entidadId: params.id,
        userId: user.id,
        tenantId: user.tenantId,
        descripcion: 'Documento eliminado de Knowledge Base'
      }
    })

    return NextResponse.json({ success: true, message: 'Documento eliminado' })
  } catch (error: any) {
    console.error('Error al eliminar documento:', error)
    return NextResponse.json(
      { error: error.message || 'Error al eliminar documento' },
      { status: 500 }
    )
  }
}
