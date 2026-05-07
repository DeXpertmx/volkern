export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import crypto from 'crypto';

/**
 * POST /api/onboarding/genesis
 * El "Big Bang" de la cuenta del tenant. Inicializa seguridad, auditoría y DNA.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { dnaOperativo, masterKeyHash, lat, lng } = await req.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user || !user.tenantId) {
       return NextResponse.json({ error: 'Contexto de tenant no encontrado' }, { status: 404 });
    }

    const tenantId = user.tenantId;

    // 1. REGISTRO DE AUDIT GENESIS (Block 0)
    // Generar un hash único para la integridad de la bóveda
    const genesisHash = crypto.createHash('sha256')
      .update(`${tenantId}-${Date.now()}-${dnaOperativo}`)
      .digest('hex');

    await prisma.globalAuditCloud.create({
      data: {
        tenantId,
        action: 'GENESIS_INITIALIZATION',
        hash: genesisHash,
        details: `Capa de DNA: ${dnaOperativo} | Bóveda SHA-256 inicializada.`,
        ip: req.headers.get('x-forwarded-for') || '127.0.0.1'
      }
    });

    // 2. ACTUALIZACIÓN DE TENANT (DNA, GPS, Master Key, Subdomain)
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        dnaOperativo,
        masterKeyHash, // Aunque sea 'hint' o hash real según el plan
        baseLatitude: lat,
        baseLongitude: lng,
        genesisHash,
        subdomain: subdomain ? subdomain.toLowerCase() : undefined,
        provisioningStatus: 'COMPLETED',
        // Upsell Check: Marcar para equipo de ventas
        configuracion: {
            ...(user.tenant?.configuracion as any || {}),
            upsell_candidate: dnaOperativo === 'ERP_INDUSTRIAL',
            onboarding_v2_completado: true
        }
      }
    });

    // 3. ACTUALIZACIÓN DE PROGRESO
    await prisma.onboardingProgress.upsert({
      where: { tenantId },
      update: {
        dnaOperativo,
        completado: true,
        fechaCompletado: new Date(),
        pasoActual: 3
      },
      create: {
        tenantId,
        dnaOperativo,
        completado: true,
        fechaCompletado: new Date(),
        pasoActual: 3
      }
    });

    return NextResponse.json({ 
      success: true, 
      genesisHash,
      message: 'Bóveda inicializada correctamente.' 
    });

  } catch (error: any) {
    console.error('Error en el proceso Genesis:', error);
    return NextResponse.json({ 
      error: 'Fallo al inicializar la bóveda',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    }, { status: 500 });
  }
}
