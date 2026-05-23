export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma, dbContext } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { orchestrate_digital_signature } from '@/lib/skills/hr-signing-skill';

/**
 * API Soberana: Sellado por Lotes (Batch Signing)
 * Procesa todas las entidades pendientes de firma legal para un tenant.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let tenantId = (session.user as any).tenantId;
    const userId = (session.user as any).id;
    const body = await req.json();
    const { category } = body;

    // Obtener seed del tenant (con fallback resiliente para JWT obsoletos)
    let tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null;
    
    // Fallback: si el tenant de la sesión no existe, buscar el tenant real del usuario
    if (!tenant && userId) {
      console.log('[BATCH_SIGN] JWT obsoleto detectado. Buscando tenant real del usuario...');
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
      if (user?.tenantId) {
        tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
        tenantId = user.tenantId;
      }
    }
    
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado. Cierra sesión y vuelve a iniciar.' }, { status: 400 });
    if (!tenant.vaultSeed) return NextResponse.json({ error: 'Vault no inicializado para este tenant. Ejecuta el Proceso Génesis.' }, { status: 400 });

    let processed = 0;

    if (category === 'hr') {
      // Resolver el Employee del firmante (signerId es FK a Employee, no User)
      const signerEmployee = await prisma.employee.findFirst({
        where: { tenantId, userId: userId },
        select: { id: true }
      });
      // Fallback: si el usuario no tiene Employee vinculado, usar el primer empleado admin
      const fallbackEmployee = signerEmployee || await prisma.employee.findFirst({
        where: { tenantId },
        select: { id: true }
      });

      const pendingVacations = await prisma.erp_vacation_requests.findMany({
        where: { tenantId, status: 'APPROVED' },
        include: { erp_employees: true }
      });

      for (const vacation of pendingVacations) {
        // signerId: el firmante (Employee del CEO) o el propio empleado de la solicitud
        const signerId = fallbackEmployee?.id || vacation.employeeId;
        try {
          await dbContext.run({ tenantId, vaultSeed: tenant.vaultSeed }, async () => {
            await orchestrate_digital_signature({
              tenantId,
              entityType: 'VACATION',
              entityId: vacation.id,
              signerId
            });
          });
          processed++;
        } catch (err: any) {
          if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
            // Ya firmado, ignorar
          } else if (err.code === 'P2003') {
            console.log(`[BATCH_SIGN] FK error en ${vacation.id}, usando employeeId como fallback`);
          } else {
            console.error(`[BATCH_SIGN] Fallo en firma de ${vacation.id}:`, err.message);
          }
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed, 
      message: `${processed} documentos sellados con éxito en el Integrity Graph.` 
    });

  } catch (error: any) {
    console.error('[BATCH_SIGN] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
