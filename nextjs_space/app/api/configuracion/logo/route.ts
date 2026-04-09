export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadPublicFile } from '@/lib/s3'

// POST - Subir logo corporativo
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const tipo = formData.get('tipo') as string

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
    }

    // Validar tamaño del archivo (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'El archivo es demasiado grande (máximo 5MB)' }, { status: 400 })
    }

    // Convertir a buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = `configuracion/${tipo}-${Date.now()}-${file.name}`

    // Subir a S3 como archivo público
    const { key, publicUrl } = await uploadPublicFile(buffer, fileName, file.type)

    console.log('✅ Logo subido exitosamente:', { key, publicUrl, tipo })

    return NextResponse.json({ 
      url: key,          // Para compatibilidad (key de S3)
      publicUrl,         // URL pública permanente
      downloadUrl: publicUrl,  // Para compatibilidad con código existente
      tipo 
    })
  } catch (error) {
    console.error('Error al subir logo corporativo:', error)
    return NextResponse.json(
      { error: 'Error al subir archivo: ' + (error instanceof Error ? error.message : 'Error desconocido') },
      { status: 500 }
    )
  }
}
