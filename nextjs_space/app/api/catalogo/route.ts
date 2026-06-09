export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { getFiscalConfig } from '@/lib/fiscal-engine';
import { ItemIntegrityService } from '@/lib/security/item-integrity';
import { checkFeatureLimit } from '@/lib/subscription';

// GET - Listar ítems del catálogo
export async function GET(req: NextRequest) {
  try {
    // Acepta tanto 'catalogo:read' como 'config:read' para compatibilidad
    const auth = await authenticateRequest(req, ['catalogo:read', 'config:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo');
    const activo = searchParams.get('activo');
    const search = searchParams.get('search');
    const categoria = searchParams.get('categoria');
    const etiqueta = searchParams.get('etiqueta');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = { tenantId: auth.tenant!.id };
    
    if (tipo) where.tipo = tipo;
    if (activo !== null && activo !== undefined) where.activo = activo === 'true';
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    // Filtrar por categoría (array contains)
    if (categoria) {
      where.categorias = { has: categoria };
    }
    // Filtrar por etiqueta (array contains)
    if (etiqueta) {
      where.etiquetas = { has: etiqueta };
    }

    const [items, total] = await Promise.all([
      prisma.catalogoItem.findMany({
        where,
        include: {
          tasaImpuesto: {
            select: {
              id: true,
              nombre: true,
              codigo: true,
              porcentaje: true,
              tipo: true,
            },
          },
          ownerContact: {
            select: {
              id: true,
              nombre: true,
              email: true,
              telefono: true,
            },
          },
        },
        orderBy: [{ destacado: 'desc' }, { nombre: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.catalogoItem.count({ where }),
    ]);

    // Obtener categorías y etiquetas únicas para filtros
    const allItems = await prisma.catalogoItem.findMany({
      where: { tenantId: auth.tenant!.id },
      select: { categorias: true, etiquetas: true },
    });
    
    const uniqueCategorias = [...new Set(allItems.flatMap(i => i.categorias || []))];
    const uniqueEtiquetas = [...new Set(allItems.flatMap(i => i.etiquetas || []))];

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      filtros: {
        categorias: uniqueCategorias,
        etiquetas: uniqueEtiquetas,
      },
    });
  } catch (error) {
    console.error('Error al obtener catálogo:', error);
    return NextResponse.json({ error: 'Error al obtener catálogo' }, { status: 500 });
  }
}

// POST - Crear nuevo ítem en el catálogo
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const data = await req.json();
    const {
      nombre,
      descripcion,
      sku,
      tipo = 'servicio',
      precioBase,
      moneda,
      categoriaFiscal = 'general',
      tasaImpuestoId,
      duracionMinutos,
      modalidad,
      unidad = 'unidad',
      activo = true,
      destacado = false,
      media,
      pricing,
      customFieldValues,
      categorias,
      etiquetas,
      metadata,
      // Onboarding 2.0 / MRP Fields
      isManufactured = false,
      costOfAcquisition = 0,
      contactId,
      inventoryConfig, 
      bom,
    } = data;

    // Verificar límite de productos/servicios
    const limitCheck = await checkFeatureLimit(auth.tenant!.id, 'catalogo_items', 1)
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: `Has alcanzado el límite de ${limitCheck.limit} productos/servicios en tu plan actual.` },
        { status: 403 }
      )
    }

    if (!nombre || precioBase === undefined) {
      return NextResponse.json(
        { error: 'Nombre y precio base son requeridos' },
        { status: 400 }
      );
    }

    // Obtener configuración fiscal para la moneda por defecto
    const fiscalConfig = await getFiscalConfig(auth.tenant!.id);

    // Verificar SKU único si se proporciona
    if (sku) {
      const existing = await prisma.catalogoItem.findUnique({
        where: {
          tenantId_sku: {
            tenantId: auth.tenant!.id,
            sku,
          },
        },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Ya existe un ítem con este SKU' },
          { status: 400 }
        );
      }
    }

    const item = await prisma.catalogoItem.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre,
        descripcion,
        sku: sku || null,
        tipo,
        precioBase: parseFloat(precioBase),
        moneda: moneda || fiscalConfig.currencyCode,
        categoriaFiscal,
        tasaImpuestoId: tasaImpuestoId || null,
        duracionMinutos: duracionMinutos ? parseInt(duracionMinutos) : null,
        modalidad: modalidad || null,
        unidad,
        activo,
        destacado,
        // Nuevos campos Fase 1
        customFieldValues: customFieldValues || null,
        categorias: categorias || [],
        etiquetas: etiquetas || [],
        metadata: metadata || null,
        media: media || null,
        pricing: pricing || null,
        isManufactured,
        costOfAcquisition: parseFloat(costOfAcquisition || 0),
        contactId: contactId || null,
        // 🛡️ Integrity Hash
        integrityHash: ItemIntegrityService.calculateHash({
          tenantId: auth.tenant!.id,
          nombre,
          sku: sku || '',
          precioBase: parseFloat(precioBase),
          costOfAcquisition: parseFloat(costOfAcquisition || 0),
        }),
        // 📦 Inventory Config
        inventoryConfig: inventoryConfig ? {
          create: inventoryConfig
        } : undefined,
        // 🏗️ BoM
        billOfMaterials: (isManufactured && bom) ? {
          create: {
            tenantId: auth.tenant!.id,
            laborCost: parseFloat(bom.laborCost || 0),
            overheadCost: parseFloat(bom.overheadCost || 0),
            components: {
              create: bom.components?.map((c: any) => ({
                componentId: c.componentId,
                quantityRequired: parseFloat(c.quantityRequired),
                unit: c.unit || 'unit'
              })) || []
            }
          }
        } : undefined
      },
      include: {
        tasaImpuesto: true,
        ownerContact: {
          select: { id: true, nombre: true, email: true, telefono: true }
        },
        inventoryConfig: true,
        billOfMaterials: {
          include: { components: true }
        }
      },
    });
    
    // 🧠 AI Indexing Stub: Si hay documento técnico, solicitar indexación al MCP
    if (media?.documento_tecnico) {
      console.log(`[MCP] Requesting indexing for document: ${media.documento_tecnico} (Item: ${item.id})`);
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error al crear ítem:', error);
    return NextResponse.json({ error: 'Error al crear ítem' }, { status: 500 });
  }
}
