import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { downloadAndDecryptFile } from '@/lib/s3';

/**
 * GET /api/files/download?key=<s3_key>
 * 
 * Descarga un archivo cifrado desde S3, lo desencripta y lo sirve.
 * El parámetro `key` es la cloud_storage_path del archivo cifrado (termina en .enc).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const filename = searchParams.get('filename') || 'download';

    if (!key) {
      return NextResponse.json({ error: 'Falta el parámetro key' }, { status: 400 });
    }

    if (!key.endsWith('.enc')) {
      return NextResponse.json({ error: 'El archivo no está cifrado' }, { status: 400 });
    }

    const { buffer, originalKey } = await downloadAndDecryptFile(key);

    // Inferir el content type del nombre original
    const ext = originalKey.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      txt: 'text/plain',
      json: 'application/json',
      zip: 'application/zip',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${originalKey.split('/').pop() || filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[FileDownload] Error:', error);
    const message = error instanceof Error ? error.message : 'Error al descargar archivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
