export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadFile, getDownloadUrl } from '@/lib/s3';
import { getBucketConfig } from '@/lib/aws-config';

/**
 * POST /api/tarjetas-digitales/upload
 * Sube archivos (logo o foto de perfil) para la tarjeta digital
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asociado' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const tipo = formData.get('tipo') as string; // 'logo' o 'foto'

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    if (!tipo || !['logo', 'foto'].includes(tipo)) {
      return NextResponse.json(
        { error: 'Tipo de archivo inválido. Debe ser "logo" o "foto"' },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP)' },
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
    const buffer = Buffer.from(await file.arrayBuffer());

    // Obtener configuración de bucket
    const { folderPrefix } = getBucketConfig();

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `${folderPrefix}tarjetas-digitales/${user.tenantId}/${user.id}/${tipo}_${timestamp}_${sanitizedFileName}`;

    // Subir a S3
    const uploadedKey = await uploadFile(buffer, s3Key);

    // Generar URL firmada para mostrar la imagen inmediatamente
    const signedUrl = await getDownloadUrl(uploadedKey, 604800); // 7 días

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'subir',
        entidad: 'tarjeta_digital_archivo',
        entidadId: uploadedKey, // Usamos el S3 key como identificador
        descripcion: `Subió ${tipo === 'logo' ? 'logo' : 'foto de perfil'} para tarjeta digital`,
      },
    });

    return NextResponse.json({
      success: true,
      cloud_storage_path: uploadedKey,
      signed_url: signedUrl,
      message: `${tipo === 'logo' ? 'Logo' : 'Foto'} subida exitosamente`,
    });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    return NextResponse.json(
      { error: 'Error al subir el archivo' },
      { status: 500 }
    );
  }
}
