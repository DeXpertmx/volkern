/**
 * Real Estate Skills
 * 
 * Skills especializados del módulo inmobiliario.
 * Usan AIEngine.chat() para generar contenido y análisis.
 */

import { prisma } from "@/lib/db";
import { parseInmueble, getPropertyWithFields, updatePropertyCustomFields } from "@/lib/real-estate/property-helpers";
import { calculateCommission, createCommissionFromDeal } from "@/lib/real-estate/commission-calculator";
import { AIEngine } from "@/lib/event-engine/ai-engine/ai-engine";

// ─── 1. Generar descripción comercial ──────────────────────────────────────

export async function generate_property_description(input: {
  propertyId: string;
  tenantId: string;
}): Promise<{ description: string }> {
  const { propertyId, tenantId } = input;
  const property = await getPropertyWithFields(propertyId, tenantId);
  const parsed = parseInmueble(property);

  const prompt = `Eres un redactor inmobiliario profesional. Genera una descripción atractiva para esta propiedad:

Tipo: ${parsed.propertyType || "No especificado"}
Operación: ${parsed.operationType || "No especificada"}
Precio: ${parsed.precioBase?.toLocaleString() || "?"} €
Ubicación: ${parsed.city || "No especificada"}
Superficie: ${parsed.areaM2 || "?"} m² construidos${parsed.builtM2 ? ` (${parsed.builtM2} m² útiles)` : ""}
Habitaciones: ${parsed.bedrooms || "?"}
Baños: ${parsed.bathrooms || "?"}
${parsed.hasParking ? "✔️ Incluye parking" : ""}
${parsed.hasPool ? "✔️ Piscina" : ""}
${parsed.hasElevator ? "✔️ Ascensor" : ""}
${parsed.hasGarden ? "✔️ Jardín" : ""}

Genera una descripción profesional, cálida y persuasiva. Destaca los puntos fuertes. Máximo 200 palabras.`;

  const result = await AIEngine.chat(
    { prompt, model: "gemini", temperature: 0.3, max_tokens: 2048 },
    tenantId
  );
  const description = result.content;

  // Guardar en customFieldValues
  await updatePropertyCustomFields(propertyId, {
    descripcion_larga: description,
  });

  return { description };
}

// ─── 2. Sugerir precio basado en mercado ────────────────────────────────────

export async function suggest_price_based_on_market(input: {
  propertyId: string;
  tenantId: string;
}): Promise<{
  suggestedPrice: number | null;
  confidence: "high" | "medium" | "low";
  sampleSize: number;
  message: string;
}> {
  const { propertyId, tenantId } = input;
  const property = await getPropertyWithFields(propertyId, tenantId);
  const parsed = parseInmueble(property);

  // Buscar propiedades similares vendidas en la misma zona
  const similar = await prisma.$queryRawUnsafe(
    `
    SELECT "precioBase", "customFieldValues"->>'superficie_total' as area,
           "customFieldValues"->>'tipo_operacion' as operation
    FROM "CatalogoItem"
    WHERE "tenantId" = $1
      AND tipo = 'inmueble'
      AND "customFieldValues"->>'zona' = $2
      AND "customFieldValues"->>'tipo_inmueble' = $3
      AND ("customFieldValues"->>'estado' = 'vendida' OR "customFieldValues"->>'estado' = 'alquilada')
      AND id != $4
    LIMIT 20
    `,
    tenantId,
    parsed.city || "",
    parsed.propertyType || "",
    propertyId
  );

  const similarArr = similar as any[];

  if (similarArr.length === 0) {
    return {
      suggestedPrice: null,
      confidence: "low",
      sampleSize: 0,
      message: "No hay suficientes datos de mercado. Agrega más propiedades vendidas en la misma zona.",
    };
  }

  const avgPricePerM2 =
    similarArr.reduce((sum, p) => {
      const area = parseFloat(p.area) || 1;
      return sum + p.precioBase / area;
    }, 0) / similarArr.length;

  const suggestedPrice = Math.round(avgPricePerM2 * (parsed.areaM2 || 1));
  const confidence =
    similarArr.length > 10 ? "high" : similarArr.length > 5 ? "medium" : "low";

  return {
    suggestedPrice,
    confidence,
    sampleSize: similarArr.length,
    message: `Basado en ${similarArr.length} propiedades similares en ${parsed.city}. Precio sugerido: ${suggestedPrice.toLocaleString()} €`,
  };
}

// ─── 3. Calcular score de calidad de propiedad ──────────────────────────────

export async function calculate_property_quality_score(input: {
  propertyId: string;
  tenantId: string;
}): Promise<{
  score: number;
  grade: "A" | "B" | "C" | "D";
  details: Record<string, number>;
}> {
  const { propertyId, tenantId } = input;
  const property = await getPropertyWithFields(propertyId, tenantId);
  const parsed = parseInmueble(property);

  let score = 0;
  const details: Record<string, number> = {};

  // 1. Campos obligatorios completados (30 pts)
  const requiredFields = [
    "tipo_operacion",
    "tipo_inmueble",
    "superficie_total",
    "habitaciones",
    "precioBase",
  ];
  const completedRequired = requiredFields.filter(
    (f) =>
      f === "precioBase"
        ? property.precioBase > 0
        : property.customFieldValues?.[f]
  ).length;
  const reqScore = Math.round((completedRequired / requiredFields.length) * 30);
  score += reqScore;
  details["Campos obligatorios"] = reqScore;

  // 2. Descripción (30 pts)
  let descScore = 0;
  if (property.descripcion) {
    if (property.descripcion.length > 200) descScore = 30;
    else if (property.descripcion.length > 100) descScore = 20;
    else if (property.descripcion.length > 50) descScore = 10;
    else descScore = 5;
  }
  if ((property.customFieldValues as any)?.descripcion_larga) {
    descScore = Math.max(descScore, 30);
  }
  score += descScore;
  details["Descripción"] = descScore;

  // 3. Imágenes / Media (30 pts)
  const mediaCount = Array.isArray(property.media) ? property.media.length : 0;
  let imgScore = 0;
  if (mediaCount >= 10) imgScore = 30;
  else if (mediaCount >= 5) imgScore = 20;
  else if (mediaCount >= 3) imgScore = 15;
  else if (mediaCount >= 1) imgScore = 8;
  score += imgScore;
  details["Imágenes"] = imgScore;

  // 4. Ubicación precisa (10 pts)
  let locScore = 0;
  if (parsed.lat && parsed.lng) locScore = 10;
  else if (parsed.city) locScore = 5;
  score += locScore;
  details["Ubicación"] = locScore;

  // Bonus: precio
  if (property.precioBase > 0) {
    details["Precio configurado"] = 0; // ya se cuenta en required
  }

  // Bonus: certificación energética
  if ((property.customFieldValues as any)?.certificacion_energetica) {
    score += 5;
    details["Certificación energética"] = 5;
  }

  const cappedScore = Math.min(score, 100);
  const grade =
    cappedScore >= 80 ? "A" : cappedScore >= 60 ? "B" : cappedScore >= 40 ? "C" : "D";

  return { score: cappedScore, grade, details };
}

// ─── 5. Recomendar propiedades basado en preferencias ───────────────────

export async function recommend_properties(input: {
  tenantId: string;
  tipoOperacion?: 'venta' | 'alquiler';
  tipoInmueble?: string;
  ciudad?: string;
  precioMin?: number;
  precioMax?: number;
  habitaciones?: number;
  banos?: number;
  amenities?: string[];
  limit?: number;
}): Promise<{
  recommendations: Array<{
    id: string;
    titulo: string;
    precioFormateado: string;
    ubicacion: string;
    tipoOperacion: string;
    tipoInmueble: string;
    habitaciones: number | null;
    banos: number | null;
    superficie: number | null;
    media: string[];
    score: number;
    razon: string;
  }>;
  total: number;
  mensaje: string;
}> {
  const {
    tenantId,
    tipoOperacion,
    tipoInmueble,
    ciudad,
    precioMin,
    precioMax,
    habitaciones,
    banos,
    amenities = [],
    limit = 6,
  } = input;

  // Construir query con filtros JSONB
  const conditions: string[] = [
    `ci."tenantId" = $1`,
    `ci.tipo = 'inmueble'`,
    `ci.activo = true`,
    `(ci."customFieldValues"->>'estado' = 'disponible' OR ci."customFieldValues"->>'estado' IS NULL)`,
  ];
  const params: any[] = [tenantId];
  let paramIdx = 2;

  if (tipoOperacion) {
    params.push(tipoOperacion);
    conditions.push(`ci."customFieldValues"->>'tipo_operacion' = $${paramIdx++}`);
  }
  if (tipoInmueble) {
    params.push(tipoInmueble);
    conditions.push(`ci."customFieldValues"->>'tipo_inmueble' = $${paramIdx++}`);
  }
  if (ciudad) {
    params.push(ciudad);
    conditions.push(`(LOWER(ci."customFieldValues"->>'zona') LIKE LOWER($${paramIdx}) OR LOWER(ci."customFieldValues"->>'ciudad') LIKE LOWER($${paramIdx}))`);
    paramIdx++;
  }
  if (precioMin !== undefined) {
    conditions.push(`ci."precioBase" >= ${precioMin}`);
  }
  if (precioMax !== undefined) {
    conditions.push(`ci."precioBase" <= ${precioMax}`);
  }
  if (habitaciones !== undefined) {
    conditions.push(`(ci."customFieldValues"->>'habitaciones')::int >= ${habitaciones}`);
  }
  if (banos !== undefined) {
    conditions.push(`(ci."customFieldValues"->>'banos')::int >= ${banos}`);
  }

  // Score de calidad: propiedades con más campos completos primero
  const scoreExpr = `
    (CASE WHEN ci."customFieldValues"->>'tipo_operacion' IS NOT NULL THEN 10 ELSE 0 END) +
    (CASE WHEN ci."customFieldValues"->>'tipo_inmueble' IS NOT NULL THEN 10 ELSE 0 END) +
    (CASE WHEN ci."customFieldValues"->>'superficie_total' IS NOT NULL THEN 10 ELSE 0 END) +
    (CASE WHEN ci."customFieldValues"->>'habitaciones' IS NOT NULL THEN 5 ELSE 0 END) +
    (CASE WHEN ci."customFieldValues"->>'banos' IS NOT NULL THEN 5 ELSE 0 END) +
    (CASE WHEN ci."descripcion" IS NOT NULL AND LENGTH(ci."descripcion") > 50 THEN 15 ELSE 0 END) +
    (CASE WHEN ci."media" IS NOT NULL AND jsonb_array_length(ci."media") > 0 THEN 15 ELSE 0 END) +
    (CASE WHEN ci."customFieldValues"->>'latitud' IS NOT NULL AND ci."customFieldValues"->>'longitud' IS NOT NULL THEN 10 ELSE 0 END) +
    (CASE WHEN ci."precioBase" > 0 THEN 10 ELSE 0 END)
  `;

  const sql = `
    SELECT ci.*, ${scoreExpr} as quality_score
    FROM "CatalogoItem" ci
    WHERE ${conditions.join(' AND ')}
    ORDER BY quality_score DESC, ci."fechaCreacion" DESC
    LIMIT $${paramIdx}
  `;

  const properties = await prisma.$queryRawUnsafe(sql, ...params, limit);
  const rows = properties as any[];

  // Generar razones de recomendación con IA (batch: una sola llamada para todas)
  const topProps = rows.slice(0, 6);

  let razones: string[] = [];
  try {
    const batchPrompt = topProps.map((p, i) => {
      const parsed = parseInmueble(p);
      return `[${i + 1}] ${parsed.propertyType || 'Inmueble'} - ${parsed.operationType === 'venta' ? 'Venta' : 'Alquiler'} ${parsed.precioBase?.toLocaleString() || '?'} € - ${[parsed.city, parsed.areaM2 ? `${parsed.areaM2} m²` : ''].filter(Boolean).join(', ') || 'N/A'} - ${parsed.bedrooms || '?'} habs`;
    }).join('\n');

    const aiResult = await AIEngine.chat(
      {
        prompt: `Eres un asesor inmobiliario. Para cada propiedad, genera UNA razón corta (máx 12 palabras) de por qué recomendarla.
Responde SOLO con una línea por propiedad, numerada, sin prefijos.

PROPIEDADES:\n${batchPrompt}\n
Formato:
1. Razón para propiedad 1
2. Razón para propiedad 2
...`,
        model: 'gemma',
        temperature: 0.2,
        max_tokens: 500,
      },
      tenantId
    );
    razones = aiResult.content.trim().split('\n').filter(l => /^\d+\./.test(l));
  } catch {
    // Fallback si IA falla
  }

  const recommendations = topProps.map((p, i) => {
    const parsed = parseInmueble(p);
    const ubicacion = [parsed.city, parsed.address].filter(Boolean).join(', ');
    const razon = razones[i]?.replace(/^\d+\.\s*/, '') || (
      [parsed.bedrooms ? `${parsed.bedrooms} habs` : '',
       parsed.areaM2 ? `${parsed.areaM2} m²` : '',
       ubicacion ? `en ${ubicacion}` : ''].filter(Boolean).length > 0
        ? `Buena opción de ${parsed.operationType || 'inmueble'} ${[parsed.bedrooms ? `${parsed.bedrooms} habs` : '', parsed.areaM2 ? `${parsed.areaM2} m²` : '', ubicacion ? `en ${ubicacion}` : ''].filter(Boolean).join(', ')}`
        : 'Propiedad destacada con buena relación calidad-precio'
    );

    const currency = p.moneda || 'EUR';
    return {
      id: p.id,
      titulo: p.titulo || p.nombre || `${parsed.propertyType || 'Inmueble'} en ${parsed.operationType || 'venta'}`,
      precioFormateado: parsed.precioBase?.toLocaleString('es-ES', { style: 'currency', currency }) || 'Consultar',
      ubicacion,
      tipoOperacion: parsed.operationType || '',
      tipoInmueble: parsed.propertyType || '',
      habitaciones: parsed.bedrooms,
      banos: parsed.bathrooms,
      superficie: parsed.areaM2,
      media: Array.isArray(p.media) ? p.media.map((m: any) => typeof m === 'string' ? m : m.url || '') : [],
      score: parseInt(p.quality_score) || 0,
      razon,
    };
  });

  const mensaje = recommendations.length > 0
    ? `Encontré ${recommendations.length} propiedades que podrían interesarte`
    : 'No encontré propiedades que coincidan con tus criterios. Intenta ajustar los filtros.';

  return { recommendations, total: recommendations.length, mensaje };
}

// ─── 6. Calcular comisiones de franquicia ────────────────────────────────

export async function calculate_franchise_commissions(input: {
  tenantId: string;
  dealId: string;
  userId: string;
  tipoComision?: 'porcentaje_venta' | 'porcentaje_comision' | 'monto_fijo' | 'escalonada';
  porcentaje?: number;
  montoFijo?: number;
  splitAgente?: number;
  splitAgencia?: number;
}): Promise<{
  success: boolean;
  montoCalculado: number;
  desglose: string[];
  error?: string;
}> {
  const {
    tenantId,
    dealId,
    userId,
    tipoComision = 'porcentaje_venta',
    porcentaje = 3,
    montoFijo,
    splitAgente,
    splitAgencia,
  } = input;

  try {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      return { success: false, montoCalculado: 0, desglose: [], error: 'Operación no encontrada' };
    }

    // Verificar acceso: el deal debe pertenecer al tenant o a un sub-tenant
    if (deal.tenantId !== tenantId) {
      const childTenant = await prisma.tenant.findFirst({
        where: { id: deal.tenantId, parentId: tenantId },
      });
      if (!childTenant) {
        return { success: false, montoCalculado: 0, desglose: [], error: 'La operación no pertenece a esta franquicia' };
      }
    }

    const calcResult = calculateCommission({
      dealId: deal.id,
      tenantId: deal.tenantId,
      userId,
      valorOperacion: deal.valorReal || deal.valor,
      moneda: deal.moneda || 'EUR',
      rule: {
        tipo: tipoComision,
        porcentaje,
        montoFijo,
        splitAgente,
        splitAgencia,
      },
    });

    await createCommissionFromDeal(deal, userId, {
      tipo: tipoComision,
      porcentaje,
      montoFijo,
      splitAgente,
      splitAgencia,
    }, deal.moneda || 'EUR');

    return {
      success: true,
      montoCalculado: calcResult.montoCalculado,
      desglose: calcResult.desglose,
    };
  } catch (error: any) {
    console.error('[Commission Skill] Error:', error);
    return {
      success: false,
      montoCalculado: 0,
      desglose: [],
      error: error.message || 'Error al calcular comisión',
    };
  }
}

// ─── 4. Buscar propiedades con filtros (para chatbot) ─────────────────────

export async function search_properties_by_filters(input: {
  tenantId: string;
  query: string;
  limit?: number;
}): Promise<{
  properties: any[];
  total: number;
}> {
  const { tenantId, query, limit = 10 } = input;

  // Convertir query de lenguaje natural a filtros simples
  const terms = query.toLowerCase();

  const conditions: string[] = [
    `"tenantId" = $1`,
    `tipo = 'inmueble'`,
    `activo = true`,
    `("customFieldValues"->>'estado' = 'disponible' OR "customFieldValues"->>'estado' IS NULL)`,
  ];
  const params: any[] = [tenantId];

  // Detectar tipo de operación
  if (/venta|comprar/i.test(terms)) {
    params.push("venta");
    conditions.push(`"customFieldValues"->>'tipo_operacion' = $${params.length}`);
  } else if (/alquiler|rentar|arrendar/i.test(terms)) {
    params.push("alquiler");
    conditions.push(`"customFieldValues"->>'tipo_operacion' = $${params.length}`);
  }

  // Detectar tipo de inmueble
  if (/casa|chalet|villa|adosado/i.test(terms)) {
    params.push("Casa");
    conditions.push(`"customFieldValues"->>'tipo_inmueble' = $${params.length}`);
  } else if (/piso|apartamento|departamento/i.test(terms)) {
    params.push("Departamento");
    conditions.push(`"customFieldValues"->>'tipo_inmueble' = $${params.length}`);
  } else if (/oficina|local/i.test(terms)) {
    params.push("Oficina");
    conditions.push(`"customFieldValues"->>'tipo_inmueble' = $${params.length}`);
  } else if (/terreno|solar/i.test(terms)) {
    params.push("Terreno");
    conditions.push(`"customFieldValues"->>'tipo_inmueble' = $${params.length}`);
  }

  // Detectar ciudad
  const cityMatch = terms.match(/en\s+(\w+)/);
  if (cityMatch) {
    params.push(cityMatch[1]);
    conditions.push(
      `(LOWER("customFieldValues"->>'zona') LIKE LOWER($${params.length}) OR LOWER("customFieldValues"->>'ciudad') LIKE LOWER($${params.length}))`
    );
  }

  // Detectar número de habitaciones
  const bedMatch = terms.match(/(\d+)\s*habs?|(\d+)\s*dormitorios?/i);
  if (bedMatch) {
    const beds = parseInt(bedMatch[1] || bedMatch[2]);
    conditions.push(`("customFieldValues"->>'habitaciones')::int >= ${beds}`);
  }

  // Detectar precio máximo
  const priceMatch = terms.match(/(\d+)\s*k\s*€|(\d+)\s*mil|(\d+)\s*euros/i);
  if (priceMatch) {
    const maxPrice = parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3]) * 1000;
    conditions.push(`"precioBase" <= ${maxPrice}`);
  }

  const query_sql = `
    SELECT *
    FROM "CatalogoItem"
    WHERE ${conditions.join(" AND ")}
    ORDER BY "fechaCreacion" DESC
    LIMIT $${params.length + 1}
  `;

  const properties = await prisma.$queryRawUnsafe(query_sql, ...params, limit);
  const mapped = (properties as any[]).map((p) => ({
    ...parseInmueble(p),
    media: p.media,
  }));

  return { properties: mapped, total: mapped.length };
}
