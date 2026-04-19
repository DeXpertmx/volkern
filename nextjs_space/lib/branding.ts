import { prisma } from '@/lib/db';

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor?: string;
  showPoweredBy?: boolean;
  companyName?: string;
}

// Cache simple en memoria para evitar consultas excesivas a la DB
const BRANDING_CACHE = new Map<string, { config: BrandingConfig, expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Resuelve la configuración de marca en cascada:
 * 1. Config de la Subcuenta (Slot)
 * 2. Config de la Agencia (Parent)
 * 3. Config Global de Volkern
 */
export async function getEffectiveBranding(tenantId: string): Promise<BrandingConfig> {
  const now = Date.now();
  
  // 0. Verificar Caché
  const cached = BRANDING_CACHE.get(tenantId);
  if (cached && cached.expiry > now) {
    return cached.config;
  }

  try {
    // 1. Obtener el tenant actual y su padre
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        nombre: true,
        parentId: true,
        brandingConfig: true,
      }
    });

    if (!tenant) return getDefaultBranding();

    const clientConfig = tenant.brandingConfig as any;

    let resolvedConfig: BrandingConfig;

    // 2. Si no hay padre, es un tenant raíz o personal
    if (!tenant.parentId) {
      resolvedConfig = {
        logoUrl: clientConfig?.logoUrl || '/volkern-logo.png',
        primaryColor: clientConfig?.primaryColor || '#3b82f6',
        showPoweredBy: clientConfig?.showPoweredBy ?? true,
        companyName: tenant.nombre
      };
    } else {
      // 3. Es una subcuenta. Buscar config del padre (Agencia)
      const parent = await prisma.tenant.findUnique({
        where: { id: tenant.parentId },
        select: {
          brandingConfig: true,
        }
      });

      const agencyConfig = parent?.brandingConfig as any;

      // Lógica de Cascada: Client > Agency > Volkern
      resolvedConfig = {
        logoUrl: clientConfig?.logoUrl || agencyConfig?.logoUrl || '/volkern-logo.png',
        primaryColor: clientConfig?.primaryColor || agencyConfig?.primaryColor || '#3b82f6',
        showPoweredBy: clientConfig?.showPoweredBy ?? agencyConfig?.showPoweredBy ?? true,
        companyName: tenant.nombre
      };
    }

    // 4. Guardar en Caché
    BRANDING_CACHE.set(tenantId, {
      config: resolvedConfig,
      expiry: now + CACHE_TTL
    });

    return resolvedConfig;

  } catch (error) {
    console.error('[Branding] Error resolving cascade branding:', error);
    return getDefaultBranding();
  }
}

function getDefaultBranding(): BrandingConfig {
  return {
    logoUrl: '/volkern-logo.png',
    primaryColor: '#3b82f6',
    showPoweredBy: true,
    companyName: 'Volkern CRM'
  };
}
