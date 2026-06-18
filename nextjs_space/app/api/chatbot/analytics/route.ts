/**
 * API de Analytics del Chatbot
 *
 * GET  /api/chatbot/analytics — Obtener analytics generales
 * GET  /api/chatbot/analytics?type=patterns — Patrones detectados
 * GET  /api/chatbot/analytics?type=suggestions — Sugerencias de mejora
 * GET  /api/chatbot/analytics?type=conversations — Análisis de conversaciones
 * GET  /api/chatbot/analytics?type=alerts — Historial de alertas enviadas
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRecentAnalyses } from '@/lib/chat/conversation-analyzer';
import { getRecentPatterns, detectPatterns } from '@/lib/chat/pattern-detector';
import { getRecentSuggestions, generateSuggestions } from '@/lib/chat/improvement-engine';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true, rol: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const hours = parseInt(searchParams.get('hours') || '48');

    switch (type) {
      case 'patterns': {
        const patterns = await getRecentPatterns(user.tenantId, hours);
        return NextResponse.json({ patterns, total: patterns.length });
      }

      case 'suggestions': {
        const suggestions = await getRecentSuggestions(user.tenantId, hours);
        return NextResponse.json({ suggestions, total: suggestions.length });
      }

      case 'conversations': {
        const analyses = await getRecentAnalyses(user.tenantId, hours);
        return NextResponse.json({ analyses, total: analyses.length });
      }

      case 'alerts': {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const alerts = await prisma.chatbotAuditLog.findMany({
          where: {
            tenantId: user.tenantId,
            event: 'pattern_alert_sent',
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });

        const formatted = alerts.map(a => ({
          id: a.id,
          severity: a.severity,
          patternCount: (a.metadata as any)?.patternCount || 0,
          severities: (a.metadata as any)?.severities || [],
          channels: (a.metadata as any)?.channels || [],
          sentAt: a.createdAt,
        }));

        return NextResponse.json({ alerts: formatted, total: formatted.length });
      }

      case 'overview':
      default: {
        // Overview: métricas agregadas
        const [analyses, patterns, suggestions] = await Promise.all([
          getRecentAnalyses(user.tenantId, hours),
          getRecentPatterns(user.tenantId, hours),
          getRecentSuggestions(user.tenantId, hours),
        ]);

        const totalConversations = analyses.length;
        const resolvedConversations = analyses.filter(a => a.resolved).length;
        const frustratedConversations = analyses.filter(a => a.sentiment === 'frustrated' || a.sentiment === 'negative').length;
        const avgSentiment = totalConversations > 0
          ? Math.round(analyses.reduce((s, a) => s + a.sentimentScore, 0) / totalConversations)
          : 0;
        const transfers = analyses.filter(a => a.requiredHumanTransfer).length;
        const topTopics = extractTopTopics(analyses);

        return NextResponse.json({
          period: `${hours}h`,
          metrics: {
            totalConversations,
            resolvedConversations,
            resolutionRate: totalConversations > 0 ? Math.round((resolvedConversations / totalConversations) * 100) : 0,
            frustratedConversations,
            frustrationRate: totalConversations > 0 ? Math.round((frustratedConversations / totalConversations) * 100) : 0,
            avgSentiment,
            humanTransfers: transfers,
            transferRate: totalConversations > 0 ? Math.round((transfers / totalConversations) * 100) : 0,
          },
          patterns: patterns.slice(0, 5),
          suggestions: suggestions.slice(0, 5),
          topTopics: topTopics.slice(0, 8),
        });
      }
    }
  } catch (error) {
    console.error('[ChatbotAnalyticsAPI] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener analytics del chatbot' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chatbot/analytics — Ejecutar detección de patrones bajo demanda
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true, rol: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'detect_patterns';

    switch (action) {
      case 'detect_patterns': {
        const hours = body.hours || 48;
        const patterns = await detectPatterns(user.tenantId, { hours });
        return NextResponse.json({ patterns, total: patterns.length });
      }

      case 'generate_suggestions': {
        // Primero detectar patrones, luego generar sugerencias
        const hours = body.hours || 48;
        const patterns = await detectPatterns(user.tenantId, { hours });
        const suggestions = await generateSuggestions(user.tenantId, patterns);
        return NextResponse.json({ 
          patternsDetected: patterns.length, 
          suggestionsGenerated: suggestions.length,
          suggestions,
        });
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error) {
    console.error('[ChatbotAnalyticsAPI] Error:', error);
    return NextResponse.json(
      { error: 'Error al ejecutar análisis' },
      { status: 500 }
    );
  }
}

/**
 * Extrae los topics más frecuentes de los análisis
 */
function extractTopTopics(analyses: Array<{ topics: string[] }>): Array<{ topic: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const a of analyses) {
    for (const topic of a.topics) {
      counts[topic] = (counts[topic] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}
