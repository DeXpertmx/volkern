export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadPublicFile } from '@/lib/s3';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    // Validar tipo de archivo
    const isImage = !file.type || file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
    if (!isImage) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 });
    }

    // Validar tamaño (5MB máximo)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo de 5MB' }, { status: 400 });
    }

    // Convertir a buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generar nombre único para el archivo
    let fileExt = 'png';
    if (file.name.includes('.')) {
      fileExt = file.name.split('.').pop() || 'png';
    }
    const fileName = `avatars/user-${session.user.id}-${Date.now()}.${fileExt}`;

    // Subir a S3 como archivo público
    const { key, publicUrl } = await uploadPublicFile(buffer, fileName, file.type || 'image/png');

    // Actualizar el usuario en la base de datos
    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: publicUrl },
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      downloadUrl: publicUrl,
      key,
    });
  } catch (error) {
    console.error('Error al subir avatar:', error);
    return NextResponse.json(
      { error: 'Error al procesar la imagen' },
      { status: 500 }
    );
  }
}
