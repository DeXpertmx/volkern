export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getDownloadUrl } from '@/lib/s3';
import { findDigitalCardByUrlUnica } from '@/lib/public-slug-lookup';

/**
 * GET /api/tarjetas-digitales/public/[cardId]
 * Obtiene la información pública de una tarjeta digital e incrementa vistas
 */
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ cardId: string }> }
) {
  const params = await paramsPromise;
  try {
    const { cardId } = params;

    // Scoping por tenant (subdominio) + fallback global para QRs ya impresos
    const card = await findDigitalCardByUrlUnica(cardId, request.headers.get('x-tenant-subdomain'), {
      include: {
        user: {
          select: {
            bookingSlug: true,
            bookingEnabled: true,
          },
        },
      },
    });

    if (!card || !card.activo) {
      return NextResponse.json(
        { error: 'Tarjeta no encontrada o inactiva' },
        { status: 404 }
      );
    }

    // Incrementar contador de vistas de forma asíncrona
    prisma.digitalCard.update({
      where: { id: card.id },
      data: {
        totalVistas: {
          increment: 1,
        },
      },
    }).catch(err => console.error('Error incrementing view count:', err));

    // Helper para verificar si es una S3 key
    const isS3Key = (valor: string | null) => {
      return valor && !valor.startsWith('http') && !valor.startsWith('/') && valor.includes('tarjetas-digitales/');
    };

    // Convertir S3 keys a URLs firmadas
    let logoUrl = card.logoUrl;
    let fotoPerfilUrl = card.fotoPerfilUrl;
    let bannerUrl = card.bannerUrl;

    if (logoUrl && isS3Key(logoUrl)) {
      try {
        logoUrl = await getDownloadUrl(logoUrl, 604800);
      } catch (error) {
        logoUrl = null;
      }
    }

    if (fotoPerfilUrl && isS3Key(fotoPerfilUrl)) {
      try {
        fotoPerfilUrl = await getDownloadUrl(fotoPerfilUrl, 604800);
      } catch (error) {
        fotoPerfilUrl = null;
      }
    }

    if (bannerUrl && isS3Key(bannerUrl)) {
      try {
        bannerUrl = await getDownloadUrl(bannerUrl, 604800);
      } catch (error) {
        bannerUrl = null;
      }
    }

    // Construir bookingUrl si el usuario tiene booking habilitado
    const bookingUrl = card.user?.bookingEnabled && card.user?.bookingSlug
      ? `/booking/${card.user.bookingSlug}`
      : null;

    // Retornamos la data limpia (sin el objeto user)
    const { user, ...cardWithoutUser } = card;
    const publicCard = {
      ...cardWithoutUser,
      logoUrl,
      fotoPerfilUrl,
      bannerUrl,
      bookingUrl,
    };

    return NextResponse.json({ card: publicCard });
  } catch (error) {
    console.error('Error fetching public card:', error);
    return NextResponse.json(
      { error: 'Error al obtener información de la tarjeta' },
      { status: 500 }
    );
  }
}
