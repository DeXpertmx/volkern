export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';

// POST /api/leads/external/import - Importar leads externos al CRM
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Obtener usuario y tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const body = await request.json();
    const { leads, source = 'hunter', criterios = {} } = body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: 'Debe proporcionar al menos un lead para importar' },
        { status: 400 }
      );
    }

    const importedLeads = [];
    const errors = [];

    for (const leadData of leads) {
      try {
        // Verificar si el lead ya existe por email
        const existingLead = await prisma.lead.findFirst({
          where: {
            tenantId: user.tenantId,
            email: leadData.email,
          },
        });

        if (existingLead) {
          errors.push({
            email: leadData.email,
            error: 'Lead ya existe en el CRM',
          });
          continue;
        }

        // Crear el lead
        const newLead = await prisma.lead.create({
          data: {
            tenantId: user.tenantId,
            nombre: leadData.name || 'Sin nombre',
            email: leadData.email,
            telefono: leadData.phone || null,
            estado: 'nuevo',
            notas: `Importado desde ${source.toUpperCase()} el ${new Date().toLocaleDateString('es-MX')}\n\nCriterios de búsqueda:\n${formatCriterios(
              criterios
            )}\n\nDatos adicionales:\n- Título: ${leadData.title || 'N/A'}\n- Empresa: ${
              leadData.company || 'N/A'
            }\n- Ubicación: ${leadData.location || 'N/A'}${
              leadData.linkedin ? `\n- LinkedIn: ${leadData.linkedin}` : ''
            }`,
          },
        });

        // Crear interacción de importación
        await prisma.interaction.create({
          data: {
            leadId: newLead.id,
            tipo: 'nota',
            contenido: `Lead importado desde ${source.toUpperCase()}`,
            creadoPor: user.id,
          },
        });

        importedLeads.push({
          id: newLead.id,
          email: newLead.email,
          nombre: newLead.nombre,
        });
      } catch (error: any) {
        errors.push({
          email: leadData.email,
          error: error.message || 'Error al importar lead',
        });
      }
    }

    return NextResponse.json({
      success: true,
      imported: importedLeads.length,
      errors: errors.length,
      leads: importedLeads,
      errorDetails: errors,
    });
  } catch (error: any) {
    console.error('Error importing leads:', error);
    return NextResponse.json(
      { error: error.message || 'Error al importar leads' },
      { status: 500 }
    );
  }
}

function formatCriterios(criterios: any): string {
  const entries = Object.entries(criterios)
    .filter(([key, value]) => value && key !== 'source' && key !== 'limit')
    .map(([key, value]) => `- ${key}: ${value}`);

  return entries.length > 0 ? entries.join('\n') : 'Sin criterios específicos';
}
