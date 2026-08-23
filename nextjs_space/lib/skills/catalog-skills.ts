/**
 * Catalog Skills
 * API funcional para operaciones del catálogo de productos/servicios
 * 
 * Incluye:
 * - Exportación completa del catálogo con custom fields
 * - Obtener definiciones de campos personalizados
 * - Búsqueda y filtrado de ítems
 * - Búsqueda avanzada para chatbot con filtros dinámicos (buscarCatalogo)
 */

import { prisma } from '@/lib/db';
import { KnowledgeService } from '@/lib/knowledge/knowledge-service';

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

/**
 * Input para buscarCatalogo — skill del chatbot con filtros dinámicos.
 * Soporta búsqueda semántica (vía KnowledgeService.searchCatalogItems)
 * + filtros estructurados: tipo, precio, ciudad, habitaciones, etc.
 */
export interface BuscarCatalogoInput {
  tenantId: string;
  /** Canal interno (Telegram/agent) puede consultar todos los ítems activos;
   * los canales públicos respetan visibleInChatbot. */
  source?: 'telegram' | 'agent' | 'public';
  /** Texto libre de búsqueda (usa búsqueda semántica con embeddings) */
  query?: string;
  /** Tipo de ítem: inmueble, servicio, producto, etc. */
  tipo?: string;
  /** Precio mínimo */
  precioMin?: number;
  /** Precio máximo */
  precioMax?: number;
  /** Categoría del catálogo */
  categoria?: string;
  /** Etiqueta del catálogo */
  etiqueta?: string;
  /** Filtros por customFieldValues (ej: { ciudad: 'Madrid', habitaciones: '3' }) */
  filtrosCustom?: Record<string, string>;
  /** Máximo de resultados */
  limit?: number;
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
 * Buscar en el catálogo (versión original: API/MCP)
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

/**
 * 🆕 Buscar en el catálogo para el chatbot con filtros dinámicos.
 * 
 * Pipeline:
 * 1. Si hay `query`, usa búsqueda semántica vía KnowledgeService.searchCatalogItems()
 *    (solo ítems con visibleInChatbot=true + embeddings vectoriales)
 * 2. Si no hay `query` pero hay filtros, consulta directa a Prisma
 * 3. Aplica filtros adicionales: tipo, precioMin/Max, categoria, etiqueta, customFields
 * 4. Retorna resultados formateados para el chatbot (texto amigable + datos estructurados)
 * 
 * Soporta filtros por customFieldValues para búsquedas como:
 *   "busca propiedades en Madrid con 3 habitaciones"
 *   → { query: "propiedades Madrid 3 habitaciones", tipo: "inmueble", filtrosCustom: { ciudad: "Madrid", habitaciones: "3" } }
 */
export async function buscarCatalogo(input: BuscarCatalogoInput) {
  const {
    tenantId,
    query,
    tipo,
    source = 'public',
    precioMin,
    precioMax,
    categoria,
    etiqueta,
    filtrosCustom,
    limit = 10,
  } = input;

  let items: Array<{
    id: string;
    nombre: string;
    descripcion: string | null;
    tipo: string;
    precioBase: number;
    moneda: string;
    categorias: string[];
    etiquetas: string[];
    duracionMinutos: number | null;
    modalidad: string | null;
    customFieldValues: any;
  }> = [];

  // ═══ 1. Búsqueda semántica (si hay query) ═══
  if (query) {
    try {
      const semanticResults = await KnowledgeService.searchCatalogItems(tenantId, query);
      
      if (semanticResults.length > 0 && source === 'public') {
        // Enriquecer con datos completos de Prisma
        const ids = semanticResults.map(r => r.id);
        const fullItems = await prisma.catalogoItem.findMany({
          where: { id: { in: ids }, tenantId },
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            tipo: true,
            precioBase: true,
            moneda: true,
            categorias: true,
            etiquetas: true,
            duracionMinutos: true,
            modalidad: true,
            customFieldValues: true,
          },
        });

        // Mantener orden semántico
        const itemMap = new Map(fullItems.map(i => [i.id, i]));
        items = ids.map(id => itemMap.get(id)).filter(Boolean) as typeof items;
      }
    } catch (err) {
      console.warn('[buscarCatalogo] Error en búsqueda semántica, usando búsqueda directa:', err);
    }
  }

  // ═══ 2. Fallback: búsqueda directa por filtros ═══
  if (items.length === 0) {
    const where: any = {
      tenantId,
      activo: true,
      ...(source === 'public' ? { visibleInChatbot: true } : {}),
    };
    if (tipo) where.tipo = tipo;
    if (categoria) where.categorias = { has: categoria };
    if (etiqueta) where.etiquetas = { has: etiqueta };
    if (precioMin !== undefined || precioMax !== undefined) {
      where.precioBase = {};
      if (precioMin !== undefined) where.precioBase.gte = precioMin;
      if (precioMax !== undefined) where.precioBase.lte = precioMax;
    }
    if (query) {
      where.OR = [
        { nombre: { contains: query, mode: 'insensitive' } },
        { descripcion: { contains: query, mode: 'insensitive' } },
      ];
    }

    items = await prisma.catalogoItem.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipo: true,
        precioBase: true,
        moneda: true,
        categorias: true,
        etiquetas: true,
        duracionMinutos: true,
        modalidad: true,
        customFieldValues: true,
      },
      orderBy: [{ destacado: 'desc' }, { precioBase: 'asc' }],
    });
  }

  // ═══ 3. Filtros post-query: custom fields ═══
  if (filtrosCustom && Object.keys(filtrosCustom).length > 0 && items.length > 0) {
    items = items.filter(item => {
      if (!item.customFieldValues) return false;
      const values = item.customFieldValues as Record<string, any>;
      for (const [key, val] of Object.entries(filtrosCustom)) {
        const itemVal = values[key];
        if (itemVal === undefined || itemVal === null) return false;
        if (!String(itemVal).toLowerCase().includes(String(val).toLowerCase())) return false;
      }
      return true;
    });
  }

  // ═══ 4. Filtros post-query: precio (si llegaron items semánticos sin filtrar) ═══
  if (query && (precioMin !== undefined || precioMax !== undefined)) {
    if (precioMin !== undefined) items = items.filter(i => i.precioBase >= precioMin);
    if (precioMax !== undefined) items = items.filter(i => i.precioBase <= precioMax);
  }

  // ═══ 5. Formatear respuesta para el chatbot ═══
  const total = items.length;
  const paginated = items.slice(0, limit);

  if (paginated.length === 0) {
    const filtroStr = query ? ` "${query}"` : '';
    const tipoStr = tipo ? ` de tipo ${tipo}` : '';
    return {
      success: true,
      message: `🔍 No encontré productos/servicios${filtroStr}${tipoStr} en el catálogo visible. ¿Quieres que busque con otros términos?`,
      items: [],
      total: 0,
    };
  }

  const formattedItems = paginated.map(item => {
    const precio = `${item.precioBase} ${item.moneda || 'EUR'}`;
    const duracion = item.duracionMinutos ? ` · ${item.duracionMinutos} min` : '';
    const modalidad = item.modalidad ? ` · ${item.modalidad}` : '';
    const cats = item.categorias?.length ? ` · ${item.categorias.slice(0, 2).join(', ')}` : '';

    // Extraer datos relevantes de customFieldValues
    let extraInfo = '';
    if (item.customFieldValues) {
      const cv = item.customFieldValues as Record<string, any>;
      const highlights: string[] = [];
      if (cv.ciudad) highlights.push(`📍 ${cv.ciudad}`);
      if (cv.habitaciones) highlights.push(`🛏️ ${cv.habitaciones} hab`);
      if (cv.banos) highlights.push(`🚿 ${cv.banos} baños`);
      if (cv.metros_cuadrados || cv.m2) highlights.push(`📐 ${cv.metros_cuadrados || cv.m2} m²`);
      if (cv.estado) highlights.push(cv.estado);
      if (highlights.length > 0) extraInfo = ' · ' + highlights.join(' · ');
    }

    return {
      id: item.id,
      nombre: item.nombre,
      tipo: item.tipo,
      precio,
      descripcion: item.descripcion?.substring(0, 200),
      resumen: `${item.nombre} — ${precio}${duracion}${modalidad}${cats}${extraInfo}`,
    };
  });

  const resumen = formattedItems.map(i => `• ${i.resumen}`).join('\n');
  const mensaje = `🔍 *Resultados${query ? ` para "${query}"` : ''}* (${total} encontrados):\n\n${resumen}${total > limit ? `\n\n_...y ${total - limit} más. Afina tu búsqueda para ver resultados más específicos._` : ''}`;

  // ═══ 6. Generar quick replies basados en los resultados ═══
  const quickReplies = generateCatalogQuickReplies(items, total, limit, query, tipo, precioMin, precioMax, categoria, filtrosCustom);

  return {
    success: true,
    message: mensaje,
    items: formattedItems,
    total,
    hasMore: total > limit,
    quickReplies,
  };
}

// ============== QUICK REPLIES GENERATOR ==============

/**
 * Genera quick replies (botones sugeridos) basados en los resultados del catálogo
 * para que el cliente pueda filtrar más sin tener que escribir.
 *
 * Estrategia de generación (máx 6 replies, priorizados):
 * 1. Ciudades/ubicaciones encontradas (hasta 2)
 * 2. Rangos de precio sugeridos (hasta 2)
 * 3. Tipos de ítem disponibles (hasta 2)
 * 4. Categorías disponibles (hasta 1)
 * 5. Opción "Ver todos" si hay más resultados
 */
function generateCatalogQuickReplies(
  items: Array<{
    nombre: string;
    tipo: string;
    precioBase: number;
    categorias: string[];
    customFieldValues: any;
  }>,
  total: number,
  limit: number,
  currentQuery?: string,
  currentTipo?: string,
  currentPrecioMin?: number,
  currentPrecioMax?: number,
  currentCategoria?: string,
  currentFiltrosCustom?: Record<string, string>,
): string[] {
  const replies: string[] = [];
  const MAX_REPLIES = 6;

  // ═══ Extraer ciudades de customFieldValues ═══
  if (!currentFiltrosCustom?.ciudad) {
    const ciudades = new Map<string, number>();
    for (const item of items) {
      if (item.customFieldValues) {
        const cv = item.customFieldValues as Record<string, any>;
        const ciudad = cv.ciudad;
        if (ciudad && typeof ciudad === 'string') {
          const ciudadLower = ciudad.trim();
          ciudades.set(ciudadLower, (ciudades.get(ciudadLower) || 0) + 1);
        }
      }
    }

    // Top 2 ciudades por frecuencia
    const topCiudades = [...ciudades.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    for (const [ciudad, count] of topCiudades) {
      if (replies.length >= MAX_REPLIES) break;
      const ciudadCapitalizada = ciudad.charAt(0).toUpperCase() + ciudad.slice(1);
      replies.push(`📍 Solo en ${ciudadCapitalizada} (${count})`);
    }
  }

  // ═══ Rangos de precio sugeridos (si no hay filtro de precio) ═══
  if (currentPrecioMin === undefined && currentPrecioMax === undefined && items.length > 1) {
    const precios = items.map(i => i.precioBase).filter(p => p > 0).sort((a, b) => a - b);

    if (precios.length >= 2) {
      const min = precios[0];
      const max = precios[precios.length - 1];
      const range = max - min;

      if (range > 0 && replies.length < MAX_REPLIES) {
        // Bajo: hasta el percentil 33
        const lowCutoff = precios[Math.floor(precios.length * 0.33)];
        const midCutoff = precios[Math.floor(precios.length * 0.66)];

        if (lowCutoff > min && lowCutoff !== max) {
          replies.push(`💰 Hasta ${formatPrice(lowCutoff)}`);
        }
        if (midCutoff > lowCutoff && replies.length < MAX_REPLIES && midCutoff !== max) {
          replies.push(`💰 Entre ${formatPrice(lowCutoff)}-${formatPrice(midCutoff)}`);
        }
        if (max > midCutoff && replies.length < MAX_REPLIES && max !== lowCutoff) {
          replies.push(`💰 Más de ${formatPrice(midCutoff)}`);
        }
      } else if (precios.length > 0 && replies.length < MAX_REPLIES) {
        // Un solo precio o precios iguales - ofrecer por debajo/encima
        const precio = precios[0];
        replies.push(`💰 Menos de ${formatPrice(precio * 0.8)}`);
      }
    }
  }

  // ═══ Tipos de ítem disponibles (si no hay filtro de tipo) ═══
  if (!currentTipo && replies.length < MAX_REPLIES) {
    const tipos = new Map<string, number>();
    for (const item of items) {
      if (item.tipo) {
        tipos.set(item.tipo, (tipos.get(item.tipo) || 0) + 1);
      }
    }

    // Mostrar tipos más frecuentes (hasta 2, omitiendo el más común si es casi todo)
    const sortedTipos = [...tipos.entries()].sort((a, b) => b[1] - a[1]);
    const tipoLabels: Record<string, string> = {
      inmueble: '🏠 Solo inmuebles',
      servicio: '🔧 Solo servicios',
      producto_terminado: '📦 Solo productos',
      materia_prima: '🧱 Solo materias primas',
      insumo: '⚙️ Solo insumos',
      cita: '📅 Solo citas',
      academia: '🎓 Solo academia',
    };

    for (const [tipo, count] of sortedTipos) {
      if (replies.length >= MAX_REPLIES) break;
      // No mostrar si es el único tipo presente
      if (sortedTipos.length <= 1) break;
      const label = tipoLabels[tipo] || `📋 Solo ${tipo} (${count})`;
      if (!replies.some(r => r.includes(`Solo ${tipo}`))) {
        replies.push(label + (tipoLabels[tipo] ? '' : ''));
      }
    }
  }

  // ═══ Categorías disponibles (si no hay filtro de categoría) ═══
  if (!currentCategoria && replies.length < MAX_REPLIES) {
    const cats = new Map<string, number>();
    for (const item of items) {
      if (item.categorias) {
        for (const cat of item.categorias) {
          cats.set(cat, (cats.get(cat) || 0) + 1);
        }
      }
    }

    const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCat && topCat[1] >= 2) {
      const catCapitalizada = topCat[0].charAt(0).toUpperCase() + topCat[0].slice(1);
      replies.push(`📂 Cat: ${catCapitalizada} (${topCat[1]})`);
    }
  }

  // ═══ Ver todos si hay más resultados de los mostrados ═══
  if (total > limit && replies.length < MAX_REPLIES) {
    replies.push('🔍 Ver todos los resultados');
  }

  // ═══ Limpiar query actual si aplica ═══
  if (currentQuery && replies.length < MAX_REPLIES) {
    replies.push('🔄 Nueva búsqueda');
  }

  return replies.slice(0, MAX_REPLIES);
}

/**
 * Formatea un precio de forma legible: 150000 → "150K", 2500 → "2.5K", 50 → "50"
 */
function formatPrice(price: number): string {
  if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
  if (price >= 10000) return `${Math.round(price / 1000)}K`;
  if (price >= 1000) return `${(Math.round(price / 100) / 10)}K`;
  return `${price}`;
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
