export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';

// GET /api/leads/external/search - Buscar leads en plataformas externas
export async function GET(request: NextRequest) {
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

    // Obtener parámetros de búsqueda
    const searchParams = request.nextUrl.searchParams;
    const source = searchParams.get('source') || 'hunter';
    const title = searchParams.get('title') || '';
    const company = searchParams.get('company') || '';
    const industry = searchParams.get('industry') || '';
    const location = searchParams.get('location') || '';
    const companySize = searchParams.get('companySize') || '';
    const keywords = searchParams.get('keywords') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    // Obtener integración de Hunter.io
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: source,
        conectado: true,
        activo: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: `Integración ${source} no configurada o inactiva` },
        { status: 400 }
      );
    }

    const credentials = integration.credenciales as any;
    const apiKey = credentials?.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key no configurada' },
        { status: 400 }
      );
    }

    let results: any[] = [];

    // Buscar en Hunter.io
    if (source === 'hunter') {
      results = await searchHunterIO({
        apiKey,
        company,
        title,
        limit,
      });
    }

    // Guardar historial de búsqueda
    const criterios = {
      source,
      title,
      company,
      industry,
      location,
      companySize,
      keywords,
      limit,
    };

    await prisma.externalLeadSearch.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        criterios,
        fuente: source,
        totalResultados: results.length,
        resultados: results,
      },
    });

    return NextResponse.json({
      success: true,
      results,
      total: results.length,
      source,
    });
  } catch (error: any) {
    console.error('Error searching external leads:', error);
    return NextResponse.json(
      { error: error.message || 'Error al buscar leads' },
      { status: 500 }
    );
  }
}

// Función helper para buscar en Hunter.io
async function searchHunterIO(params: {
  apiKey: string;
  company: string;
  title?: string;
  limit: number;
}): Promise<any[]> {
  const { apiKey, company, title, limit } = params;

  if (!company) {
    throw new Error('Company name is required for Hunter.io search');
  }

  // Buscar dominio de la empresa primero
  const domainUrl = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
    company
  )}&api_key=${apiKey}&limit=${limit}`;

  const domainResponse = await fetch(domainUrl);
  const domainData = await domainResponse.json();

  if (!domainResponse.ok) {
    throw new Error(
      domainData.errors?.[0]?.details || 'Error searching Hunter.io'
    );
  }

  const emails = domainData.data?.emails || [];

  // Filtrar por título si se especifica
  let filteredEmails = emails;
  if (title) {
    const titleLower = title.toLowerCase();
    filteredEmails = emails.filter((email: any) => {
      const position = (email.position || '').toLowerCase();
      return position.includes(titleLower);
    });
  }

  // Formatear resultados
  const results = filteredEmails.map((email: any) => ({
    name: `${email.first_name || ''} ${email.last_name || ''}`.trim() || 'Unknown',
    email: email.value,
    title: email.position || 'N/A',
    company: domainData.data?.organization || company,
    location: email.country || 'N/A',
    phone: email.phone_number || null,
    linkedin: email.linkedin || null,
    confidence: email.confidence || 0,
    source: 'hunter',
  }));

  return results;
}
