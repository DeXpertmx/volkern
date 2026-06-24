import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getEffectiveBranding } from '@/lib/branding';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/branding?subdomain=xxx
 * Obtiene la configuración de branding pública para un subdominio
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get('subdomain');

    if (!subdomain) {
      return NextResponse.json({ error: 'Falta subdominio' }, { status: 400 });
    }

    // 1. Buscar el tenant por subdominio
    const tenant = await prisma.tenant.findUnique({
      where: { subdomain },
      select: { id: true, nombre: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // 2. Obtener branding efectivo
    const branding = await getEffectiveBranding(tenant.id);

    // 3. Obtener configuración global como fallback
    let globalConfig = await prisma.whitelabelConfig.findFirst({
      orderBy: { fechaCreacion: 'desc' }
    });

    const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
    const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || '';
    const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL;

    const getFullUrl = (url: string | null) => {
      if (!url) return null;
      if (url.startsWith('http') || url.startsWith('/')) return url;
      
      // Es una key de S3/R2
      if (CDN_URL) {
        const base = CDN_URL.endsWith('/') ? CDN_URL.slice(0, -1) : CDN_URL;
        return `${base}/${url}`;
      }
      return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${url}`;
    };

    return NextResponse.json({
      nombreEmpresa: branding.companyName || globalConfig?.nombreEmpresa || 'Volkern',
      logoUrl: getFullUrl(branding.logoUrl ?? null) || globalConfig?.logoUrl || '/volkern-logo.png',
      colorPrimario: branding.primaryColor || globalConfig?.colorPrimario || '#3b82f6',
    });

  } catch (error) {
    console.error('Error al obtener branding público:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
