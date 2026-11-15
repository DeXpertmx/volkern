import { prisma } from '@/lib/db';

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor?: string;
  showPoweredBy?: boolean;
  companyName?: string;
  /** Claim corto de la oficina, el que se lee bajo el nombre en el portal. */
  claim?: string;
  /** WhatsApp de contacto (dígitos), para el botón directo de la ficha. */
  telefono?: string;
}

// Cache simple en memoria para evitar consultas excesivas a la DB
const BRANDING_CACHE = new Map<string, { config: BrandingConfig, expiry: number }>();

/**
 * Limpia la caché de branding para forzar una recarga desde la DB.
 */
export function clearBrandingCache(tenantId?: string): void {
  // Sin argumento se vacía entera (cambios globales); con `tenantId` se invalida
  // sólo esa cuenta, que es lo que necesita el editor de marca.
  if (!tenantId) {
    BRANDING_CACHE.clear();
    return;
  }
  BRANDING_CACHE.delete(tenantId);
}
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Lee la configuración de empresa del tenant (tabla Configuracion, la misma
 * que usa Configuración → Identidad Visual): logo corporativo y nombre comercial.
 *
 * NOTA: se consulta con el proxy de prisma. En instalaciones sin sharding (la
 * mayoría, incluida la producción del VPS) devuelve las filas del tenant desde
 * la BD global; en instalaciones shardeadas requiere el contexto del tenant.
 * Los fallos se ignoran a propósito: la marca cae a brandingConfig / defaults.
 */
function parseStoredValue(valor: string): any {
  // Sólo se intenta JSON con formas de objeto/array/cadena entrecomillada. Un
  // teléfono («34612345678») es JSON válido como número y se perdía al exigir
  // después un string; el nombre comercial, igual si empieza por dígito.
  const limpio = valor.trim();
  if (!limpio || !/^[[{"']/.test(limpio)) return valor;
  try {
    return JSON.parse(limpio);
  } catch {
    return valor;
  }
}

async function getTenantCorporateBranding(tenantId: string): Promise<{
  logoUrl?: string;
  companyName?: string;
  claim?: string;
  telefono?: string;
}> {
  try {
    const rows = await prisma.configuracion.findMany({
      where: {
        tenantId,
        clave: { in: ['logo_corporativo', 'business_name', 'portal_claim', 'portal_whatsapp'] },
      },
      select: { clave: true, valor: true },
    });
    let logoUrl: string | undefined
    let companyName: string | undefined
    let claim: string | undefined
    let telefono: string | undefined
    for (const row of rows) {
      const value = parseStoredValue(row.valor)
      if (typeof value !== 'string' || !value.trim()) continue
      if (row.clave === 'logo_corporativo') logoUrl = value.trim()
      else if (row.clave === 'business_name') companyName = value.trim()
      else if (row.clave === 'portal_claim') claim = value.trim()
      // El WhatsApp se guarda en dígitos; se tolera el formato antiguo con signos.
      else if (row.clave === 'portal_whatsapp') telefono = value.replace(/[^0-9]/g, '')
    }
    return { logoUrl, companyName, claim, telefono }
  } catch {
    return {}
  }
}

/**
 * Resuelve la configuración de marca en cascada:
 * 0. Logo/Nombre corporativos de Configuración → Identidad Visual (logo_corporativo)
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

    // 2. Logo/Nombre corporativos guardados en Configuración del tenant
    const corporate = await getTenantCorporateBranding(tenantId)
    const clientConfig = tenant.brandingConfig as any;

    let resolvedConfig: BrandingConfig;

    // 3. Si no hay padre, es un tenant raíz o personal
    if (!tenant.parentId) {
      resolvedConfig = {
        logoUrl: corporate.logoUrl || clientConfig?.logoUrl || '/volkern-logo.png',
        primaryColor: clientConfig?.primaryColor || '#3b82f6',
        showPoweredBy: clientConfig?.showPoweredBy ?? true,
        companyName: corporate.companyName || clientConfig?.companyName || tenant.nombre,
        claim: corporate.claim || clientConfig?.claim || undefined,
        telefono: corporate.telefono || clientConfig?.telefono || undefined
      };
    } else {
      // 4. Es una subcuenta. Buscar config del padre (Agencia)
      const parent = await prisma.tenant.findUnique({
        where: { id: tenant.parentId },
        select: {
          brandingConfig: true,
        }
      });

      const agencyConfig = parent?.brandingConfig as any;

      // Lógica de Cascada: IdentidadVisual del Slot > Client > Agency > Volkern
      resolvedConfig = {
        logoUrl: corporate.logoUrl || clientConfig?.logoUrl || agencyConfig?.logoUrl || '/volkern-logo.png',
        primaryColor: clientConfig?.primaryColor || agencyConfig?.primaryColor || '#3b82f6',
        showPoweredBy: clientConfig?.showPoweredBy ?? agencyConfig?.showPoweredBy ?? true,
        companyName: corporate.companyName || clientConfig?.companyName || agencyConfig?.companyName || tenant.nombre,
        claim: corporate.claim || clientConfig?.claim || agencyConfig?.claim || undefined,
        telefono: corporate.telefono || clientConfig?.telefono || agencyConfig?.telefono || undefined
      };
    }

    // 5. Guardar en Caché
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
