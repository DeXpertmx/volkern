export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'
import { uploadFile } from '@/lib/s3'
import { getBucketConfig } from '@/lib/aws-config'

// POST - Subir archivo
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    // Verificar que el deal existe
    const deal = await prisma.deal.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const categoria = formData.get('categoria') as string || 'otro'
    const descripcion = formData.get('descripcion') as string || null

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    // Convertir archivo a buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Configuración de S3
    const { folderPrefix } = getBucketConfig()
    const extension = file.name.split('.').pop()
    const fileName = `${folderPrefix}deals/${params.id}/${Date.now()}-${file.name}`

    // Subir a S3
    const cloud_storage_path = await uploadFile(buffer, fileName)

    // Guardar en base de datos
    const attachment = await prisma.dealAttachment.create({
      data: {
        dealId: params.id,
        tenantId: user.tenantId,
        userId: user.id,
        nombre: file.name,
        tipoArchivo: extension || 'unknown',
        tamano: buffer.length,
        cloud_storage_path,
        categoria,
        descripcion,
      },
      include: {
        usuario: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Registrar actividad
    await prisma.dealActivity.create({
      data: {
        dealId: params.id,
        tenantId: user.tenantId,
        userId: user.id,
        tipo: 'archivo',
        titulo: 'Archivo adjuntado',
        descripcion: `Archivo "${file.name}" subido`,
      },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'crear',
        entidad: 'deal_attachment',
        entidadId: attachment.id,
        descripcion: `Usuario ${user.name} subió archivo "${file.name}" al deal "${deal.titulo}"`,
        cambiosDespues: attachment,
      },
    })

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error: any) {
    console.error('Error al subir archivo:', error)
    return NextResponse.json(
      { error: 'Error al subir archivo', details: error.message },
      { status: 500 }
    )
  }
}

// GET - Listar archivos del deal
export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const attachments = await prisma.dealAttachment.findMany({
      where: {
        dealId: params.id,
        tenantId: user.tenantId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        fechaSubida: 'desc',
      },
    })

    return NextResponse.json({ attachments })
  } catch (error: any) {
    console.error('Error al obtener archivos:', error)
    return NextResponse.json(
      { error: 'Error al obtener archivos', details: error.message },
      { status: 500 }
    )
  }
}
