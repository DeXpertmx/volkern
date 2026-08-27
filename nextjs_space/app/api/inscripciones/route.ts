export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSessionTenantId, tenantWhere } from '@/lib/academy/tenant-guard';

// POST /api/inscripciones - Crear una inscripción
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      estudianteId,
      cursoId,
      tipoAcceso,
      montoPagado,
      cuponUsado,
      stripePaymentId,
      stripeSubscriptionId,
    } = body;

    const tenantId = await getSessionTenantId(session.user?.email);

    // Get course to calculate total lessons (verificando que sea del tenant)
    const curso = await prisma.curso.findFirst({
      where: { id: cursoId, ...tenantWhere(tenantId) },
      include: {
        modulos: {
          include: {
            lecciones: true,
          },
        },
      },
    });

    if (!curso) {
      return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
    }

    // Verificar que el estudiante pertenezca al tenant
    const estudiante = await prisma.estudiante.findFirst({
      where: { id: estudianteId, ...tenantWhere(tenantId) },
      select: { id: true },
    });
    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const totalLecciones = curso.modulos.reduce(
      (sum, modulo) => sum + modulo.lecciones.length,
      0
    );

    const inscripcion = await prisma.inscripcion.create({
      data: {
        estudianteId,
        cursoId,
        tipoAcceso: tipoAcceso || 'compra',
        montoPagado,
        cuponUsado,
        stripePaymentId,
        stripeSubscriptionId,
        totalLecciones,
      },
      include: {
        estudiante: true,
        curso: true,
      },
    });

    // Disparar automatizaciones con trigger `estudiante_inscrito`
    try {
      const { emitEstudianteInscrito } = await import('@/lib/academy/automation-events');
      await emitEstudianteInscrito({
        tenantId: curso.tenantId,
        inscripcionId: inscripcion.id,
        estudianteId: inscripcion.estudianteId,
        cursoId: inscripcion.cursoId,
        estudiante: inscripcion.estudiante as any,
        curso: inscripcion.curso as any,
        inscripcion: inscripcion as any,
      });
    } catch (e) {
      console.error('Error emitiendo trigger estudiante_inscrito:', e);
    }

    return NextResponse.json(inscripcion, { status: 201 });
  } catch (error) {
    console.error('Error al crear inscripción:', error);
    return NextResponse.json({ error: 'Error al crear inscripción' }, { status: 500 });
  }
}
