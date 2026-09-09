export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { recordExternalSearch } from '@/lib/leads/external-search-history';

// GET /api/leads/external/search - Historial de búsquedas externas (lectura pura)
// La búsqueda en sí es POST; el GET solo lee el historial registrado.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const source = request.nextUrl.searchParams.get('source') || undefined;
    const history = await prisma.externalLeadSearch.findMany({
      where: {
        tenantId: user.tenantId,
        ...(source ? { fuente: source } : {}),
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 20,
    });

    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    console.error('Error obteniendo historial de búsquedas externas:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener historial' },
      { status: 500 }
    );
  }
}

// POST /api/leads/external/search - Buscar leads en plataformas externas
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

    // Obtener criterios de búsqueda del body
    const body = await request.json();
    const source = body.source || 'hunter';
    const title = body.title || '';
    const company = body.company || '';
    const industry = body.industry || '';
    const location = body.location || '';
    const companySize = body.companySize || '';
    const keywords = body.keywords || '';
    const limit = parseInt(body.limit || '20');

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

    // Guardar historial de búsqueda (escritura en POST, no en lecturas)
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

    await recordExternalSearch({
      tenantId: user.tenantId,
      userId: user.id,
      criterios,
      fuente: source,
      totalResultados: results.length,
      resultados: results,
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
