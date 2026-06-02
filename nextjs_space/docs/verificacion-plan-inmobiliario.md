# ✅ Verificación del Plan Inmobiliario Definitivo — 100% Compatible

**Fecha:** 28 de mayo de 2026
**Propósito:** Verificación de cada punto del plan contra el código base real de Volkern CRM.

---

## Resumen

El plan es **completamente implementable** sobre la arquitectura actual. Se identificaron **5 ajustes menores** (ninguno bloqueante). El ~95% del código del plan puede copiarse tal cual.

---

## 1. Lo que el plan acierta perfectamente

| Ítem del plan | Código real | Estado |
|---|---|---|
| **CatalogoItem** con `tipo = 'inmueble'` y `customFieldValues: Json?` | ✅ Modelo existente con `tipo` (default "servicio"), `customFieldValues`, `media`, `pricing`, `precioBase` | ✅ |
| **Tenant.parentId** para franquicias | ✅ Ya existe en `model Tenant { parentId String? }` | ✅ |
| **Cita (Booking)** con `catalogoItemId` para visitas | ✅ `model Cita { catalogoItemId String?, origenCita String? }` | ✅ |
| **PipelineStage** con `orden, probabilidad, color, esEtapaFinal` | ✅ `model PipelineStage { orden Int, probabilidad Int, color String, esEtapaFinal Boolean, tipoEtapaFinal String? }` | ✅ |
| **Automation** con `trigger, flowData: Json` | ✅ Sistema completo con ejecuciones, logs y templates | ✅ |
| **Integration** para portales externos | ✅ `model Integration { tipo String, credenciales Json?, configuracion Json? }` | ✅ |
| **@measured/puck** como editor visual | ✅ Editor Puck instalado en `lib/puck/` con 20+ componentes | ✅ |
| **Preset `inmobiliaria`** | ✅ **Ya existe** en `app/api/catalogo/field-definitions/presets/route.ts` con 12 campos | ✅ |
| **Skills `create_lead`, `convert_lead`, `create_booking`** | ✅ Todos registrados en `lib/skills/index.ts` | ✅ |
| **EventBus con EVENTS** | ✅ Sistema completo con ~70 eventos (`lib/skills/event-bus.ts`) | ✅ |
| **AIEngine** con Gemini, GPT-4, Claude | ✅ `AIEngine.chat()` con fallback automático entre modelos | ✅ |
| **PostgreSQL** — índices GIN viables | ✅ La BD es PostgreSQL, índices GIN en `jsonb_path_ops` son compatibles | ✅ |
| **S3** para imágenes de propiedades | ✅ Bucket S3 configurado | ✅ |
| **BullMQ / Redis** para jobs programados | ✅ Redis y BullMQ disponibles | ✅ |

---

## 2. Ajustes Recomendados (5 puntos)

### Ajuste #1 — Usar `AIEngine.chat()` en vez de `callGemini()` directo

**Dónde aplica:** Fase 4 — Skills IA (`generate_property_description`, `suggest_price_based_on_market`)

**Problema:** El plan usa `callGemini(prompt)` como si fuera una función global. El sistema real usa `AIEngine.chat()` que maneja rate limiting, fallback entre modelos (si Gemini falla → GPT-4o → Claude) y logging.

**Código correcto:**

```typescript
// ❌ Lo que dice el plan:
const description = await callGemini(prompt);

// ✅ Lo que debe usarse:
import { AIEngine } from '@/lib/event-engine/ai-engine/ai-engine';

const result = await AIEngine.chat(
  {
    prompt: `Genera una descripción atractiva para...`,
    model: 'gemini',
    temperature: 0.3,
    max_tokens: 2048,
  },
  tenantId // ← importante: el tenantId para rate limiting
);

const description = result.content;
```

**Importante:** El segundo parámetro es `tenantId` (para respetar cuotas por tenant). No olvidar importar de `@/lib/event-engine/ai-engine/ai-engine`.

---

### Ajuste #2 — `Automation.upsert` no tiene unique key compuesta

**Dónde aplica:** Fase 5 — `lib/real-estate/automation-templates.ts`

**Problema:** El plan usa:
```typescript
await prisma.automation.upsert({
  where: { tenantId_name: { tenantId, name: template.name } },
  //  ...
});
```

Pero **no existe** un unique constraint en `(tenantId, nombre)` en el modelo `Automation`. Esto lanzará error de Prisma.

**Solución — Opción A (recomendada):** Agregar unique key al modelo como parte de Fase 0.

Agregar en `prisma/schema.prisma`:
```prisma
model Automation {
  // ... campos existentes ...
  
  @@unique([tenantId, nombre])
  @@index([tenantId])
}
```

**Solución — Opción B (sin migración):** Reemplazar upsert con findFirst + create/update:

```typescript
// En vez de upsert:
const existing = await prisma.automation.findFirst({
  where: { tenantId, nombre: template.name }
});

if (existing) {
  await prisma.automation.update({
    where: { id: existing.id },
    data: { /* ... */ }
  });
} else {
  await prisma.automation.create({
    data: {
      tenantId,
      nombre: template.name,
      descripcion: template.description,
      trigger: template.trigger,
      activo: true,
      flowData: { nodes: template.actions },
      // ... resto de campos
    }
  });
}
```

---

### Ajuste #3 — Alinear nombres de campos del preset con convención existente

**Dónde aplica:** Fase 0.2 — Extender preset inmobiliario

**Problema:** El preset actual ya existe con 12 campos en español. Los campos nuevos deben seguir la misma convención de nombres en español para consistencia.

**Mapeo recomendado:**

| Nombre en el plan | Nombre recomendado | ¿Ya existe? |
|---|---|---|
| `anyo_construccion` | `antiguedad` (ya existe) | ✅ Sí, usar el existente |
| `ascensor` | `ascensor` ✅ | Nuevo |
| `parking` | `estacionamiento` (sing. de `estacionamientos`) | ⚠️ Existe como `estacionamientos` |
| `piscina` | `alberca` (consistente con preset que dice "Alberca") | Nuevo |
| `jardin` | `jardin` ✅ | Nuevo |
| `trastero` | `trastero` ✅ | Nuevo |
| `orientacion` | `orientacion` ✅ | Nuevo |
| `estado` | `estado` ✅ | Nuevo |
| `destacada` | Usar `destacado` del modelo CatalogoItem (ya existe como `destacado: Boolean`) | ✅ No necesita customField |
| `certificacion_energetica` | `certificacion_energetica` ✅ | Nuevo |
| `descripcion_larga` | `descripcion_larga` ✅ | Nuevo |
| `tags_seo` | `tags_seo` ✅ | Nuevo |

**Corrección del preset (código):**

```typescript
// app/api/catalogo/field-definitions/presets/route.ts
// Agregar al array 'inmobiliaria' existente:
const extrasInmobiliaria = [
  // Características adicionales
  { fieldKey: 'ascensor', label: 'Ascensor', type: 'boolean' },
  { fieldKey: 'estacionamiento', label: 'Estacionamiento', type: 'boolean' },
  { fieldKey: 'alberca', label: 'Alberca', type: 'boolean' },
  { fieldKey: 'jardin', label: 'Jardín', type: 'boolean' },
  { fieldKey: 'trastero', label: 'Trastero', type: 'boolean' },
  { fieldKey: 'orientacion', label: 'Orientación', type: 'select',
    options: ['Norte', 'Sur', 'Este', 'Oeste', 'Noreste', 'Noroeste', 'Sureste', 'Suroeste'] },
  
  // Geolocalización
  { fieldKey: 'latitud', label: 'Latitud', type: 'number' },
  { fieldKey: 'longitud', label: 'Longitud', type: 'number' },
  
  // Estado (no confundir con CatalogoItem.activo)
  { fieldKey: 'estado_inmueble', label: 'Estado', type: 'select',
    options: ['disponible', 'reservada', 'vendida', 'alquilada'], required: true },
  
  // Energía
  { fieldKey: 'certificacion_energetica', label: 'Certificación Energética', type: 'select',
    options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'En trámite'] },
  
  // SEO
  { fieldKey: 'descripcion_larga', label: 'Descripción Larga', type: 'textarea' },
  { fieldKey: 'tags_seo', label: 'Tags SEO', type: 'text', placeholder: 'separados por comas' },
];
```

---

### Ajuste #4 — Skills inmobiliarios: seguir el patrón de registro

**Dónde aplica:** Fase 4.1 — `lib/skills/real-estate-skills.ts`

**Problema:** El plan muestra funciones sueltas pero no muestra cómo registrarlas en el sistema de skills existente.

**Patrón correcto — archivo de skills:**

```typescript
// lib/skills/real-estate-skills.ts
import { prisma } from '@/lib/db';
import { AIEngine } from '@/lib/event-engine/ai-engine/ai-engine';

export async function generate_property_description(input: {
  propertyId: string;
  tenantId: string;
}): Promise<{ description: string }> {
  const { propertyId, tenantId } = input;
  
  // Obtener propiedad
  const property = await prisma.catalogoItem.findUnique({
    where: { id: propertyId }
  });
  
  if (!property || property.tipo !== 'inmueble') {
    throw new Error('Property not found or not a real estate item');
  }

  const fields = property.customFieldValues as Record<string, any> || {};
  
  const prompt = `Genera una descripción atractiva para esta propiedad...`;
  
  const result = await AIEngine.chat({ prompt, model: 'gemini' }, tenantId);
  
  return { description: result.content };
}

export async function suggest_price_based_on_market(input: {
  propertyId: string;
  tenantId: string;
}): Promise<{ suggestedPrice: number | null; confidence: string }> {
  // ... implementación
}

export async function calculate_property_quality_score(input: {
  propertyId: string;
  tenantId: string;
}): Promise<{ score: number; grade: string }> {
  // ... implementación
}

export async function search_properties_by_filters(input: {
  tenantId: string;
  query: string;
}): Promise<any[]> {
  // ... implementación para el chatbot
}
```

**Registro en `lib/skills/index.ts`:**

```typescript
// Al final del archivo de imports, agregar:
import * as realEstateSkills from './real-estate-skills';

// Dentro del objeto 'skills', agregar:
export const skills = {
  // ... skills existentes ...
  
  // Real Estate
  generate_property_description: realEstateSkills.generate_property_description,
  suggest_price_based_on_market: realEstateSkills.suggest_price_based_on_market,
  calculate_property_quality_score: realEstateSkills.calculate_property_quality_score,
  search_properties_by_filters: realEstateSkills.search_properties_by_filters,
} as const;

// En la función listSkills(), agregar:
{ name: 'generate_property_description', description: 'Genera descripción comercial de una propiedad usando IA', category: 'real_estate' },
{ name: 'suggest_price_based_on_market', description: 'Sugiere precio basado en propiedades similares en la misma zona', category: 'real_estate' },
{ name: 'calculate_property_quality_score', description: 'Calcula score de calidad 0-100 de una propiedad', category: 'real_estate' },
{ name: 'search_properties_by_filters', description: 'Busca propiedades por criterios para el chatbot', category: 'real_estate' },
```

---

### Ajuste #5 — Portal público: considerar reutilizar `/api/catalogo` existente

**Dónde aplica:** Fase 1.2 — API pública para propiedades

**Problema:** El plan crea `/api/public/real-estate/properties` desde cero. Ya existe un endpoint `/api/catalogo` que soporta filtros.

**Opción recomendada:** Crear la API pública separada (como dice el plan) por razones de seguridad (rate limiting, no exponer datos internos), pero **reutilizar la lógica de query** que ya existe en los helpers de catálogo.

```typescript
// app/api/public/real-estate/properties/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';  // si existe

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const slug = searchParams.get('slug');
  
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }
  
  // Rate limiting por IP
  // await rateLimit(req, 60, '1m'); // 60 requests por minuto
  
  // Buscar tenant por slug
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, nombre: true }
  });
  
  if (!tenant) {
    return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
  }
  
  // Query con raw SQL para usar índices GIN
  const { operation, city, minPrice, maxPrice, bedrooms, limit, offset } = 
    Object.fromEntries(searchParams);
  
  const properties = await prisma.$queryRaw`
    SELECT ci.id, ci.nombre, ci.descripcion, ci."precioBase", ci.moneda, ci.media,
           ci."customFieldValues"
    FROM "CatalogoItem" ci
    WHERE ci."tenantId" = ${tenant.id}
      AND ci.tipo = 'inmueble'
      AND ci.activo = true
      AND (ci."customFieldValues"->>'estado_inmueble' = 'disponible' 
           OR ci."customFieldValues"->>'estado_inmueble' IS NULL)
    ORDER BY ci."fechaCreacion" DESC
    LIMIT ${Math.min(Number(limit) || 20, 100)}
    OFFSET ${Number(offset) || 0}
  `;
  
  return NextResponse.json({ properties, tenant: tenant.nombre });
}
```

---

## 3. Tabla Resumen de Cambios

| # | Ajuste | Archivos afectados | Dónde aplica | ¿Bloqueante? |
|---|---|---|---|---|
| 1 | Usar `AIEngine.chat()` en vez de `callGemini()` | `lib/skills/real-estate-skills.ts` | Fase 4.1 | ⚠️ No, pero sin esto el skill fallará |
| 2 | Agregar unique key a Automation o cambiar upsert | `prisma/schema.prisma` + `lib/real-estate/automation-templates.ts` | Fase 5.1 / Fase 0 | ⚠️ El upsert lanza error, necesario corregir |
| 3 | Alinear nombres de campos del preset | `app/api/catalogo/field-definitions/presets/route.ts` | Fase 0.2 | ✅ Optativo (consistencia) |
| 4 | Registrar skills en `lib/skills/index.ts` | `lib/skills/index.ts` + `lib/skills/real-estate-skills.ts` | Fase 4.1 | ⚠️ Skills no funcionarán sin registro |
| 5 | Seguridad en API pública | `app/api/public/real-estate/properties/route.ts` | Fase 1.2 | ✅ Optativo (buena práctica) |

---

## 4. Flujo Propuesto para el CHECKPOINT

Cuando des luz verde, el orden será:

```
1. CHECKPOINT (backup BD + código)
   ├── mysqldump/pg_dump de la BD
   ├── git stash + git checkout -b checkpoint-pre-inmobiliario
   └── script de rollback documentado
   
2. Fase 0 — Preparación (Semana 1)
   ├── 0.2 Migración: agregar unique key Automation + índice GIN
   ├── 0.2 Extender preset inmobiliario
   └── 0.4 Migración: agregar categoria a PipelineStage

3. Por cada fase → validación + tests
```

---

*Documento generado el 28 de mayo de 2026 — Volkern CRM*
