export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/forms
 * List all Tally forms registered for the current tenant
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId

    const forms = await prisma.webForm.findMany({
      where: { tenantId },
      include: {
        page: { select: { id: true, titulo: true, slug: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ forms })
  } catch (error: any) {
    console.error('Error listing forms:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/forms
 * Register a new Tally form for the current tenant
 * 
 * Body:
 * {
 *   name: string               // Nombre interno del formulario
 *   tallyFormId: string        // ID del form en Tally (de la URL tally.so/r/formId)
 *   pageId?: string            // ID de la landing page donde se embebe (opcional)
 *   fieldMapping?: {           // Mapeo de campos Tally a CRM
 *     "field_xxxx": "email",
 *     "field_xxxx": "nombre"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId
    const body = await request.json()
    const { name, tallyFormId, pageId, fieldMapping } = body

    if (!name || !tallyFormId) {
      return NextResponse.json(
        { error: 'Nombre y tallyFormId son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que no exista duplicado
    const existing = await prisma.webForm.findFirst({
      where: {
        tenantId,
        config: { path: ['tallyFormId'], equals: tallyFormId },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un formulario registrado con ese Tally ID' },
        { status: 409 }
      )
    }

    // Si se especifica pageId, verificar que pertenece al tenant
    if (pageId) {
      const page = await prisma.page.findFirst({
        where: { id: pageId, tenantId },
        select: { id: true },
      })
      if (!page) {
        return NextResponse.json(
          { error: 'La página especificada no existe' },
          { status: 400 }
        )
      }
    }

    const form = await prisma.webForm.create({
      data: {
        tenantId,
        name,
        pageId: pageId || null,
        config: {
          tallyFormId,
          fieldMapping: fieldMapping || {},
        },
      },
    })

    return NextResponse.json({ form }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating form:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
