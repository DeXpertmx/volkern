export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/cms/catalogo/data - Obtener datos del catálogo para el Web Creator
 * Provee ítems y definiciones de campos personalizados.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);
    
    // Parámetros de filtrado
    const category = searchParams.get('category');
    const type = searchParams.get('type') || 'producto'; // Default a producto o buscar todos
    const itemId = searchParams.get('itemId'); // Para carga de un ítem específico en el hidratador
    const limit = parseInt(searchParams.get('limit') || '12');

    // 1. Obtener definiciones de campos para mapeo en el editor
    const fieldDefinitions = await prisma.catalogoFieldDefinition.findMany({
      where: { 
        tenantId,
        activo: true 
      },
      orderBy: { orden: 'asc' }
    });

    // 2. Si se solicita un ítem específico (Página de Detalle)
    if (itemId) {
      const item = await prisma.catalogoItem.findFirst({
        where: {
          id: itemId,
          tenantId,
          activo: true
        }
      });
      
      if (!item) {
        return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
      }

      return NextResponse.json({ 
        item,
        fieldDefinitions 
      });
    }

    // 3. Obtener lista de ítems (Galería)
    const where: any = {
      tenantId,
      activo: true
    };

    if (category && category !== 'all') {
      where.categorias = { has: category };
    }

    const items = await prisma.catalogoItem.findMany({
      where,
      orderBy: [{ destacado: 'desc' }, { fechaCreacion: 'desc' }],
      take: limit
    });

    // Extraer categorías únicas para que el editor las use en el dropdown del bloque
    const allItemsForCategories = await prisma.catalogoItem.findMany({
      where: { tenantId },
      select: { categorias: true }
    });
    const uniqueCategories = Array.from(new Set(allItemsForCategories.flatMap(i => i.categorias || [])));

    return NextResponse.json({
      items,
      fieldDefinitions,
      categories: uniqueCategories
    });

  } catch (error) {
    console.error('[CMS Catalog Data] Error:', error);
    return NextResponse.json({ error: 'Error al obtener datos del catálogo' }, { status: 500 });
  }
}, ['cms:read', 'catalogo:read']);
