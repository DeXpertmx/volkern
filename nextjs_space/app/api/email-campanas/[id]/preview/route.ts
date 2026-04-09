export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// POST /api/email-campanas/[id]/preview - Vista previa de email
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const data = await request.json();
    const leadId = data.leadId;

    // Obtener campaña
    const campana = await prisma.emailCampaign.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    // Obtener lead de ejemplo (si se proporciona) o crear variables de ejemplo
    let variables: Record<string, string> = {
      nombre: 'Juan Pérez',
      email: 'juan@ejemplo.com',
      empresa: 'Ejemplo S.A.',
      cargo: 'Director'
    };

    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: {
          id: leadId,
          tenantId: user.tenantId
        }
      });

      if (lead) {
        variables = {
          nombre: lead.nombre,
          email: lead.email,
          empresa: lead.empresa || '',
          cargo: lead.cargo || '',
          telefono: lead.telefono || ''
        };
      }
    }

    // Reemplazar variables en el contenido
    let contenidoHTML = campana.contenidoHTML;
    let asunto = campana.asunto;

    // Reemplazar variables {variable}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      contenidoHTML = contenidoHTML.replace(regex, value);
      asunto = asunto.replace(regex, value);
    });

    // Agregar link de unsuscribe
    contenidoHTML += `<br/><br/><p style="font-size: 12px; color: #666;">
      <a href="https://volkern.app/api/email-campanas/unsubscribe/[TOKEN]" style="color: #666;">
        Cancelar suscripción
      </a>
    </p>`;

    return NextResponse.json({
      asunto,
      remitente: `${campana.remitente} <${campana.remitenteEmail}>`,
      contenidoHTML,
      variables
    });
  } catch (error: any) {
    console.error('Error al generar vista previa:', error);
    return NextResponse.json(
      { error: 'Error al generar vista previa', details: error.message },
      { status: 500 }
    );
  }
}
