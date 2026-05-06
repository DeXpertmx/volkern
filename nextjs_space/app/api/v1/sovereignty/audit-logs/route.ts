export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma, dbContext } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * API Soberana: Registro Forense de Trust Protocol
 * Permite persistir auditorías e incidencias de seguridad de forma inmutable.
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId;
    
    // Obtener seed si existe para el contexto de seguridad (Vault)
    let vaultSeed = (session?.user as any)?.vaultSeed;
    if (!vaultSeed && tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { vaultSeed: true } });
      vaultSeed = tenant?.vaultSeed;
    }

    const body = await req.json();
    const { level, message, category = 'SYSTEM', metadata = {} } = body;

    if (!message) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

    // Persistencia en el Integrity Graph de Auditoría bajo contexto de Vault
    const log = await dbContext.run({ tenantId: tenantId || 'system_global', vaultSeed }, async () => {
      return await prisma.trustProtocolLog.create({
        data: {
          tenantId: tenantId || 'system_global',
          level: level || 'INFO',
          category,
          message,
          metadata: JSON.stringify(metadata),
        }
      });
    });

    return NextResponse.json({ 
      success: true, 
      logId: log.id,
      timestamp: log.createdAt 
    });
  } catch (error) {
    console.error('[SOVEREIGNTY_API] Audit Log Error:', error);
    return NextResponse.json({ error: 'Error interno de auditoría' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = (session?.user as any)?.tenantId;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    const logs = await prisma.trustProtocolLog.findMany({
      where: {
        tenantId: tenantId || 'system_global',
        ...(category && { category })
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('[SOVEREIGNTY_API] Audit GET Error:', error);
    return NextResponse.json({ error: 'No se pudieron recuperar los logs forenses' }, { status: 500 });
  }
}
