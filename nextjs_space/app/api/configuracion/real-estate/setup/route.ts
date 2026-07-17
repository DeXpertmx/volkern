import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { seedRealEstateModule } from '@/lib/real-estate/seed';

export const dynamic = 'force-dynamic';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    await seedRealEstateModule(tenantId);

    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'fieldPresetApplied' } },
      update: { valor: 'true' },
      create: { tenantId, clave: 'fieldPresetApplied', valor: 'true' },
    });

    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'pipelineStagesCreated' } },
      update: { valor: 'true' },
      create: { tenantId, clave: 'pipelineStagesCreated', valor: 'true' },
    });

    return NextResponse.json({ success: true, message: 'Módulo inmobiliario configurado correctamente' });
  } catch (error) {
    console.error('[setup] Error:', error);
    return NextResponse.json(
      { error: 'Error al configurar el módulo inmobiliario' },
      { status: 500 }
    );
  }
}, ['config:write', 'settings:write']);
