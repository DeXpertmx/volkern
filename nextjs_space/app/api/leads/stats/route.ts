export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Obtener tenant del usuario
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const periodo = searchParams.get('periodo') || '30'; // días

    const fechaInicio = new Date();
    fechaInicio.setDate(fechaInicio.getDate() - parseInt(periodo));

    // Estadísticas generales
    const totalLeads = await prisma.lead.count({
      where: { tenantId: user.tenantId },
    });

    const leadsPorEstado = await prisma.lead.groupBy({
      by: ['estado'],
      where: { tenantId: user.tenantId },
      _count: true,
    });

    const leadsNuevos = await prisma.lead.count({
      where: {
        tenantId: user.tenantId,
        fechaCreacion: { gte: fechaInicio },
      },
    });

    const leadsConvertidos = await prisma.lead.count({
      where: {
        tenantId: user.tenantId,
        estado: 'convertido',
        fechaCreacion: { gte: fechaInicio },
      },
    });

    const leadsAsignados = await prisma.lead.count({
      where: {
        tenantId: user.tenantId,
        asignadoA: { not: null },
      },
    });

    const leadsSinAsignar = await prisma.lead.count({
      where: {
        tenantId: user.tenantId,
        asignadoA: null,
      },
    });

    // Leads por fuente
    const leadsPorFuente = await prisma.lead.groupBy({
      by: ['fuente'],
      where: {
        tenantId: user.tenantId,
        fuente: { not: null },
        fechaCreacion: { gte: fechaInicio },
      },
      _count: true,
    });

    // Tasa de conversión
    const tasaConversion =
      leadsNuevos > 0 ? (leadsConvertidos / leadsNuevos) * 100 : 0;

    // Score promedio - usando la relación LeadScore
    const leadsWithScores = await prisma.leadScore.aggregate({
      where: {
        lead: {
          tenantId: user.tenantId,
        },
      },
      _avg: {
        puntuacion: true,
      },
    });

    // Top leads por score - usando la relación LeadScore
    const topLeads = await prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        score: { isNot: null },
      },
      orderBy: {
        score: {
          puntuacion: 'desc',
        },
      },
      take: 10,
      select: {
        id: true,
        nombre: true,
        email: true,
        empresa: true,
        estado: true,
        fuente: true,
        score: {
          select: {
            puntuacion: true,
          },
        },
      },
    });

    // Leads por usuario asignado
    const leadsPorUsuario = await prisma.lead.groupBy({
      by: ['asignadoA'],
      where: {
        tenantId: user.tenantId,
        asignadoA: { not: null },
      },
      _count: true,
    });

    // Obtener nombres de usuarios
    const usuarioIds = leadsPorUsuario
      .map((l) => l.asignadoA)
      .filter((id): id is string => id !== null);
    const usuarios = await prisma.user.findMany({
      where: { id: { in: usuarioIds } },
      select: { id: true, name: true, email: true },
    });

    const leadsPorUsuarioConNombres = leadsPorUsuario.map((item) => ({
      usuarioId: item.asignadoA,
      usuarioNombre:
        usuarios.find((u) => u.id === item.asignadoA)?.name ||
        usuarios.find((u) => u.id === item.asignadoA)?.email ||
        'Usuario Desconocido',
      count: item._count,
    }));

    // Evolución de leads en el tiempo (últimos 7 días)
    const evolucionLeads = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      fecha.setHours(0, 0, 0, 0);

      const fechaFin = new Date(fecha);
      fechaFin.setDate(fechaFin.getDate() + 1);

      const count = await prisma.lead.count({
        where: {
          tenantId: user.tenantId,
          fechaCreacion: {
            gte: fecha,
            lt: fechaFin,
          },
        },
      });

      evolucionLeads.push({
        fecha: fecha.toISOString().split('T')[0],
        count,
      });
    }

    // Transform topLeads to include score as a number
    const topLeadsFormatted = topLeads.map((lead) => ({
      id: lead.id,
      nombre: lead.nombre,
      email: lead.email,
      empresa: lead.empresa,
      estado: lead.estado,
      fuente: lead.fuente,
      score: lead.score?.puntuacion || 0,
    }));

    return NextResponse.json({
      success: true,
      stats: {
        overview: {
          totalLeads,
          leadsNuevos,
          leadsConvertidos,
          leadsAsignados,
          leadsSinAsignar,
          tasaConversion: Math.round(tasaConversion * 100) / 100,
          scorePromedio: Math.round((leadsWithScores._avg.puntuacion || 0) * 100) / 100,
        },
        porEstado: leadsPorEstado.map((item) => ({
          estado: item.estado,
          count: item._count,
        })),
        porFuente: leadsPorFuente.map((item) => ({
          fuente: item.fuente,
          count: item._count,
        })),
        porUsuario: leadsPorUsuarioConNombres,
        evolucion: evolucionLeads,
        topLeads: topLeadsFormatted,
      },
    });
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    return NextResponse.json(
      {
        error: 'Error al obtener estadísticas',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
