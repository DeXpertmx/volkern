export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { construirRanking } from '@/lib/sales/leaderboard';
import { estadoConcurso, rangoPeriodoActual } from '@/lib/sales/contest-ediciones';

/**
 * Leaderboard de Entrenamiento - Mejores Cerradores (C5)
 * Calcula el ranking de agentes basado en el promedio de sus puntuaciones de roleplay.
 *
 * La AGREGACIÓN es Prisma (`groupBy` por usuario: media, máximo y número de
 * sesiones) y el CONTRATO es un módulo puro (`lib/sales/leaderboard.ts`):
 * cruce con User, media redondeada, orden determinista (a igual media gana
 * quien MÁS SESIONES completó) y truncado al top. La consulta NO trunca con
 * `take`: si lo hiciera, un empate a media en el corte se resolvería por
 * orden de llegada de la BD en vez de por el desempate del módulo.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // 0. El concurso: cierra on-read las ediciones mensuales pendientes (el
    // mes en curso NUNCA se cierra) y trae las ediciones cerradas.
    const concurso = await estadoConcurso(tenantId);

    // 1. Agregación de puntuaciones por usuario — SOLO EL MES EN CURSO: el
    // ranking de pantalla es la edición en curso y se REINICIA cada mes (el
    // histórico queda congelado como ediciones cerradas con ganador).
    const { desde, hasta } = rangoPeriodoActual();
    const rankingData = await prisma.trainingSession.groupBy({
      by: ['userId'],
      where: { tenantId, createdAt: { gte: desde, lt: hasta } },
      _avg: { score: true },
      _count: { id: true },
      _max: { score: true },
      orderBy: {
        _avg: { score: 'desc' },
      },
    });

    // 2. Obtener nombres e imágenes de los usuarios
    const userIds = rankingData.map(r => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true }
    });

    // 3. El módulo puro construye el contrato exacto de la pantalla
    const leaderboard = construirRanking(rankingData, users);

    return NextResponse.json({ success: true, data: leaderboard, concurso });

  } catch (error: any) {
    console.error('Error fetching training leaderboard:', error);
    return NextResponse.json({ error: 'Error al cargar el ranking' }, { status: 500 });
  }
});
