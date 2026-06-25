export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import HunterIO from '@/lib/hunter-io';

/**
 * Enriquecer leads existentes con datos de Hunter.io
 * Verifica emails y obtiene información adicional
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: 'Usuario sin tenant asignado' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { leadIds } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: 'Debes proporcionar IDs de leads para enriquecer' },
        { status: 400 }
      );
    }

    // Verificar integración de Hunter.io
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'hunter.io',
        activo: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Hunter.io no está configurado' },
        { status: 400 }
      );
    }

    const apiKey = integration.credenciales as any;
    const hunter = new HunterIO({
      apiKey: apiKey.api_key || apiKey.apiKey,
    });

    // Obtener leads a enriquecer
    const leads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        tenantId: user.tenantId,
      },
    });

    const enrichmentResults = {
      successful: 0,
      failed: 0,
      details: [] as any[],
    };

    // Enriquecer cada lead
    for (const lead of leads) {
      try {
        const enrichedData: any = {};

        // Si tiene email, verificarlo
        if (lead.email) {
          const verification = await hunter.verifyEmail(lead.email);
          enrichedData.emailVerification = {
            status: verification.status,
            score: verification.score,
            valid: verification.status === 'valid',
            disposable: verification.disposable,
            webmail: verification.webmail,
          };
        }

        // Actualizar lead con datos enriquecidos
        if (Object.keys(enrichedData).length > 0) {
          // Solo actualizar notas con la información de enriquecimiento
          const enrichmentNote = `\n\n[Enriquecimiento ${new Date().toLocaleDateString()}]\n` +
            `Email verificado: ${enrichedData.emailVerification?.status || 'N/A'}\n` +
            `Score: ${enrichedData.emailVerification?.score || 'N/A'}/100`;

          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              notas: (lead.notas || '') + enrichmentNote,
            },
          });

          enrichmentResults.successful++;
          enrichmentResults.details.push({
            leadId: lead.id,
            nombre: lead.nombre,
            status: 'success',
            data: enrichedData,
          });
        }
      } catch (leadError: any) {
        console.error(`Error al enriquecer lead ${lead.id}:`, leadError);
        enrichmentResults.failed++;
        enrichmentResults.details.push({
          leadId: lead.id,
          nombre: lead.nombre,
          status: 'error',
          error: leadError.message,
        });
      }
    }

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: session.user.id,
        accion: 'LEAD_ENRICHMENT',
        entidad: 'Lead',
        entidadId: 'bulk_enrichment',
        descripcion: `Enriquecimiento de ${leads.length} leads con Hunter.io - ${enrichmentResults.successful} exitosos, ${enrichmentResults.failed} fallidos`,
        cambiosDespues: {
          source: 'hunter.io',
          totalLeads: leads.length,
          successful: enrichmentResults.successful,
          failed: enrichmentResults.failed,
        },
      },
    });

    return NextResponse.json({
      message: `Enriquecimiento completado: ${enrichmentResults.successful} exitosos, ${enrichmentResults.failed} fallidos`,
      results: enrichmentResults,
    });
  } catch (error: any) {
    console.error('Error al enriquecer leads:', error);
    return NextResponse.json(
      { error: 'Error al enriquecer leads', details: error.message },
      { status: 500 }
    );
  }
}
