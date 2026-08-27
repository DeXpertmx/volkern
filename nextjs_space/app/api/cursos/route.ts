export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSessionTenantId, tenantWhere } from '@/lib/academy/tenant-guard';

// GET /api/cursos - Obtener todos los cursos
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const publicado = searchParams.get('publicado');
    const categoria = searchParams.get('categoria');

    // Aislamiento multi-tenant: cada tenant solo ve sus propios cursos.
    // El superadmin (sin tenant) sigue viendo todos.
    const tenantId = await getSessionTenantId(session.user.email);

    const where: any = { ...tenantWhere(tenantId) };

    if (publicado) {
      where.publicado = publicado === 'true';
    }
    
    if (categoria) {
      where.categoria = categoria;
    }

    const cursos = await prisma.curso.findMany({
      where,
      include: {
        modulos: {
          include: {
            lecciones: true,
          },
          orderBy: {
            orden: 'asc',
          },
        },
        _count: {
          select: {
            inscripciones: true,
            reviews: true,
          },
        },
        reviews: {
          where: { aprobado: true },
          select: {
            calificacion: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    // Calculate average ratings
    const cursosWithRatings = cursos.map(curso => {
      const totalReviews = curso.reviews.length;
      const avgRating = totalReviews > 0
        ? curso.reviews.reduce((sum, r) => sum + r.calificacion, 0) / totalReviews
        : 0;
      
      return {
        ...curso,
        promedioCalificacion: Number(avgRating.toFixed(1)),
        totalReviews,
      };
    });

    return NextResponse.json(cursosWithRatings);
  } catch (error) {
    console.error('Error al obtener cursos:', error);
    return NextResponse.json({ error: 'Error al obtener cursos' }, { status: 500 });
  }
}

// POST /api/cursos - Crear un nuevo curso
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      titulo,
      subtitulo,
      descripcion,
      descripcionLarga,
      imagenDestacada,
      categoria,
      nivel,
      duracionEstimadaHoras,
      instructorNombre,
      instructorBio,
      instructorImagen,
      instructorFirma,
      tipoMonetizacion,
      precio,
      precioSuscripcion,
      moneda,
      permiteCupones,
      tipoAcceso,
      fechaInicio,
      diasExpiracion,
      nivelMembresia,
      publicado,
      permiteComentarios,
      permiteCalificaciones,
      certificadoHabilitado,
      puntuajeMinimoCertificado,
      urlSlug,
      metaDescripcion,
      testimonios,
      faq,
    } = body;

    // Generate URL slug if not provided
    const slug = urlSlug || titulo.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const tenantId = await getSessionTenantId(session.user.email);

    const curso = await prisma.curso.create({
      data: {
        tenantId: tenantId || null,
        titulo,
        subtitulo,
        descripcion,
        descripcionLarga,
        imagenDestacada,
        categoria,
        nivel: nivel || 'principiante',
        duracionEstimadaHoras,
        instructorNombre,
        instructorBio,
        instructorImagen,
        instructorFirma,
        tipoMonetizacion: tipoMonetizacion || 'one_time',
        precio: precio || 0,
        precioSuscripcion,
        moneda: moneda || 'EUR',
        permiteCupones: permiteCupones !== undefined ? permiteCupones : true,
        tipoAcceso: tipoAcceso || 'immediate',
        fechaInicio,
        diasExpiracion,
        nivelMembresia,
        publicado: publicado || false,
        permiteComentarios: permiteComentarios !== undefined ? permiteComentarios : true,
        permiteCalificaciones: permiteCalificaciones !== undefined ? permiteCalificaciones : true,
        certificadoHabilitado: certificadoHabilitado !== undefined ? certificadoHabilitado : true,
        puntuajeMinimoCertificado: puntuajeMinimoCertificado || 80,
        urlSlug: slug,
        metaDescripcion,
        testimonios,
        faq,
      },
    });

    return NextResponse.json(curso, { status: 201 });
  } catch (error) {
    console.error('Error al crear curso:', error);
    return NextResponse.json({ error: 'Error al crear curso' }, { status: 500 });
  }
}
