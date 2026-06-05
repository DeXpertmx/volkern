export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadFile, uploadEncryptedFile, getEncryptedDownloadUrl } from '@/lib/s3';

// POST /api/upload - Subir un archivo (video o material)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string; // 'video' o 'material'
    const encrypt = formData.get('encrypt') === 'true'; // si se debe cifrar con AES

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    // Convertir el archivo a buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Generar el nombre del archivo con timestamp
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${type}s/${timestamp}-${sanitizedFileName}`;

    let cloud_storage_path: string;
    let downloadUrl: string | undefined;

    if (encrypt) {
      // Subir cifrado con AES-256-CBC
      cloud_storage_path = await uploadEncryptedFile(buffer, fileName, file.type);
      downloadUrl = getEncryptedDownloadUrl(cloud_storage_path);
    } else {
      // Subir normal (sin cifrar)
      cloud_storage_path = await uploadFile(buffer, fileName, file.type);
    }

    return NextResponse.json({
      cloud_storage_path,
      encrypted: encrypt,
      downloadUrl,
      originalName: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 });
  }
}
