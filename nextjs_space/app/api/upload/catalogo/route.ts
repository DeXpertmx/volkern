export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadPublicFile } from '@/lib/s3';

// POST /api/upload/catalogo - Subir imágenes para catálogo (públicas)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    // Validar que sea una imagen
    const isImage = !file.type || file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
    if (!isImage) {
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
    }

    // Validar tamaño máximo (15MB)
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'La imagen no puede superar 15MB' }, { status: 400 });
    }

    // Convertir el archivo a buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Generar el nombre del archivo con timestamp
    const timestamp = Date.now();
    let sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    if (!sanitizedFileName.includes('.')) {
      sanitizedFileName += '.png';
    }
    const fileName = `catalogo/${timestamp}-${sanitizedFileName}`;

    // Determinar el Content-Type correcto basado en la extensión del archivo
    let contentType = file.type;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'gif') {
      contentType = 'image/gif';
    } else if (ext === 'png') {
      contentType = 'image/png';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === 'webp') {
      contentType = 'image/webp';
    } else if (ext === 'svg') {
      contentType = 'image/svg+xml';
    }

    // Subir a S3 como archivo público
    const { publicUrl } = await uploadPublicFile(buffer, fileName, contentType || 'image/png');

    return NextResponse.json({
      url: publicUrl,
      data: [publicUrl],
      originalName: file.name,
      size: file.size,
      type: contentType || file.type || 'image/png',
    });
  } catch (error: any) {
    console.error('Error al subir imagen de catálogo:', error);
    return NextResponse.json({ error: error?.message || 'Error al subir imagen' }, { status: 500 });
  }
}
