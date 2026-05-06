export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/comunidad/moderacion
 * Fetch all comments relevant to the admin's tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse('No autorizado', { status: 401 });

    const { searchParams } = new URL(req.url);
    const cursoId = searchParams.get('cursoId');

    // Queremos comentarios de los cursos que pertenecen al tenant del admin
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { tenantId: true }
    });

    if (!currentUser?.tenantId) return new NextResponse('Tenant no encontrado', { status: 404 });

    const comments = await prisma.comentario.findMany({
      where: {
        AND: [
          cursoId ? { cursoId } : {},
          {
            OR: [
              { curso: { tenantId: currentUser.tenantId } },
              { leccion: { modulo: { curso: { tenantId: currentUser.tenantId } } } }
            ]
          }
        ]
      },
      include: {
        estudiante: {
          select: {
            primerNombre: true,
            apellidoPaterno: true,
            email: true,
          }
        },
        curso: {
          select: { titulo: true }
        },
        leccion: {
          select: { 
            titulo: true, 
            modulo: { select: { curso: { select: { titulo: true } } } } 
          }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(comments);
  } catch (error: any) {
    console.error('Error fetching moderation comments:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}

/**
 * PATCH /api/comunidad/moderacion?id=[commentId]
 * Toggle approval or update comment.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse('No autorizado', { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return new NextResponse('ID missing', { status: 400 });

    const { aprobado } = await req.json();

    const comment = await prisma.comentario.update({
      where: { id },
      data: { aprobado }
    });

    return NextResponse.json(comment);
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}

/**
 * DELETE /api/comunidad/moderacion?id=[commentId]
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse('No autorizado', { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return new NextResponse('ID missing', { status: 400 });

    await prisma.comentario.delete({
      where: { id }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
