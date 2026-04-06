/**
 * Catalog Skills
 * API funcional para operaciones del catálogo de productos/servicios
 * 
 * Incluye:
 * - Exportación completa del catálogo con custom fields
 * - Obtener definiciones de campos personalizados
 * - Búsqueda y filtrado de ítems
 */

import { prisma } from '@/lib/db';

// ============== TIPOS ==============

export interface ExportCatalogInput {
  tenantId: string;
  // Filtros opcionales
  tipo?: string;
  activo?: boolean;
  categoria?: string;
  etiqueta?: string;
  search?: string;
  // Opciones de exportación
  format?: 'json' | 'csv';
  includeFieldDefinitions?: boolean;
  includeCustomFields?: boolean;
  includeMedia?: boolean;
  includePricing?: boolean;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface GetFieldDefinitionsInput {
  tenantId: string;
  categoria?: string;
  activos?: boolean;
}

export interface GetCatalogItemInput {
  tenantId: string;
  itemId: string;
  includeCustomFields?: boolean;
}

export interface SearchCatalogInput {
  tenantId: string;
  search?: string;
  tipo?: string;
  categoria?: string;
  etiqueta?: string;
  activo?: boolean;
  limit?: number;
  offset?: number;
}

// ============== SKILLS ==============

/**
 * Exportar catálogo completo con todos los datos
 * Incluye custom fields, definiciones, media, pricing, etc.
 */
export async function exportCatalog(input: ExportCatalogInput) {
  const {
    tenantId,
    tipo,
    activo,
    categoria,
    etiqueta,
    search,
    format = 'json',
    includeFieldDefinitions = true,
    includeCustomFields = true,
    includeMedia = true,
    includePricing = true,
    userId,
    source = 'api',
  } = input;

  // Construir filtros
  const where: any = { tenantId };
  if (tipo) where.tipo = tipo;
  if (activo !== undefined) where.activo = activo;
  if (categoria) where.categorias = { has: categoria };
  if (etiqueta) where.etiquetas = { has: etiqueta };
  if (search) {
    where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { descripcion: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Obtener ítems del catálogo
  const items = await prisma.catalogoItem.findMany({
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
    },
    orderBy: [{ destacado: 'desc' }, { nombre: 'asc' }],
  });

  // Obtener definiciones de campos personalizados si se solicita
  let fieldDefinitions: any[] = [];
  if (includeFieldDefinitions) {
    fieldDefinitions = await prisma.catalogoFieldDefinition.findMany({
      where: { tenantId, activo: true },
      orderBy: [{ categoria: 'asc' }, { orden: 'asc' }],
    });
  }

  // Obtener categorías y etiquetas únicas
  const allCategorias = [...new Set(items.flatMap(i => i.categorias || []))];
  const allEtiquetas = [...new Set(items.flatMap(i => i.etiquetas || []))];

  // Procesar ítems para exportación
  const processedItems = items.map(item => {
    const baseItem: any = {
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      sku: item.sku,
      tipo: item.tipo,
      precioBase: item.precioBase,
      moneda: item.moneda,
      categoriaFiscal: item.categoriaFiscal,
      tasaImpuesto: item.tasaImpuesto,
      duracionMinutos: item.duracionMinutos,
      modalidad: item.modalidad,
      unidad: item.unidad,
      activo: item.activo,
      destacado: item.destacado,
      categorias: item.categorias,
      etiquetas: item.etiquetas,
      fechaCreacion: item.fechaCreacion,
      fechaActualizacion: item.fechaActualizacion,
    };

    // Incluir custom fields si se solicita
    if (includeCustomFields && item.customFieldValues) {
      baseItem.customFieldValues = item.customFieldValues;
      
      // Expandir custom fields como propiedades de primer nivel para facilitar uso
      const customValues = item.customFieldValues as Record<string, any>;
      for (const [key, value] of Object.entries(customValues)) {
        baseItem[`custom_${key}`] = value;
      }
    }

    // Incluir metadata
    if (item.metadata) {
      baseItem.metadata = item.metadata;
    }

    // Incluir media si se solicita
    if (includeMedia && item.media) {
      baseItem.media = item.media;
    }

    // Incluir pricing si se solicita
    if (includePricing && item.pricing) {
      baseItem.pricing = item.pricing;
    }

    return baseItem;
  });

  // Si el formato es CSV, convertir
  if (format === 'csv') {
    const csvData = convertToCSV(processedItems, fieldDefinitions);
    return {
      success: true,
      format: 'csv',
      data: csvData,
      totalItems: items.length,
      fieldDefinitions: includeFieldDefinitions ? fieldDefinitions : undefined,
      categorias: allCategorias,
      etiquetas: allEtiquetas,
    };
  }

  // Formato JSON (default)
  return {
    success: true,
    format: 'json',
    items: processedItems,
    totalItems: items.length,
    fieldDefinitions: includeFieldDefinitions ? fieldDefinitions : undefined,
    categorias: allCategorias,
    etiquetas: allEtiquetas,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Obtener definiciones de campos personalizados
 */
export async function getFieldDefinitions(input: GetFieldDefinitionsInput) {
  const { tenantId, categoria, activos = true } = input;

  const where: any = { tenantId };
  if (activos) where.activo = true;
  if (categoria) {
    where.OR = [
      { categoria },
      { categoria: null }, // Campos globales
    ];
  }

  const definitions = await prisma.catalogoFieldDefinition.findMany({
    where,
    orderBy: [{ categoria: 'asc' }, { orden: 'asc' }, { label: 'asc' }],
  });

  return {
    success: true,
    fieldDefinitions: definitions,
    total: definitions.length,
  };
}

/**
 * Obtener un ítem del catálogo por ID
 */
export async function getCatalogItem(input: GetCatalogItemInput) {
  const { tenantId, itemId, includeCustomFields = true } = input;

  const item = await prisma.catalogoItem.findFirst({
    where: { id: itemId, tenantId },
    include: {
      tasaImpuesto: true,
    },
  });

  if (!item) {
    return { success: false, error: 'Ítem no encontrado' };
  }

  // Obtener field definitions para enriquecer los custom fields
  let fieldDefinitions: any[] = [];
  if (includeCustomFields && item.customFieldValues) {
    fieldDefinitions = await prisma.catalogoFieldDefinition.findMany({
      where: { tenantId, activo: true },
      orderBy: [{ orden: 'asc' }],
    });
  }

  // Enriquecer custom fields con sus definiciones
  let enrichedCustomFields: any[] = [];
  if (includeCustomFields && item.customFieldValues) {
    const values = item.customFieldValues as Record<string, any>;
    enrichedCustomFields = fieldDefinitions.map(def => ({
      fieldKey: def.fieldKey,
      label: def.label,
      type: def.type,
      value: values[def.fieldKey] ?? null,
      unidad: def.unidad,
      options: def.options,
    }));
  }

  return {
    success: true,
    item: {
      ...item,
      enrichedCustomFields,
    },
  };
}

/**
 * Buscar en el catálogo
 */
export async function searchCatalog(input: SearchCatalogInput) {
  const {
    tenantId,
    search,
    tipo,
    categoria,
    etiqueta,
    activo = true,
    limit = 50,
    offset = 0,
  } = input;

  const where: any = { tenantId, activo };
  if (tipo) where.tipo = tipo;
  if (categoria) where.categorias = { has: categoria };
  if (etiqueta) where.etiquetas = { has: etiqueta };
  if (search) {
    where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { descripcion: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.catalogoItem.findMany({
      where,
      include: {
        tasaImpuesto: {
          select: { id: true, nombre: true, porcentaje: true },
        },
      },
      orderBy: [{ destacado: 'desc' }, { nombre: 'asc' }],
      take: limit,
      skip: offset,
    }),
    prisma.catalogoItem.count({ where }),
  ]);

  return {
    success: true,
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

// ============== HELPERS ==============

/**
 * Convertir items a CSV
 */
function convertToCSV(items: any[], fieldDefinitions: any[]): string {
  if (items.length === 0) return '';

  // Columnas base
  const baseColumns = [
    'id', 'nombre', 'descripcion', 'sku', 'tipo', 'precioBase', 'moneda',
    'categoriaFiscal', 'duracionMinutos', 'modalidad', 'unidad', 'activo', 'destacado',
    'categorias', 'etiquetas', 'fechaCreacion', 'fechaActualizacion'
  ];

  // Columnas de custom fields
  const customFieldColumns = fieldDefinitions.map(def => `custom_${def.fieldKey}`);

  const allColumns = [...baseColumns, ...customFieldColumns];

  // Header
  const header = allColumns.join(',');

  // Rows
  const rows = items.map(item => {
    return allColumns.map(col => {
      let value = item[col];
      
      // Manejar arrays
      if (Array.isArray(value)) {
        value = value.join(';');
      }
      
      // Manejar objetos
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      }
      
      // Manejar null/undefined
      if (value === null || value === undefined) {
        value = '';
      }
      
      // Escapar comillas y envolver en comillas si es necesario
      const strValue = String(value);
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}
