export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getInsurerConnector,
  VALID_INSURER_SLUGS,
  type InsurerSlug,
} from '@/lib/insurance/connectors/InsurerConnector';

/**
 * GET /api/insurance/connectors
 *
 * Lista todos los conectores de aseguradoras del marketplace (Fase 5.2) con
 * su metadata: país, ramos soportados, capabilities y si es mock (sandbox).
 *
 * Auth: requiere sesión (no expone datos de tenant — la UI lo usa desde el
 * dashboard, donde ya hay cookie de sesión).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const connectors = [];
  for (const slug of VALID_INSURER_SLUGS) {
    try {
      const connector = await getInsurerConnector(slug);
      connectors.push({
        slug: connector.metadata.slug,
        nombre: connector.metadata.nombre,
        country: connector.metadata.country,
        regulatoryId: connector.metadata.regulatoryId,
        website: connector.metadata.website,
        monedaBase: connector.metadata.monedaBase,
        supportedRamos: [...connector.metadata.supportedRamos],
        capabilities: [...connector.metadata.capabilities],
        isMock: connector.metadata.isMock,
        status: 'disponible' as const,
      });
    } catch {
      // Conector registrado pero pendiente de implementación (siguiente commit).
      connectors.push({
        slug,
        nombre: slugToNombrePendiente(slug),
        status: 'pendiente' as const,
        isMock: null,
      });
    }
  }

  return NextResponse.json({ ok: true, connectors });
}

function slugToNombrePendiente(slug: string): string {
  switch (slug as InsurerSlug) {
    case 'axa-mx':
      return 'AXA México';
    case 'seguros-monterrey':
      return 'Seguros Monterrey';
    case 'tirea':
      return 'TIREA (España)';
    case 'fiva':
      return 'FIVA (España)';
    case 'eiac':
      return 'EIAC (España)';
    default:
      return slug;
  }
}
