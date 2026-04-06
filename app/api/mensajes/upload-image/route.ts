export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadFile } from '@/lib/s3';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Obtener el archivo del FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    // Validar tipo de archivo (solo imágenes)
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no válido. Solo se permiten imágenes (JPG, PNG, GIF, WEBP)' },
        { status: 400 }
      );
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'El archivo es demasiado grande. Tamaño máximo: 5MB' },
        { status: 400 }
      );
    }

    // Convertir a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generar nombre único
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `mensajes/${user.tenantId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

    // Subir a S3
    const cloud_storage_path = await uploadFile(buffer, fileName, file.type);

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'imagen_subida',
        entidad: 'Message',
        entidadId: cloud_storage_path,
        descripcion: `Imagen subida para mensajería: ${file.name}`,
      },
    });

    console.log(`[Upload Image] Image uploaded successfully: ${cloud_storage_path}`);

    return NextResponse.json({
      success: true,
      cloud_storage_path,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      message: 'Imagen subida exitosamente',
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      {
        error: 'Error al subir la imagen',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
