export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/real-estate/consult
 * RAG endpoint: consulta sobre propiedades usando IA + búsqueda semántica.
 * Requiere autenticación con API Key (X-API-Key o Authorization Bearer).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AIEngine } from '@/lib/event-engine/ai-engine/ai-engine';
import { parseInmueble } from '@/lib/real-estate/property-helpers';
import { formatearImporte } from '@/lib/moneda';

const MAX_RAG_RESULTS = 8;

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const body = await req.json();
    const { consulta, limit = MAX_RAG_RESULTS } = body;
    const tenantId = auth.tenant!.id;

    if (!consulta || typeof consulta !== 'string') {
      return NextResponse.json(
        { error: 'consulta es requerida' },
        { status: 400 }
      );
    }

    // 1. Extraer filtros de la consulta en lenguaje natural usando IA
    const filterPrompt = `Analiza la siguiente consulta inmobiliaria y extrae los filtros en JSON.
Responde SOLO con JSON, sin explicaciones.

CONSULTA: "${consulta}"

Formato JSON esperado:
{
  "tipoOperacion": "venta" | "alquiler" | null,
  "tipoInmueble": string | null,
  "ciudad": string | null,
  "zona": string | null,
  "precioMin": number | null,
  "precioMax": number | null,
  "habitacionesMin": number | null,
  "banosMin": number | null,
  "superficieMin": number | null,
  "palabrasClave": string[],
  "intencion": "consulta" | "busqueda" | "comparacion" | "recomendacion"
}`;

    let filters: any = {};
    try {
      const aiResult = await AIEngine.chat(
        { prompt: filterPrompt, model: 'gemma', temperature: 0.1, max_tokens: 500 },
        tenantId
      );
      const raw = aiResult.content.replace(/```json|```/g, '').trim();
      filters = JSON.parse(raw);
    } catch {
      // Fallback a parseo simple si IA falla
      filters = extractSimpleFilters(consulta);
    }

    // 2. Construir query SQL con los filtros extraídos
    const conditions: string[] = [
      `ci."tenantId" = $1`,
      `ci.tipo = 'inmueble'`,
      `ci.activo = true`,
    ];
    const params: any[] = [tenantId];
    let paramIdx = 2;

    if (filters.tipoOperacion) {
      params.push(filters.tipoOperacion);
      conditions.push(`ci."customFieldValues"->>'tipo_operacion' = $${paramIdx++}`);
    }
    if (filters.tipoInmueble) {
      params.push(filters.tipoInmueble);
      conditions.push(`ci."customFieldValues"->>'tipo_inmueble' = $${paramIdx++}`);
    }
    if (filters.ciudad) {
      params.push(`%${filters.ciudad}%`);
      conditions.push(
        `(LOWER(ci."customFieldValues"->>'zona') LIKE LOWER($${paramIdx}) OR LOWER(ci."customFieldValues"->>'ciudad') LIKE LOWER($${paramIdx}))`
      );
      paramIdx++;
    }
    if (filters.precioMin !== null && filters.precioMin !== undefined) {
      conditions.push(`ci."precioBase" >= ${Number(filters.precioMin)}`);
    }
    if (filters.precioMax !== null && filters.precioMax !== undefined) {
      conditions.push(`ci."precioBase" <= ${Number(filters.precioMax)}`);
    }
    if (filters.habitacionesMin !== null && filters.habitacionesMin !== undefined) {
      conditions.push(`(ci."customFieldValues"->>'habitaciones')::int >= ${Number(filters.habitacionesMin)}`);
    }
    if (filters.banosMin !== null && filters.banosMin !== undefined) {
      conditions.push(`(ci."customFieldValues"->>'banos')::int >= ${Number(filters.banosMin)}`);
    }
    if (filters.superficieMin !== null && filters.superficieMin !== undefined) {
      conditions.push(`(ci."customFieldValues"->>'superficie_total')::numeric >= ${Number(filters.superficieMin)}`);
    }

    // Búsqueda por texto en descripción si hay palabras clave
    const palabrasClave: string[] = filters.palabrasClave || [];
    if (palabrasClave.length > 0) {
      const keywordConditions = palabrasClave.map((kw: string) => {
        params.push(`%${kw}%`);
        return `(LOWER(ci."descripcion") LIKE LOWER($${paramIdx}) OR LOWER(ci."titulo") LIKE LOWER($${paramIdx}))`;
      });
      conditions.push(`(${keywordConditions.join(' OR ')})`);
      paramIdx++;
    }

    // Score de relevancia
    const scoreExpr = `
      (CASE WHEN ci."customFieldValues"->>'tipo_operacion' IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN ci."customFieldValues"->>'tipo_inmueble' IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN ci."customFieldValues"->>'superficie_total' IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN ci."media" IS NOT NULL AND jsonb_array_length(ci."media") > 0 THEN 15 ELSE 0 END) +
      (CASE WHEN ci."descripcion" IS NOT NULL AND LENGTH(ci."descripcion") > 50 THEN 15 ELSE 0 END) +
      (CASE WHEN ci."precioBase" > 0 THEN 10 ELSE 0 END)
    `;

    const sql = `
      SELECT ci.*, ${scoreExpr} as relevance_score
      FROM "CatalogoItem" ci
      WHERE ${conditions.join(' AND ')}
      ORDER BY relevance_score DESC, ci."fechaCreacion" DESC
      LIMIT $${paramIdx}
    `;

    const properties = await prisma.$queryRawUnsafe(sql, ...params, limit);
    const rows = properties as any[];

    // 3. Preparar contexto para la respuesta IA
    const contextData = rows.map((p, i) => {
      const parsed = parseInmueble(p);
      return `[${i + 1}] ${parsed.propertyType || 'Inmueble'} - ${parsed.operationType || ''}
  Precio: ${parsed.precioBase ? formatearImporte(parsed.precioBase, parsed.moneda) : '?'}
  Ubicación: ${parsed.city || 'No especificada'}
  Características: ${parsed.bedrooms ? parsed.bedrooms + ' habs' : ''} ${parsed.bathrooms ? '/ ' + parsed.bathrooms + ' baños' : ''} ${parsed.areaM2 ? '/ ' + parsed.areaM2 + ' m²' : ''}
  ${parsed.hasPool ? '✔️ Piscina' : ''} ${parsed.hasParking ? '✔️ Parking' : ''} ${parsed.hasElevator ? '✔️ Ascensor' : ''} ${parsed.hasGarden ? '✔️ Jardín' : ''}
  ${p.descripcion ? 'Descripción: ' + p.descripcion.substring(0, 200) : ''}`;
    }).join('\n\n');

    // 4. Generar respuesta con IA usando los datos recuperados (RAG)
    const respuestaPrompt = `Eres un asesor inmobiliario experto de Volkern. Responde a la consulta del usuario basándote SOLO en los datos de propiedades disponibles.

CONSULTA DEL USUARIO: "${consulta}"

PROPIEDADES DISPONIBLES (${rows.length} resultados):
${contextData || 'No se encontraron propiedades que coincidan con los criterios.'}

${rows.length > 0
  ? `Instrucciones:
- Responde de forma natural y profesional.
- Menciona las propiedades más relevantes para la consulta.
- Destaca el precio, ubicación y características clave de cada una.
- Si hay muchas propiedades, resume las mejores opciones.
- Incluye datos específicos (precios, m², habitaciones).
- Sé breve y directo (máximo 3 párrafos).`
  : `Instrucciones:
- Informa amablemente que no hay propiedades disponibles con esos criterios.
- Sugiere ajustar los filtros (p.ej., ampliar rango de precio, cambiar zona).
- Pregunta al usuario si quiere probar con otros criterios.`}`;

    let respuesta = '';
    try {
      const aiResp = await AIEngine.chat(
        { prompt: respuestaPrompt, model: 'gemma', temperature: 0.3, max_tokens: 1024 },
        tenantId
      );
      respuesta = aiResp.content;
    } catch {
      respuesta = rows.length > 0
        ? `Encontré ${rows.length} propiedades que coinciden con tu búsqueda. ¿Te gustaría que te dé más detalles de alguna en particular?`
        : 'No encontré propiedades con esos criterios. ¿Quieres intentar con otros filtros?';
    }

    // 5. Devolver respuesta estructurada
    const propiedades = rows.map((p) => {
      const parsed = parseInmueble(p);
      return {
        id: p.id,
        titulo: p.titulo || p.nombre || `${parsed.propertyType || 'Inmueble'}`,
        precio: parsed.precioBase,
        precioFormateado: parsed.precioBase ? formatearImporte(parsed.precioBase, parsed.moneda) : 'Consultar',
        ubicacion: parsed.city || '',
        tipoOperacion: parsed.operationType,
        tipoInmueble: parsed.propertyType,
        habitaciones: parsed.bedrooms,
        banos: parsed.bathrooms,
        superficie: parsed.areaM2,
        caracteristicas: {
          piscina: parsed.hasPool,
          parking: parsed.hasParking,
          ascensor: parsed.hasElevator,
          jardin: parsed.hasGarden,
        },
        media: Array.isArray(p.media) ? p.media.map((m: any) => typeof m === 'string' ? m : m.url || '') : [],
        descripcion: p.descripcion || '',
        score: parseInt(p.relevance_score) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      respuesta,
      filtrosDetectados: filters,
      propiedades,
      total: propiedades.length,
    });
  } catch (error: any) {
    console.error('[RAG Consult] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar la consulta', message: error.message },
      { status: 500 }
    );
  }
});

/**
 * Fallback simple de extracción de filtros cuando la IA falla
 */
function extractSimpleFilters(consulta: string): any {
  const terms = consulta.toLowerCase();
  const filters: any = {
    tipoOperacion: null,
    tipoInmueble: null,
    ciudad: null,
    zona: null,
    precioMin: null,
    precioMax: null,
    habitacionesMin: null,
    banosMin: null,
    superficieMin: null,
    palabrasClave: [],
    intencion: 'busqueda',
  };

  // Detectar operación
  if (/venta|comprar/i.test(terms)) filters.tipoOperacion = 'venta';
  else if (/alquiler|rentar|arrendar/i.test(terms)) filters.tipoOperacion = 'alquiler';

  // Detectar tipo inmueble
  if (/casa|chalet|villa|adosado/i.test(terms)) filters.tipoInmueble = 'Casa';
  else if (/piso|apartamento|departamento/i.test(terms)) filters.tipoInmueble = 'Departamento';
  else if (/oficina|local/i.test(terms)) filters.tipoInmueble = 'Oficina';
  else if (/terreno|solar/i.test(terms)) filters.tipoInmueble = 'Terreno';

  // Detectar ciudad
  const cityMatch = terms.match(/en\s+(\w[\w\s]+?)(?:\s+(?:con|de|para|que|y|$))/i) ||
                   terms.match(/en\s+(\w+)/i);
  if (cityMatch) {
    const raw = cityMatch[1].trim();
    filters.ciudad = raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // Detectar precios
  const priceUnder = terms.match(/(?:menos\s+de|hasta|máximo|max)\s*(\d[\d.]*)\s*(k|mil)?/i);
  if (priceUnder) {
    const val = parseFloat(priceUnder[1]);
    filters.precioMax = /k|mil/i.test(priceUnder[2] || '') ? val * 1000 : val;
  }

  const priceOver = terms.match(/(?:más\s+de|desde|mínimo|min)\s*(\d[\d.]*)\s*(k|mil)?/i);
  if (priceOver) {
    const val = parseFloat(priceOver[1]);
    filters.precioMin = /k|mil/i.test(priceOver[2] || '') ? val * 1000 : val;
  }

  const priceRange = terms.match(/entre\s*(\d[\d.]*)\s*(k|mil)?\s*(?:y|e)\s*(\d[\d.]*)\s*(k|mil)?/i);
  if (priceRange) {
    const v1 = parseFloat(priceRange[1]);
    const v2 = parseFloat(priceRange[3]);
    filters.precioMin = /k|mil/i.test(priceRange[2] || '') ? v1 * 1000 : v1;
    filters.precioMax = /k|mil/i.test(priceRange[4] || '') ? v2 * 1000 : v2;
  }

  // Detectar habitaciones
  const bedMatch = terms.match(/(\d+)\s*(?:habs?|dormitorios?)/i);
  if (bedMatch) filters.habitacionesMin = parseInt(bedMatch[1]);

  // Detectar intención
  if (/recomienda|sugiere|mejor|recommend/i.test(terms)) filters.intencion = 'recomendacion';
  else if (/compara|diferencia|vs|versus/i.test(terms)) filters.intencion = 'comparacion';
  else if (/información|detalles|cuéntame/i.test(terms)) filters.intencion = 'consulta';
  else filters.intencion = 'busqueda';

  return filters;
}
