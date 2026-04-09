export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import HunterIO, { transformHunterToLead } from '@/lib/hunter-io';

export async function POST(req: NextRequest) {
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
        {
          error: 'Hunter.io no está configurado',
          needsSetup: true,
          setupInstructions: {
            title: 'Configurar Hunter.io',
            steps: [
              'Ve a https://hunter.io/users/sign_up',
              'Crea una cuenta o inicia sesión',
              'Ve a Dashboard > API',
              'Copia tu API Key',
              'Pégala en la configuración de integraciones',
            ],
          },
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      domain,
      company,
      firstName,
      lastName,
      position,
      department,
      type,
      offset = 0,
      limit = 10,
      saveSearch = false,
      searchName,
    } = body;

    // Validar que al menos domain o company estén presentes
    if (!domain && !company) {
      return NextResponse.json(
        { error: 'Debes proporcionar un dominio o nombre de empresa' },
        { status: 400 }
      );
    }

    // Inicializar cliente de Hunter.io
    const apiKey = integration.credenciales as any;
    const hunter = new HunterIO({
      apiKey: apiKey.api_key || apiKey.apiKey,
    });

    // Ejecutar búsqueda según tipo
    let results;
    let searchType: 'domain' | 'finder';

    if (firstName && lastName && domain) {
      // Búsqueda específica de email
      searchType = 'finder';
      const email = await hunter.emailFinder({
        domain,
        firstName,
        lastName,
        company,
      });

      results = {
        emails: email ? [email] : [],
        meta: {
          results: email ? 1 : 0,
          limit: 1,
          offset: 0,
          params: { domain, firstName, lastName, company },
        },
      };
    } else {
      // Búsqueda por dominio
      searchType = 'domain';
      results = await hunter.domainSearch({
        domain,
        company,
        position,
        department,
        type,
        offset,
        limit,
      });
    }

    // Transformar resultados a formato estándar
    const leads = results.emails.map((email) =>
      transformHunterToLead(email, domain || company || '')
    );

    // Guardar búsqueda si se solicita
    let savedSearch = null;
    if (saveSearch && searchName) {
      savedSearch = await prisma.savedSearch.create({
        data: {
          tenantId: user.tenantId,
          userId: session.user.id,
          nombre: searchName,
          fuente: 'hunter.io',
          criterios: {
            domain,
            company,
            firstName,
            lastName,
            position,
            department,
            type,
          },
          totalResultados: results.meta.results,
        },
      });
    }

    // Registrar uso en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: session.user.id,
        accion: 'EXTERNAL_LEAD_SEARCH',
        entidad: 'Lead',
        entidadId: 'external_search',
        descripcion: `Búsqueda externa de leads en Hunter.io - ${leads.length} resultados`,
        cambiosDespues: {
          source: 'hunter.io',
          searchType,
          resultsCount: leads.length,
          criteria: { domain, company, position, department },
        },
      },
    });

    return NextResponse.json({
      leads,
      pagination: {
        total: results.meta.results,
        offset: results.meta.offset,
        limit: results.meta.limit,
        hasMore: results.meta.offset + leads.length < results.meta.results,
      },
      savedSearch,
    });
  } catch (error: any) {
    console.error('Error en búsqueda de Hunter.io:', error);
    return NextResponse.json(
      {
        error: error.message || 'Error al buscar leads en Hunter.io',
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
