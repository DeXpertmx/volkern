export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// GET - Listar productos de seguro
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const ramo = searchParams.get('ramo');
    const aseguradoraId = searchParams.get('aseguradoraId');
    const activo = searchParams.get('activo');

    const where: any = { tenantId: auth.tenant!.id };
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (ramo) where.ramo = ramo;
    if (aseguradoraId) where.aseguradoraId = aseguradoraId;
    if (activo !== null && activo !== undefined) where.activo = activo === 'true';

    const productos = await prisma.productoSeguro.findMany({
      where,
      include: {
        aseguradora: { select: { id: true, nombre: true } },
        _count: { select: { polizas: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
  }
}

// POST - Crear producto de seguro
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await req.json();
    const {
      aseguradoraId,
      nombre,
      ramo,
      subramo,
      descripcion,
      primaReferencia,
      comisionPct,
    } = data;

    if (!aseguradoraId || !nombre || !ramo) {
      return NextResponse.json(
        { error: 'aseguradoraId, nombre y ramo son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que la aseguradora existe
    const aseguradora = await prisma.aseguradora.findFirst({
      where: { id: aseguradoraId, tenantId: auth.tenant!.id },
    });
    if (!aseguradora) {
      return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    }

    // Verificar duplicado
    const existing = await prisma.productoSeguro.findFirst({
      where: { tenantId: auth.tenant!.id, aseguradoraId, nombre },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un producto con este nombre para esta aseguradora' },
        { status: 400 }
      );
    }

    const producto = await prisma.productoSeguro.create({
      data: {
        tenantId: auth.tenant!.id,
        aseguradoraId,
        nombre,
        ramo,
        subramo: subramo || null,
        descripcion: descripcion || null,
        primaReferencia: primaReferencia ? parseFloat(primaReferencia) : null,
        comisionPct: comisionPct ? parseFloat(comisionPct) : null,
      },
      include: {
        aseguradora: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json(producto, { status: 201 });
  } catch (error) {
    console.error('Error al crear producto:', error);
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 });
  }
}
