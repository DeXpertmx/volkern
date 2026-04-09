export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseVideoUrl, isValidVideoUrl, VideoProvider } from '@/lib/video-utils';

/**
 * GET /api/video?url=<url>
 * Procesa una URL de video y devuelve información sobre el proveedor y el ID
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'URL de video requerida' },
        { status: 400 }
      );
    }

    const videoInfo = parseVideoUrl(url);
    const isValid = isValidVideoUrl(url);

    return NextResponse.json({
      url,
      ...videoInfo,
      isValid,
    });
  } catch (error) {
    console.error('Error al procesar URL de video:', error);
    return NextResponse.json(
      { error: 'Error al procesar la URL de video' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video/validate
 * Valida una URL de video y devuelve si es válida
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL de video requerida' },
        { status: 400 }
      );
    }

    const videoInfo = parseVideoUrl(url);
    const isValid = isValidVideoUrl(url);

    return NextResponse.json({
      url,
      isValid,
      provider: videoInfo.provider,
      id: videoInfo.id,
      embedUrl: videoInfo.embedUrl,
    });
  } catch (error) {
    console.error('Error al validar URL de video:', error);
    return NextResponse.json(
      { error: 'Error al validar la URL de video' },
      { status: 500 }
    );
  }
}