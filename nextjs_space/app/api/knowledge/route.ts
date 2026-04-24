import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { KnowledgeService } from '@/lib/knowledge/knowledge-service';
import { AdoptionTelemetry } from '@/lib/telemetry/adoption-kpis';

/**
 * GET /api/knowledge - Listar artículos o buscar semánticamente
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as any;
    const query = searchParams.get('q');
    const semantic = searchParams.get('semantic') === 'true';

    // Telemetry
    AdoptionTelemetry.trackHubView(auth.tenant!.id, auth.user!.id, 'KNOWLEDGE').catch(() => {});

    let articles;
    if (semantic && query) {
      articles = await KnowledgeService.searchSemantic(auth.tenant!.id, query);
    } else {
      articles = await KnowledgeService.getArticles(auth.tenant!.id, { category, query: query || undefined });
    }

    return NextResponse.json(articles);
  } catch (error: any) {
    console.error('[KnowledgeAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener artículos' }, { status: 500 });
  }
}, ['knowledge:read']);

/**
 * POST /api/knowledge - Crear artículo (Asistido por Gemma)
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { title, content, category, tags, isPublic } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Título y contenido son requeridos' }, { status: 400 });
    }

    const article = await KnowledgeService.createArticle(auth.tenant!.id, {
      title,
      content,
      category: category || 'SOP',
      tags,
      isPublic,
      authorId: auth.user!.id
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error: any) {
    console.error('[KnowledgeAPI] Error:', error);
    return NextResponse.json({ error: 'Error al crear artículo' }, { status: 500 });
  }
}, ['knowledge:write']);
