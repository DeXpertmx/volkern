export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { triggerAutomation } from '@/lib/automation-engine';

// PATCH /api/leads/[id]/stage - Actualizar el estado/pipeline del lead
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const data = await request.json();
    
    const lead = await prisma.lead.update({
      where: { id: id },
      data: {
        estado: data.estado,
        tiempoEnEstado: new Date() // Reset el tiempo en el stage
      }
    });

    // Disparar la automatización de lead actualizado (el lead trae su tenantId)
    if (lead?.tenantId) {
      triggerAutomation('lead_actualizado', {
        leadId: lead.id,
        tenantId: lead.tenantId,
        lead: lead as any,
      } as any).catch(err => console.error('Error en Automación (lead_actualizado stage):', err));
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error updating lead stage:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el estado del lead' },
      { status: 500 }
    );
  }
}
