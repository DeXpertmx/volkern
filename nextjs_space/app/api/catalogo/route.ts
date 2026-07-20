export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { getFiscalConfig } from '@/lib/fiscal-engine';
import { ItemIntegrityService } from '@/lib/security/item-integrity';
import { checkFeatureLimit } from '@/lib/subscription';
import { EmbeddingService } from '@/lib/knowledge/embedding-service';

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

    const [catalogoItems, catalogoCount, serviciosLegacy] = await Promise.all([
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
      prisma.servicio.findMany({
        where: {
          tenantId: auth.tenant!.id,
          activo: activo !== null ? activo === 'true' : undefined,
          ...(search ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
            ]
          } : {}),
        },
      }),
    ]);

    // Mapear Servicio legacy a forma CatalogoItem, deduplicando
    const catalogoIds = new Set(catalogoItems.map(c => c.id))
    const legacyMap = new Map<string, typeof catalogoItems[0]>()
    for (const s of serviciosLegacy) {
      if (s.catalogoItemId && catalogoIds.has(s.catalogoItemId)) continue
      const key = s.catalogoItemId || s.id
      if (legacyMap.has(key)) continue
      legacyMap.set(key, {
        id: s.catalogoItemId || s.id,
        tenantId: s.tenantId || '',
        nombre: s.nombre,
        descripcion: s.descripcion,
        tipo: 'servicio' as const,
        precioBase: s.precio,
        moneda: s.moneda || 'EUR',
        duracionMinutos: s.duracionMinutos,
        modalidad: s.modalidad || 'presencial',
        activo: s.activo,
        sku: null,
        codigoBarras: null,
        categoria: null,
        categorias: [],
        etiquetas: [],
        destacado: false,
        metadata: null,
        imagenUrl: null,
        galeriaUrls: null,
        manageStock: false,
        stockActual: 0,
        stockMinimo: 0,
        costoUnitario: null,
        fechaCreacion: null as any,
        fechaActualizacion: null as any,
        unidadMedida: null,
        peso: null,
        alto: null,
        ancho: null,
        profundo: null,
        tasaImpuestoId: null,
        ownerContactId: null,
        tasaImpuesto: null,
        ownerContact: null,
      })
    }

    // Incluir siempre Servicio legacy independientemente del filtro tipo
    const items = [...catalogoItems, ...Array.from(legacyMap.values())]
    const total = catalogoCount + legacyMap.size

    // Ordenar por nombre
    items.sort((a, b) => a.nombre.localeCompare(b.nombre))

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
      visibleInChatbot = false,
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
        visibleInChatbot,
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

    // 🔍 Embedding: Generar si el ítem es visible para el chatbot
    if (visibleInChatbot) {
      EmbeddingService.generateForCatalogItem({
        nombre,
        descripcion,
        precioBase: parseFloat(precioBase),
        moneda: moneda || fiscalConfig.currencyCode,
        duracionMinutos: duracionMinutos ? parseInt(duracionMinutos) : null,
        modalidad: modalidad || null,
        categorias: categorias || [],
      }).then(vectorId => {
        if (vectorId) {
          prisma.catalogoItem.update({
            where: { id: item.id },
            data: { vectorId },
          }).then(() => {
            console.log(`[Catalogo] ✅ Embedding generado para ítem "${nombre}" (${item.id})`)
          }).catch(err => {
            console.warn(`[Catalogo] Error guardando embedding para "${nombre}":`, err)
          })
        }
      }).catch(err => {
        console.warn(`[Catalogo] Error generando embedding para "${nombre}":`, err)
      })
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error al crear ítem:', error);
    return NextResponse.json({ error: 'Error al crear ítem' }, { status: 500 });
  }
}
