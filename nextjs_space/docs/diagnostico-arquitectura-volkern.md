# 📋 Diagnóstico Técnico — Arquitectura Actual de Volkern

> **Propósito:** Responder las 7 preguntas clave sobre la arquitectura actual del sistema para preparar el diseño de nuevas funcionalidades (correo por usuario, bienes raíces, etc.).
>
> **Fecha:** Mayo 2026
> **Stack:** Next.js 14 + Prisma ORM + PostgreSQL + React + TypeScript

---

## 1. Estructura Actual de Tenant y Onboarding

### 1.1 Modelos Principales

| Modelo | Rol | Campo clave de tenencia |
|---|---|---|
| **Tenant** | Organización/Cliente principal | `slug` (único), `subdomain` (único), `plan` |
| **User** | Usuario del sistema | `tenantId` → Tenant (nullable, un usuario puede ser global) |
| **Role** | Roles por tenant | `tenantId` → Tenant |
| **BusinessDomain** | Dominio de correo del tenant | `tenantId`, `domain` (único) |
| **BusinessEmailAccount** | Cuenta de correo corporativa | `domainId` → BusinessDomain |

### 1.2 Relaciones Clave

```
Tenant (1) ──→ User (N)
Tenant (1) ──→ BusinessDomain (N)
Tenant (1) ──→ Subscription (1)
Tenant (1) ──→ Lead / Contact / Deal / Cotizacion / Contrato (N)
Tenant (1) ──→ Integration (N)
```

### 1.3 Multi-tenencia

- **Arquitectura:** Base de datos compartida (single PostgreSQL) con `tenantId` como discriminador en todas las tablas. El campo `dbUrl` en `Tenant` permite **aislamiento futuro** por base de datos separada — ya existe lógica de `getTenantDb(tenantId)` en `lib/db` que soporta ambos modos.
- **Subdominio:** `Tenant.subdomain` es único y se usa para rutas públicas (`/p/{slug}/...`). Existe un endpoint `/api/public/subdomain/check` para validar disponibilidad.
- **Módulos instalables:** `Tenant.enabledModules` es un `String[]` con valores como `["CRM"]`. También existe `TenantFeature` para features granulares (ej: `produccion`, `calidad`, `rrhh`).
- **Tenants padre/hijo:** `Tenant.parentId` permite relaciones jerárquicas (cuentas hijas que facturan a la cuenta padre).

### 1.4 Onboarding

- **Proceso Génesis (Onboarding 2.0):** `lib/onboarding-service.ts` — orquesta 4 pasos:
  1. **Provisionamiento** de BD (`provisionTenantDatabase`)
  2. **Bóveda de seguridad** — Hash Génesis SHA-256 + Llave Maestra AES-256
  3. **Activación de módulos** según plan (ERP features)
  4. **Registro en Global Audit Cloud**
- **Provisionamiento alternativo:** `lib/nexus/chatwoot-api.ts` — crea cuenta en Chatwoot + inbox de Telegram como onboarding rápido para planes starter.
- **No usa schemas separados de PostgreSQL** — todo es single-DB con tenantId.

---

## 2. WebCreator y GrapesJS

### 2.1 Editor Visual

El sistema **NO usa GrapesJS**. Usa **[Puck](https://github.com/measuredco/puck)** como editor visual drag-and-drop:

| Archivo | Propósito |
|---|---|
| `lib/puck/puck-config.tsx` | Configuración de componentes del editor (Hero, Secciones, Headings, Imágenes, Botones, Formularios) |
| `lib/puck/config.tsx` | Configuración root de páginas (título, colores, fuentes) |
| `lib/puck/components/index.tsx` | Componentes React renderizables |
| `app/dashboard/webcreator/page.tsx` | Dashboard del WebCreator (lista de páginas con estadísticas) |

### 2.2 Almacenamiento y Renderizado

- Cada página es un registro en **`CMS Page`** (model `Page` en Prisma) con:
  - `titulo`, `slug`, `tipo`, `estado` (draft/published)
  - `contenido` (campo **JSON** con el HTML/CSS/JS generado por Puck)
  - Métricas: `vistas`, `conversiones`
- **Templates:** Existe sistema de templates via `lib/webcreator/templateStorage.ts` — persistencia vía API REST en `/api/templates`.
- **Renderizado público:** Las páginas publicadas se sirven en `/p/{tenant-slug}/{page-slug}`.

### 2.3 Datos Dinámicos

- **No hay inyección dinámica nativa** — las páginas son estáticas (HTML generado por Puck).
- Los datos dinámicos se obtienen vía **API REST** tradicional (`/api/...`).
- El módulo `generate_web_creator_block` en `marketing-skills.ts` puede generar bloques HTML con IA.

### 2.4 IA para WebCreator

- **`generateLandingDraft`** (web-creator-skills.ts): Crea borradores de landing page personalizados para un lead usando IA.
- **`generate_web_creator_block`** (marketing-skills.ts): Genera bloques HTML/JSX con IA.

---

## 3. Base de Datos (~271+ modelos)

### 3.1 Schema Completo

El schema completo está en `prisma/schema.prisma`. No hay diagrama entidad-relación generado, pero los modelos principales forman un grafo bien definido.

### 3.2 Modelo `CatalogoItem` (Catálogo Genérico)

```
model CatalogoItem {
  id                    String    @id @default(cuid())
  tenantId              String
  nombre                String
  descripcion           String?
  sku                   String?
  tipo                  String    @default("servicio")  // "servicio" | "producto"
  precioBase            Float
  moneda                String    @default("EUR")
  categoriaFiscal       String    @default("general")
  tasaImpuestoId        String?
  duracionMinutos       Int?
  modalidad             String?
  unidad                String    @default("unidad")
  activo                Boolean   @default(true)
  destacado             Boolean   @default(false)
  customFieldValues     Json?     // ← EAV: campos personalizables en JSON
  categorias            String[]
  etiquetas             String[]
  metadata              Json?
  media                 Json?
  pricing               Json?
  costOfAcquisition     Float     @default(0)
  isManufactured        Boolean   @default(false)
  isStockable           Boolean   @default(false)
  requiresQualityControl Boolean  @default(false)
  familyId              String?
  // ... relaciones con InventoryConfig, StockMovement, etc.
}
```

### 3.3 Modelo Inventory (MRP Industrial)

- **`InventoryConfig`** — Configuración por ítem: `minStock`, `reorderPoint`, `valuationMethod`
- **`StockMovement`** — Movimientos de stock (trazabilidad completa con audit hash SHA-256 encadenado)
- **`Warehouse`** — Almacenes por tenant
- **`erp_inventory_lots`** — Lotes para trazabilidad industrial

### 3.4 Campos Personalizables (EAV)

No hay tabla EAV separada. Se usa **`customFieldValues` (JSON)** directamente en los modelos que lo requieren:
- `CatalogoItem.customFieldValues` — Campos personalizados del catálogo
- `Contact.customFieldValues` — Campos personalizados de contactos
- `Lead.metadataExterna` — Metadatos externos (JSON)
- `Tenant.configuracion` — Configuración dinámica del tenant
- `SubscriptionPlan.features` — Features del plan

---

## 4. Sistema de Billing y Comisiones

### 4.1 Stripe

- **Integrado** vía `stripe` SDK en `lib/stripe.ts`.
- **Checkout Sessions** — Implementado para pagos de servicios/citas (`/api/checkout`).
- **Stripe Customer ID** — `Tenant.stripeCustomerId` almacena el ID del cliente en Stripe.
- **Stripe Invoicing** — Módulo opcional activable por tenant (`/api/integrations/stripe-invoicing`).

### 4.2 Planes y Subscripciones

```
model SubscriptionPlan {
  id          String   @id @default(cuid())
  nombre      String
  slug        String   @unique
  precio      Float
  moneda      String   @default("MXN")
  intervalo   String   @default("mensual")  // mensual | anual
  limiteUsuarios  Int  @default(5)
  limiteLeads     Int  @default(1000)
  // ... flags de features (whatsapp, email, lms, whitelabel, etc.)
  features    Json?    // Features adicionales dinámicas
}

model Subscription {
  id                   String   @id @default(cuid())
  tenantId             String
  planId               String
  estado               String   @default("activa")
  stripeSubscriptionId String?  @unique
  montoPagado          Float?
  fechaRenovacion      DateTime?
  esTrial              Boolean  @default(false)
  diasTrialRestantes   Int?
}
```

### 4.3 Comisiones

```
model Comision {
  id             String   @id @default(cuid())
  tenantId       String
  dealId         String
  userId         String
  tipo           String   // "porcentaje" | "fijo"
  porcentaje     Float?
  montoFijo      Float?
  montoCalculado Float
  estado         String   @default("pendiente")
  fechaPago      DateTime?
}
```

### 4.4 Split Payments / Suborganizaciones

- **No existe Stripe Connect** ni split payments nativos.
- `Tenant.parentId` permite relación padre-hijo, pero no hay lógica de facturación consolidada implementada. Existe `consolidationSkills` para análisis financiero, pero no para billing.
- Las comisiones se calculan por deal y se asignan a usuarios, no a sub-tenants.

---

## 5. IA Skills Actuales (~70+ skills)

### 5.1 Registro Completo de Skills

El sistema tiene **~70 skills** registrados en `lib/skills/index.ts`, organizados en categorías. Solo los **reutilizables para bienes raíces**:

| Categoría | Skills | Relevancia Inmobiliaria |
|---|---|---|
| **Leads** | `create_lead`, `get_lead`, `find_lead_by_email`, `convert_lead`, `update_lead` | ✅ Leads de propiedades |
| **Contactos** | `create_contact`, `update_contact`, `get_contact`, `find_contact_by_email` | ✅ Clientes/compradores |
| **Conversaciones** | `create_conversation`, `send_message`, `get_conversation`, `close_conversation` | ✅ Seguimiento de clientes |
| **Tareas** | `create_task`, `complete_task`, `get_tasks_by_lead`, `get_pending_tasks` | ✅ Visitas, llamadas de seguimiento |
| **Citas/Bookings** | `create_booking`, `confirm_booking`, `cancel_booking`, `auto_schedule` | ✅ ✅ **Agendar visitas a propiedades** |
| **Deals/Pipeline** | `create_deal`, `update_deal`, `get_deal`, `list_deals`, `prequalify_lead` | ✅ ✅ **Pipeline de ventas inmobiliarias** |
| **Catálogo** | `export_catalog`, `search_catalog`, `get_catalog_item`, `get_field_definitions` | ✅ ✅ **Catálogo de propiedades** |
| **Marketing** | `generate_marketing_copy`, `generate_seo_metadata`, `generate_web_creator_block`, `analyze_marketing_sentiment` | ✅ Descripciones de propiedades, SEO |
| **Proactividad** | `detect_ghosting` (leads inactivos), `generate_success_path` | ✅ Detectar leads que dejaron de responder |
| **Training** | `generate_customer_response` (roleplay), `generate_post_mortem` | ✅ Simulación de negociaciones |
| **Chatbot** | `execute_chatbot_response` | ✅ Chatbot para preguntas de inmuebles |
| **WebCreator** | `generate_landing_draft` | ✅ Landing pages de propiedades |

### 5.2 Capacidades No Existentes (Para Bienes Raíces)

| Capacidad | Estado | Notas |
|---|---|---|
| Generación de descripciones de propiedades | ❌ No existe | Se puede construir sobre `generate_marketing_copy` |
| Análisis de precios de mercado (comparativa) | ❌ No existe | Requiere integración con APIs externas (Idealista, Fotocasa) |
| Detección de fraudes en datos inmobiliarios | ❌ No existe | Podría usar `audit_finance_integrity` como base |
| Score de calidad de propiedad | ❌ No existe | Similar a `healthScore` en Deals |
| Geocodificación / mapas | ❌ No existe | `Tenant` tiene `baseLatitude/baseLongitude` pero sin servicio de maps |
| Comparativa de mercado | ❌ No existe | Requiere data externa |

### 5.3 Arquitectura de Skills

```
App/Agent/Automation → Skills → Core → EventBus
```
- Cada skill recibe un payload tipado y retorna un resultado.
- Los skills se ejecutan desde: API routes, Chatbot (Gemma), MCP, n8n workflows, Automations.
- La ejecución está envuelta en: **idempotency**, **observability** (logs, métricas), **contexto de seguridad** (SkillContext).
- `executeSkill(skillName, payload)` permite invocación dinámica desde MCP/Agentes.

---

## 6. APIs Externas (Webhooks, n8n, Integraciones)

### 6.1 Módulo de Integraciones

- **Modelo `Integration`**: Almacena credenciales, configuraciones, estadísticas de sincronización por tenant.
- **Endpoint:** `/api/integrations/stripe-invoicing` (ejemplo funcional).
- **Dashboard:** `/dashboard/integraciones` (conecta con proveedores externos).

### 6.2 Webhooks

**Entrantes** (recibir datos de externos → Volkern):
- **Modelo `IncomingWebhook`**: Configurable por tenant, con mapeo de campos (nombre, email, teléfono).
- **Endpoint:** `/api/webhooks/incoming`
- **Acciones:** Crear lead, crear tarea, disparar automatización.
- **Logs:** `IncomingWebhookDelivery` — payload, headers, estado, errores.
- **Webhook universal:** Se puede usar para recibir datos desde Idealista, Fotocasa, etc.

**Salientes** (Volkern → externos):
- **Modelo `WebhookLog`**: Log de envíos con payload, status code, respuesta.
- **Dispatcher:** `lib/outgoing-webhooks.ts` — envía eventos a URLs configuradas.
- **Desde NotificationLayer:** El canal `webhook` puede disparar notificaciones a URLs externas.

### 6.3 n8n

- **No está embebido** en la plataforma. Se integra externamente vía webhooks.
- Triggers integrados: `n8n_workflow_completado`, `n8n_workflow_fallido` en el sistema de Automatización.
- La `AutomationEngine` en `lib/automation-engine.ts` puede ejecutar nodos n8n externos y recibir callbacks.

### 6.4 Chatwoot (Nexus)

- Integración nativa para WhatsApp/Telegram/Messenger.
- `lib/nexus/chatwoot-api.ts` — API client para crear cuentas, usuarios, inboxes.
- Sincronización bidireccional de mensajes vía `chatwoot-sync-skill.ts`.

### 6.5 Adapter Genérico

- **No existe** un adapter genérico para APIs externas (como el que se necesitaría para Idealista).
- Cada integración se implementa individualmente.
- El patrón usado es: `Integration` (credenciales) + Skill específico + Webhook mapping.

---

## 7. Sistema de Notificaciones y Eventos

### 7.1 Event Bus Interno (Volkern Event Bus)

**Arquitectura:**
```
Skill ejecutado → EventBus → Listeners (Automations, Webhooks, Agents, n8n)
```

- **Implementación:** Singleton de Node.js `EventEmitter` en `lib/skills/event-bus.ts`.
- **~70+ eventos tipados** definidos en `lib/types/events.ts`.
- **Uso:** `eventBus.emitEvent(EVENTS.LEAD_CREATED, payload)`.
- **Historial:** Almacena hasta 1000 eventos en memoria para debugging.

**Eventos existentes útiles para bienes raíces:**
- `LEAD_CREATED`, `LEAD_CONVERTED`, `LEAD_QUALIFIED`
- `DEAL_CREATED`, `DEAL_STAGE_CHANGED`, `DEAL_WON`, `DEAL_LOST`
- `BOOKING_CREATED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`
- `MESSAGE_SENT`, `MESSAGE_RECEIVED`
- `INVENTORY_LOW_STOCK`, `INVENTORY_OUT_OF_STOCK`

### 7.2 Sistema de Automatización

- **Modelo `Automation`**: Trigger + Flow (nodos y aristas tipo React Flow).
- **Engine:** `lib/automation-engine.ts` — ejecuta grafos de nodos (trigger → condition → action → delay).
- **Triggers:** Cualquier evento del EventBus puede disparar una automatización.
- **Acciones:** Enviar email, WhatsApp, Telegram, crear lead, actualizar deal, webhook externo, n8n workflow.
- **BullMQ:** Para procesamiento diferido (cuando Redis está disponible).

### 7.3 Sistema de Notificaciones Multicanal

**NotificationLayer** (`lib/skills/notification-layer.ts`):

| Canal | Estado | Proveedor |
|---|---|---|
| **Email** | ✅ Producción | Amazon SES (Nodemailer) |
| **WhatsApp** | ✅ Producción | Evolution API |
| **Telegram** | ✅ Producción | Bot API directo |
| **In-App** | ✅ Producción | `InAppNotification` (DB) |
| **Webhook** | ✅ Producción | POST a URL externa |
| **Push** | ⚠️ No implementado | Pendiente |

### 7.4 Capacidad de Automatización Inmobiliaria

Con la infraestructura actual, se pueden disparar automatizaciones como:
- "Propiedad publicada" → Email a leads interesados
- "Nuevo lead desde portal" → Asignar agente + crear tarea de seguimiento
- "Visita agendada" → Recordatorio 24h y 1h antes
- "Deal en etapa avanzada" → Notificar al gerente
- "Propiedad sin visitas en 7 días" → Sugerir ajuste de precio

---

## Resumen de Capacidades vs. Necesidades Inmobiliarias

| Necesidad | ¿Existe? | Gap |
|---|---|---|
| Multi-tenencia con subdominios | ✅ Sí | OK |
| Catálogo de propiedades (CatalogoItem) | ✅ Sí | Agregar campos específicos (metros, habitaciones, ubicación) |
| Pipeline de ventas (Deals) | ✅ Sí | OK — adaptable a compra/venta/alquiler |
| Agendar visitas (Bookings) | ✅ Sí | OK — con recordatorios automáticos |
| Generar descripciones con IA | ⚠️ Parcial | Usar `generate_marketing_copy` + prompt tuning |
| Chatbot inmobiliario | ✅ Sí | `execute_chatbot_response` con contexto de propiedades |
| Comparativa de mercado | ❌ No | Requiere API externa (Idealista) |
| Geocodificación y mapas | ❌ No | Integrar Google Maps / Mapbox |
| Portal público de propiedades | ⚠️ Parcial | WebCreator puede renderizar, pero falta template específico |
| Feed de propiedades desde Idealista | ❌ No | Requiere webhook entrante + adapter |
| Split payments / comisiones | ⚠️ Parcial | `Comision` existe, pero sin Stripe Connect |
| Email corporativo por usuario | ⚠️ Planeado | Pendiente en plan de implementación (ver `docs/plan-correo-usuarios-conversaciones-deals.md`) |
| Notificaciones push mobile | ❌ No | Firebase pendiente |

---

> **Próximo paso:** Este diagnóstico servirá como base para diseñar el plan de implementación de funcionalidades inmobiliarias (bienes raíces) y cualquier otra mejora que requiera conocimiento profundo de la arquitectura actual.
