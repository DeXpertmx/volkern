export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import HunterIO, { transformHunterToLead } from '@/lib/hunter-io';

export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Obtener tenant del usuario
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

    // Obtener la búsqueda guardada
    const savedSearch = await prisma.savedSearch.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!savedSearch) {
      return NextResponse.json(
        { error: 'Búsqueda no encontrada' },
        { status: 404 }
      );
    }

    // Verificar integración según la fuente
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: savedSearch.fuente === 'apollo' ? 'apollo.io' : 
              savedSearch.fuente === 'linkedin' ? 'linkedin' : 'hunter.io',
        activo: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        {
          error: `La integración de ${savedSearch.fuente} no está configurada`,
          needsSetup: true,
        },
        { status: 400 }
      );
    }

    const criterios = savedSearch.criterios as any;
    let newLeads: any[] = [];
    let totalFound = 0;

    // Ejecutar búsqueda según la fuente
    if (savedSearch.fuente === 'hunter') {
      const credenciales = integration.credenciales as any;
      const hunter = new HunterIO(credenciales.api_key);

      const results = await hunter.domainSearch({
        domain: criterios.company || criterios.empresa,
        company: criterios.company || criterios.empresa,
        position: criterios.title || criterios.cargo,
        department: criterios.department,
        limit: criterios.limit || 25,
        offset: 0,
      });

      totalFound = results.emails?.length || 0;
      newLeads = (results.emails || []).map((email: any) =>
        transformHunterToLead(email, criterios.company || criterios.empresa)
      );
    } else if (savedSearch.fuente === 'apollo') {
      // Apollo.io search
      const response = await fetch(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': (integration.credenciales as any).api_key,
          },
          body: JSON.stringify({
            page: 1,
            per_page: criterios.limit || 25,
            person_titles: criterios.cargo ? [criterios.cargo] : undefined,
            organization_locations: criterios.ubicacion
              ? [criterios.ubicacion]
              : undefined,
            person_seniorities: criterios.senioridad
              ? [criterios.senioridad]
              : undefined,
            organization_num_employees_ranges: criterios.tamanoEmpresa
              ? [criterios.tamanoEmpresa]
              : undefined,
            q_organization_name: criterios.empresa,
            q_organization_keyword_tags: criterios.palabrasClave
              ? [criterios.palabrasClave]
              : undefined,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Error en Apollo.io API');
      }

      const data = await response.json();
      totalFound = data.contacts?.length || 0;
      newLeads = (data.contacts || []).map((contact: any) => ({
        name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        email: contact.email,
        phone: contact.phone_numbers?.[0]?.sanitized_number || '',
        title: contact.title || '',
        company: contact.organization_name || '',
        location: contact.city || contact.state || contact.country || '',
        linkedin: contact.linkedin_url || '',
        source: 'apollo',
        confidence: contact.email ? 90 : 50,
        metadata: {
          apolloId: contact.id,
          seniority: contact.seniority,
          departments: contact.departments,
          employeeCount: contact.organization?.estimated_num_employees,
        },
      }));
    } else if (savedSearch.fuente === 'linkedin') {
      // LinkedIn search (placeholder - requires OAuth implementation)
      return NextResponse.json(
        {
          error: 'LinkedIn sync requiere autenticación OAuth activa',
          needsReauth: true,
        },
        { status: 400 }
      );
    }

    // Contar cuántos leads son nuevos (no existen en la base de datos)
    const existingLeadEmails = await prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        email: {
          in: newLeads.filter((l) => l.email).map((l) => l.email),
        },
      },
      select: { email: true },
    });

    const existingEmailsSet = new Set(
      existingLeadEmails.map((l) => l.email)
    );
    const trulyNewLeads = newLeads.filter(
      (lead) => lead.email && !existingEmailsSet.has(lead.email)
    );

    // Actualizar la búsqueda guardada
    await prisma.savedSearch.update({
      where: { id: params.id },
      data: {
        ultimaActualizacion: new Date(),
        totalResultados: totalFound,
        nuevosDesdeUltimaActualizacion: trulyNewLeads.length,
        fechaActualizacion: new Date(),
      },
    });

    // Crear audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: session.user.id,
        accion: 'SAVED_SEARCH_SYNC',
        entidad: 'SavedSearch',
        entidadId: params.id,
        descripcion: `Sincronización de búsqueda "${savedSearch.nombre}": ${totalFound} resultados, ${trulyNewLeads.length} nuevos`,
        cambiosDespues: {
          searchName: savedSearch.nombre,
          source: savedSearch.fuente,
          totalFound,
          newLeads: trulyNewLeads.length,
          criteria: criterios,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Sincronización completada: ${totalFound} resultados encontrados, ${trulyNewLeads.length} nuevos`,
      data: {
        totalFound,
        newLeads: trulyNewLeads.length,
        existingLeads: totalFound - trulyNewLeads.length,
        leads: trulyNewLeads,
      },
    });
  } catch (error) {
    console.error('Error syncing saved search:', error);
    return NextResponse.json(
      {
        error: 'Error al sincronizar búsqueda',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
