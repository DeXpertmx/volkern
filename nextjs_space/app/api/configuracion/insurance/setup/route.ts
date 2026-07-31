import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import { seedInsuranceModule } from '@/lib/insurance/seed';

export const dynamic = 'force-dynamic';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    await seedInsuranceModule(tenantId);

    // Marcar configuraciones como aplicadas
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'insuranceFieldPresetApplied' } },
      update: { valor: 'true' },
      create: { tenantId, clave: 'insuranceFieldPresetApplied', valor: 'true' },
    });

    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId, clave: 'insurancePipelineStagesCreated' } },
      update: { valor: 'true' },
      create: { tenantId, clave: 'insurancePipelineStagesCreated', valor: 'true' },
    });

    return NextResponse.json({
      success: true,
      message: 'Módulo de seguros configurado correctamente',
    });
  } catch (error) {
    console.error('[insurance-setup] Error:', error);
    return NextResponse.json(
      { error: 'Error al configurar el módulo de seguros' },
      { status: 500 }
    );
  }
}, ['config:write', 'settings:write']);
