export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPlaudernDocuments, createPlaudernDocument } from '@/lib/plaudern'

/**
 * GET /api/plaudern/knowledge-base
 * Lista documentos de la base de conocimiento
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url)
    const botId = searchParams.get('botId') || integration.botId

    if (!botId) {
      // Si no hay bot configurado, devolver array vacío en lugar de error
      return NextResponse.json({ documents: [], success: true, warning: 'No hay bots configurados aún' })
    }

    const documents = await getPlaudernDocuments(integration.apiKey, botId)

    return NextResponse.json({ documents, success: true })
  } catch (error: any) {
    console.error('Error al obtener documentos:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener documentos' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/plaudern/knowledge-base
 * Sube un documento a la base de conocimiento
 */
export async function POST(req: NextRequest) {
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

    const formData = await req.formData()
    const file = formData.get('file') as File
    const botId = formData.get('botId') as string || integration.botId

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    if (!botId) {
      return NextResponse.json({ error: 'Bot ID requerido' }, { status: 400 })
    }

    // Validar tipo de archivo
    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no soportado. Use PDF, TXT, MD o DOCX' },
        { status: 400 }
      )
    }

    // Validar tamaño (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'El archivo debe ser menor a 10MB' },
        { status: 400 }
      )
    }

    const document = await createPlaudernDocument(integration.apiKey, botId, file)

    // Audit log
    await prisma.auditLog.create({
      data: {
        accion: 'CREATE',
        entidad: 'PlaudernDocument',
        entidadId: document.id,
        userId: user.id,
        tenantId: user.tenantId,
        descripcion: `Documento "${file.name}" subido a Knowledge Base`
      }
    })

    return NextResponse.json({ document, success: true })
  } catch (error: any) {
    console.error('Error al subir documento:', error)
    return NextResponse.json(
      { error: error.message || 'Error al subir documento' },
      { status: 500 }
    )
  }
}
