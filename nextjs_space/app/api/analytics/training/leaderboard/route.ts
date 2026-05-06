export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * Leaderboard de Entrenamiento - Mejores Cerradores
 * Calcula el ranking de agentes basado en el promedio de sus puntuaciones de roleplay.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // 1. Obtener agregación de puntuaciones por usuario
    // Calculamos el promedio de score y contamos sesiones por agente
    const rankingData = await prisma.trainingSession.groupBy({
      by: ['userId'],
      where: { tenantId },
      _avg: { score: true },
      _count: { id: true },
      _max: { score: true },
      orderBy: {
        _avg: { score: 'desc' },
      },
      take: 10,
    });

    // 2. Obtener nombres e imágenes de los usuarios
    const userIds = rankingData.map(r => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true, roleId: true }
    });

    // 3. Cruzar datos
    const leaderboard = rankingData.map(group => {
      const userData = users.find(u => u.id === group.userId);
      return {
        userId: group.userId,
        name: userData?.name || 'Agente de Ventas',
        avatar: userData?.image || null,
        averageScore: Math.round(group._avg.score || 0),
        maxScore: group._max.score,
        totalSessions: group._count.id,
      };
    });

    return NextResponse.json({ success: true, data: leaderboard });

  } catch (error: any) {
    console.error('Error fetching training leaderboard:', error);
    return NextResponse.json({ error: 'Error al cargar el ranking' }, { status: 500 });
  }
});
