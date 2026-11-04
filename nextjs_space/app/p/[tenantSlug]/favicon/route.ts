import { globalPrisma } from '@/lib/db';
import { getEffectiveBranding } from '@/lib/branding';

export const dynamic = 'force-dynamic';

/**
 * Genera un SVG favicon dinámico con el color de marca y la inicial del tenant.
 * Se actualiza automáticamente cuando cambia el brandingConfig del tenant.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params;
  const tenant = await globalPrisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, nombre: true },
  });

  if (!tenant) {
    return new Response(
      generateFaviconSvg('#3b82f6', 'V'),
      {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    );
  }

  const branding = await getEffectiveBranding(tenant.id);
  const color = branding.primaryColor || '#3b82f6';
  const letter = (tenant.nombre || 'V').charAt(0).toUpperCase();

  return new Response(
    generateFaviconSvg(color, letter),
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  );
}

/**
 * Genera el SVG del favicon: un cuadrado con bordes redondeados
 * con el color de marca y la inicial en blanco.
 */
function generateFaviconSvg(color: string, letter: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="${color}"/>
  <text x="16" y="22" text-anchor="middle" fill="white" font-size="18" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif">${escapeXml(letter)}</text>
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
