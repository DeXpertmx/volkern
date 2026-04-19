
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authenticateRequest } from '@/lib/api-key-auth'

// GET /api/contacts/[id]/conversaciones - Obtener conversaciones de un contacto
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateRequest(request, ['contacts:read'])
    if (!auth.valid || !auth.tenant) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const conversaciones = await prisma.conversation.findMany({
      where: { contactId: params.id, tenantId: auth.tenant.id },
      orderBy: { fechaUltimoMensaje: 'desc' }
    })

    return NextResponse.json({ success: true, conversaciones })
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar conversaciones' }, { status: 500 })
  }
}
