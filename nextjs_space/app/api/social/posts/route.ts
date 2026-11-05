import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { socialPostingService } from '@/lib/nexus/social-posting';

export const dynamic = 'force-dynamic';

// GET /api/social/posts - Listar posts del tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const posts = await prisma.socialPost.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return NextResponse.json({ success: true, posts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['social:read']);

// POST /api/social/posts - Crear/Programar un post
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json();
    const { content, mediaUrls, platforms, scheduledFor, immediate } = body;

    if (!content || !platforms || platforms.length === 0) {
      return NextResponse.json({ error: 'Contenido y plataformas requeridos' }, { status: 400 });
    }

    const post = await prisma.socialPost.create({
      data: {
        tenantId,
        content,
        mediaUrls: mediaUrls || [],
        platforms,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        status: immediate ? 'publishing' : (scheduledFor ? 'scheduled' : 'draft')
      }
    });

    if (immediate) {
      // Disparar publicación inmediata de forma asíncrona (aunque el service ya lo maneja si lo llamamos)
      // Para no bloquear la respuesta, podríamos usar un worker o simplemente llamarlo
      const results = await socialPostingService.publishPost(post.id);
      return NextResponse.json({ success: true, post, results });
    }

    return NextResponse.json({ success: true, post });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['social:write']);
