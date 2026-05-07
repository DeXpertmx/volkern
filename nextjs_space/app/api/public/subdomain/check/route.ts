import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const subdomain = req.nextUrl.searchParams.get('subdomain');

  if (!subdomain) {
    return NextResponse.json({ error: 'Subdominio es requerido' }, { status: 400 });
  }

  // Reservados
  const RESERVED = ['www', 'app', 'api', 'auth', 'login', 'register', 'dashboard', 'webcreator', 'admin'];
  if (RESERVED.includes(subdomain.toLowerCase())) {
    return NextResponse.json({ available: false, message: 'Subdominio reservado' });
  }

  const existing = await prisma.tenant.findUnique({
    where: { subdomain: subdomain.toLowerCase() }
  });

  return NextResponse.json({ 
    available: !existing,
    message: existing ? 'Subdominio ya en uso' : 'Disponible'
  });
}
