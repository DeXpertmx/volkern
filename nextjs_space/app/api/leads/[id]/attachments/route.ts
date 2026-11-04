import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Listar adjuntos de un lead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await authenticateRequest(request, ['leads:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const attachments = await prisma.leadAttachment.findMany({
      where: {
        leadId: id,
        tenantId: auth.tenant!.id
      },
      orderBy: {
        fechaSubida: 'desc'
      },
      include: {
        usuario: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json(attachments);
  } catch (error) {
    console.error('Error fetching lead attachments:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Registrar un nuevo adjunto
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await authenticateRequest(request, ['leads:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { nombre, tipoArchivo, tamano, cloud_storage_path, descripcion } = body;

    if (!nombre || !tipoArchivo || !cloud_storage_path) {
      return NextResponse.json({ error: 'Información de archivo incompleta' }, { status: 400 });
    }

    const attachment = await prisma.leadAttachment.create({
      data: {
        leadId: id,
        tenantId: auth.tenant!.id,
        userId: auth.user!.id,
        nombre,
        tipoArchivo,
        tamano,
        cloud_storage_path,
        descripcion
      }
    });

    return NextResponse.json(attachment);
  } catch (error) {
    console.error('Error creating lead attachment:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE - Eliminar un adjunto
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await authenticateRequest(request, ['leads:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json({ error: 'ID de adjunto requerido' }, { status: 400 });
    }

    await prisma.leadAttachment.delete({
      where: {
        id: attachmentId,
        leadId: id,
        tenantId: auth.tenant!.id
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead attachment:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
