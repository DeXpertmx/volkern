import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-helpers';

/**
 * GET /api/admin/backup
 * Obtiene el historial de backups realizados
 */
export async function GET(request: Request) {
  const auth = await isAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const backups = await prisma.systemBackup.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Convertir BigInt a Number/String para JSON
    const formattedBackups = backups.map(b => ({
      ...b,
      fileSize: b.fileSize ? b.fileSize.toString() : null,
    }));

    return NextResponse.json({ success: true, backups: formattedBackups });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/backup
 * Registra el resultado de un backup (llamado por el script de shell)
 */
export async function POST(request: Request) {
  // Para permitir que el script de shell llame al API, usaremos una API Key simple
  // definida en las variables de entorno para seguridad básica.
  const apiKey = request.headers.get('x-api-key');
  const internalKey = process.env.AI_SKILL_HANDLER_API_KEY || 'volkern_backup_key_2024';

  if (apiKey !== internalKey) {
    // Si no hay API Key, intentamos Auth normal (para pruebas manuales)
    const auth = await isAdminRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { status, fileName, fileSize, storageProvider, checksum, errorMessage } = body;

    if (!status) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    const backup = await prisma.systemBackup.create({
      data: {
        status,
        fileName,
        fileSize: fileSize ? BigInt(fileSize) : null,
        storageProvider: storageProvider || 'S3',
        checksum,
        errorMessage,
      },
    });

    return NextResponse.json({ 
      success: true, 
      id: backup.id,
      message: 'Backup registrado correctamente' 
    });
  } catch (error: any) {
    console.error('[BACKUP_API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
