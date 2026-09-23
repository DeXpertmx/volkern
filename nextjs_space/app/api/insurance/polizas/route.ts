export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { monedaEscritura } from '@/lib/moneda';

// GET - Listar pólizas con filtros, búsqueda y paginación
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const ramo = searchParams.get('ramo');
    const estado = searchParams.get('estado');
    const aseguradoraId = searchParams.get('aseguradoraId');
    const clienteId = searchParams.get('clienteId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = { tenantId: auth.tenant!.id };

    if (search) {
      where.OR = [
        { numeroPoliza: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
        { cliente: { nombre: { contains: search, mode: 'insensitive' } } },
        { aseguradora: { nombre: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (estado) where.estado = estado;
    if (aseguradoraId) where.aseguradoraId = aseguradoraId;
    if (clienteId) where.clienteId = clienteId;
    if (ramo) {
      const ramosValidos = ['AUTO','HOGAR','VIDA','SALUD','GASTOS_MEDICOS','EMPRESARIAL','RESPONSABILIDAD_CIVIL','INCENDIO','TRANSPORTE','AHORRO','JUBILACION','OTROS'];
      if (ramosValidos.includes(ramo.toUpperCase())) {
        where.productoSeguro = { ramo: ramo.toUpperCase() };
      }
    }

    const [polizas, total] = await Promise.all([
      prisma.poliza.findMany({
        where,
        include: {
          cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
          aseguradora: { select: { id: true, nombre: true } },
          productoSeguro: { select: { id: true, nombre: true, ramo: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { fechaVencimiento: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.poliza.count({ where }),
    ]);

    return NextResponse.json({
      polizas,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error al obtener pólizas:', error);
    return NextResponse.json({ error: 'Error al obtener pólizas' }, { status: 500 });
  }
}

// POST - Crear nueva póliza
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await req.json();
    const {
      clienteId,
      aseguradoraId,
      productoSeguroId,
      numeroPoliza,
      descripcion,
      sumaAsegurada,
      primaAnual,
      formaPago,
      moneda,
      fechaInicio,
      fechaVencimiento,
      comisionPct,
      notas,
    } = data;

    if (!clienteId || !aseguradoraId || !productoSeguroId || !numeroPoliza || !fechaInicio || !fechaVencimiento) {
      return NextResponse.json(
        { error: 'clienteId, aseguradoraId, productoSeguroId, numeroPoliza, fechaInicio, y fechaVencimiento son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el número de póliza no esté duplicado
    const existing = await prisma.poliza.findFirst({
      where: { tenantId: auth.tenant!.id, numeroPoliza },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe una póliza con este número' },
        { status: 400 }
      );
    }

    // Verificar que las referencias existen
    const [cliente, aseguradora, producto] = await Promise.all([
      prisma.contact.findFirst({ where: { id: clienteId, tenantId: auth.tenant!.id } }),
      prisma.aseguradora.findFirst({ where: { id: aseguradoraId, tenantId: auth.tenant!.id } }),
      prisma.productoSeguro.findFirst({ where: { id: productoSeguroId, tenantId: auth.tenant!.id } }),
    ]);

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    if (!aseguradora) return NextResponse.json({ error: 'Aseguradora no encontrada' }, { status: 404 });
    if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const poliza = await prisma.poliza.create({
      data: {
        tenantId: auth.tenant!.id,
        clienteId,
        aseguradoraId,
        productoSeguroId,
        numeroPoliza,
        descripcion: descripcion || null,
        sumaAsegurada: sumaAsegurada ? parseFloat(sumaAsegurada) : null,
        primaAnual: primaAnual ? parseFloat(primaAnual) : null,
        formaPago: formaPago || null,
        // Divisa de la póliza: la que indique el usuario y, si no la indica, la
        // de reporte del tenant. Antes nacía en 'EUR' (el valor por defecto de
        // la columna), así que un tenant en pesos guardaba pólizas en euros.
        moneda: monedaEscritura(moneda, auth.tenant?.moneda),
        fechaInicio: new Date(fechaInicio),
        fechaVencimiento: new Date(fechaVencimiento),
        comisionPct: comisionPct ? parseFloat(comisionPct) : null,
        notas: notas || null,
        createdById: auth.user!.id,
      },
      include: {
        cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(poliza, { status: 201 });
  } catch (error) {
    console.error('Error al crear póliza:', error);
    return NextResponse.json({ error: 'Error al crear póliza' }, { status: 500 });
  }
}
