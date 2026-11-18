export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { clearBrandingCache, getEffectiveBranding } from '@/lib/branding';
import { getPlantillaPortal } from '@/lib/real-estate/portal-plantilla';
import { revalidarPortalCompleto } from '@/lib/real-estate/portal-revalidate';
import {
  normalizarClaim,
  normalizarColor,
  normalizarLogo,
  normalizarTelefono,
} from '@/lib/real-estate/portal-branding';

/**
 * Marca del portal de la cuenta.
 *
 * GET  → lo que hoy pinta el portal (logo, color, nombre, claim, WhatsApp).
 * PUT  → guarda y hace visible el cambio sin intervención de nadie: limpia la
 *        caché en memoria de marca y revalida portada, catálogo y fichas.
 *
 * El logo se guarda tal cual (URL http(s) o ruta local); el color en
 * `brandingConfig` del tenant, que es de donde ya lee el resto de la app, y el
 * resto en `Configuracion` con las claves que usa la identidad visual.
 */

async function marcaActual(tenantId: string, nombreCuenta: string) {
  const [branding, plantilla] = await Promise.all([
    getEffectiveBranding(tenantId),
    getPlantillaPortal(tenantId),
  ]);

  return {
    logoUrl: branding.logoUrl && branding.logoUrl !== '/volkern-logo.png' ? branding.logoUrl : '',
    primaryColor: normalizarColor(branding.primaryColor),
    companyName: branding.companyName || nombreCuenta,
    claim: branding.claim || '',
    telefono: branding.telefono || '',
    nombreCuenta,
    plantilla,
  };
}

export const GET = withTenantAuth(async (_req, auth) => {
  const marca = await marcaActual(auth.tenant!.id, auth.tenant!.nombre);
  return NextResponse.json(marca);
}, ['real-estate:read']);

export const PUT = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
    }

    // Se valida en vez de sanear en silencio: si alguien pega un color mal, tiene
    // que enterarse, no descubrir luego que el portal sigue azul.
    if (body.logoUrl && !normalizarLogo(body.logoUrl)) {
      return NextResponse.json(
        { error: 'El logo debe ser una URL http(s) o una ruta que empiece por /' },
        { status: 400 }
      );
    }
    if (body.primaryColor && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(body.primaryColor).trim())) {
      return NextResponse.json({ error: 'El color debe ser hexadecimal (#RRGGBB)' }, { status: 400 });
    }
    if (body.telefono && !normalizarTelefono(body.telefono)) {
      return NextResponse.json(
        { error: 'El WhatsApp debe tener entre 7 y 15 dígitos (incluye el prefijo del país)' },
        { status: 400 }
      );
    }

    const logoUrl = normalizarLogo(body.logoUrl);
    const primaryColor = normalizarColor(body.primaryColor);
    const companyName =
      typeof body.companyName === 'string' ? body.companyName.trim().slice(0, 120) : '';
    const claim = normalizarClaim(body.claim);
    const telefono = normalizarTelefono(body.telefono);

    const claves: Array<[string, string]> = [
      ['logo_corporativo', logoUrl],
      ['business_name', companyName],
      ['portal_claim', claim],
      ['portal_whatsapp', telefono],
    ];

    await Promise.all(
      claves.map(([clave, valor]) =>
        prisma.configuracion.upsert({
          where: { tenantId_clave: { tenantId, clave } },
          update: { valor },
          create: { tenantId, clave, valor },
        })
      )
    );

    // `brandingConfig` se escribe completo: el color convive con el resto de la
    // configuración de marca (showPoweredBy, logo heredado…) sin pisarla.
    const actual = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { brandingConfig: true, nombre: true },
    });
    const brandingConfig = {
      ...((actual?.brandingConfig as Record<string, unknown>) || {}),
      primaryColor,
    };
    await prisma.tenant.update({ where: { id: tenantId }, data: { brandingConfig } });

    clearBrandingCache(tenantId);
    await revalidarPortalCompleto(tenantId);

    return NextResponse.json(await marcaActual(tenantId, actual?.nombre || auth.tenant!.nombre));
  } catch (error) {
    console.error('[Portal Branding] Error al guardar la marca:', error);
    return NextResponse.json({ error: 'No se pudo guardar la marca del portal' }, { status: 500 });
  }
}, ['real-estate:write']);
