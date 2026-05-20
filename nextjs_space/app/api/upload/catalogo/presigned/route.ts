export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPublicUploadUrl } from '@/lib/s3';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { fileName, fileType } = body;

    if (!fileName || !fileType) {
      return NextResponse.json({ error: 'Faltan parámetros fileName o fileType' }, { status: 400 });
    }

    // Validar que sea una imagen
    const isImage = fileType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(fileName);
    if (!isImage) {
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
    }

    // Mapear extensión a Content-Type correcto para la carga directa
    let contentType = fileType;
    const ext = fileName.split('.').pop()?.toLowerCase();
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

    const { uploadUrl, publicUrl } = await getPublicUploadUrl(fileName, contentType);

    return NextResponse.json({
      uploadUrl,
      publicUrl,
    });
  } catch (error: any) {
    console.error('Error al generar presigned URL pública:', error);
    return NextResponse.json({ error: error?.message || 'Error al generar presigned URL' }, { status: 500 });
  }
}
