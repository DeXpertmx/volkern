export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { notifyNewCommunityThread, notifyCommunityReply } from '@/lib/services/community-notifications';

/**
 * GET /api/cursos/[id]/comunidad
 * Recupera el feed de discusiones del curso.
 */
export async function GET(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

    const comentarios = await prisma.comentario.findMany({
      where: {
        cursoId: params.id,
        comentarioPadreId: null, // Solo hilos principales
        aprobado: true,
      },
      include: {
        estudiante: {
          select: {
            primerNombre: true,
            apellidoPaterno: true,
            email: true,
          }
        },
        respuestas: {
          where: { aprobado: true },
          include: {
            estudiante: {
              select: {
                primerNombre: true,
                apellidoPaterno: true,
              }
            }
          },
          orderBy: { fechaCreacion: 'asc' }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(comentarios);
  } catch (error: any) {
    console.error('Error fetching community:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}

/**
 * POST /api/cursos/[id]/comunidad
 * Crea una nueva discusión o respuesta.
 */
export async function POST(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });

    const { comentario, comentarioPadreId } = await req.json();

    // 1. Obtener al estudiante actual
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email! }
    });

    if (!estudiante) return new NextResponse('Estudiante no encontrado', { status: 404 });

    // 2. Crear el comentario
    const nuevoComentario = await prisma.comentario.create({
      data: {
        comentario,
        cursoId: params.id,
        estudianteId: estudiante.id,
        comentarioPadreId: comentarioPadreId || null,
        aprobado: true,
      },
      include: {
        estudiante: true,
        curso: true,
      }
    });

    // 3. Notificaciones Asíncronas (No bloqueamos el Response)
    if (comentarioPadreId) {
      // Es una respuesta: Notificar al autor del post original
      const padre = await prisma.comentario.findUnique({
        where: { id: comentarioPadreId },
        include: { estudiante: true }
      });

      if (padre?.estudiante.email && padre.estudiante.email !== estudiante.email) {
        notifyCommunityReply({
          recipientEmail: padre.estudiante.email,
          responderName: `${estudiante.primerNombre} ${estudiante.apellidoPaterno}`,
          courseTitle: nuevoComentario.curso?.titulo || 'tu curso',
          replyContent: comentario,
          threadUrl: `${process.env.NEXTAUTH_URL}/estudiante/mis-cursos/${params.id}`,
        }).catch(err => console.error('Error notifying reply:', err));
      }
    } else {
      // Es un nuevo hilo: Notificar al instructor del curso
      const curso = await prisma.curso.findUnique({
        where: { id: params.id },
        select: { instructorNombre: true, titulo: true, tenantId: true }
      });

      // Buscamos el email del instructor (asumiendo que es un usuario del tenant con el nombre del instructor)
      // O buscamos al admin del tenant
      const admin = await prisma.user.findFirst({
        where: { 
          tenantId: curso?.tenantId,
          role: { nombre: 'admin' }
        }
      });

      if (admin?.email) {
        notifyNewCommunityThread({
          instructorEmail: admin.email,
          studentName: `${estudiante.primerNombre} ${estudiante.apellidoPaterno}`,
          courseTitle: curso?.titulo || 'Curso',
          commentContent: comentario,
          courseUrl: `${process.env.NEXTAUTH_URL}/dashboard/cursos/${params.id}`,
        }).catch(err => console.error('Error notifying instructor:', err));
      }
    }

    return NextResponse.json(nuevoComentario);
  } catch (error: any) {
    console.error('Error posting to community:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
