export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// PATCH /api/leads/[id]/stage - Actualizar el estado/pipeline del lead
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json();
    
    const lead = await prisma.lead.update({
      where: { id: params.id },
      data: {
        estado: data.estado,
        tiempoEnEstado: new Date() // Reset el tiempo en el stage
      }
    });

    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error updating lead stage:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el estado del lead' },
      { status: 500 }
    );
  }
}
