export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Listar aseguradoras
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const activa = searchParams.get('activa');

    const where: any = { tenantId: auth.tenant!.id };
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { nif: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (activa !== null && activa !== undefined) {
      where.activa = activa === 'true';
    }

    const aseguradoras = await prisma.aseguradora.findMany({
      where,
      include: {
        _count: { select: { polizas: true, productos: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    // Envolver en objeto { aseguradoras } para que la UI lea data.aseguradoras
    // (también aceptamos el formato legacy de array plano por compatibilidad).
    return NextResponse.json({ aseguradoras });
  } catch (error) {
    console.error('Error al obtener aseguradoras:', error);
    return NextResponse.json({ error: 'Error al obtener aseguradoras' }, { status: 500 });
  }
}

// POST - Crear aseguradora
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await req.json();
    const { nombre, nif, direccion, telefono, email, web } = data;

    if (!nombre) {
      return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
    }

    // Verificar duplicado
    const existing = await prisma.aseguradora.findFirst({
      where: { tenantId: auth.tenant!.id, nombre },
    });
    if (existing) {
      return NextResponse.json({ error: 'Ya existe una aseguradora con este nombre' }, { status: 400 });
    }

    const aseguradora = await prisma.aseguradora.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre,
        nif: nif || null,
        direccion: direccion || null,
        telefono: telefono || null,
        email: email || null,
        web: web || null,
      },
    });

    return NextResponse.json(aseguradora, { status: 201 });
  } catch (error) {
    console.error('Error al crear aseguradora:', error);
    return NextResponse.json({ error: 'Error al crear aseguradora' }, { status: 500 });
  }
}
