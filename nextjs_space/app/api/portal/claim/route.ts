import { NextRequest, NextResponse } from 'next/server';
import { PortalService } from '@/lib/sovereignty/portal-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portal/claim
 * Public entry for customer support/incidents.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, category, title, description, evidenceUrl } = body;

    if (!token || !category || !title || !description) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const claim = await PortalService.createClaim({
      token,
      category,
      title,
      description,
      evidenceUrl
    });

    return NextResponse.json({ 
      success: true, 
      claimId: claim.id,
      message: 'Reclamación registrada exitosamente' 
    });
  } catch (error: any) {
    console.error('Error in portal claim API:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
