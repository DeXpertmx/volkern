# 🔍 Análisis Completo: Volkern — Sistema Operativo Empresarial

> **Fecha del análisis:** 18 de julio de 2026
> **Propósito:** Documentar la arquitectura, módulos, stack tecnológico y estado actual del proyecto para identificar áreas de mejora.

---

## 1. ¿Qué es Volkern?

**Volkern** es un **Sistema Operativo Empresarial** — una plataforma modular de gestión empresarial (ERP + CRM) diseñada para agencias, franquicias inmobiliarias y emprendedores digitales en España y LATAM.

Construida como un **SaaS multi-tenant** con base de datos compartida (Single Source of Truth) pero aislamiento criptográfico por inquilino mediante un sistema de bóvedas (Vault).

- 🌐 **Sitio web:** [volkern.com](https://volkern.com)
- 📖 **Documentación técnica:** [`documentacion_tecnica/`](documentacion_tecnica/)

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | Next.js 14 (App Router) + React 18 + TypeScript 5.2 |
| **Estilos** | Tailwind CSS 3.3 + Shadcn/UI (Radix primitives) + Lucide icons |
| **Animaciones** | Framer Motion 10.18 |
| **Backend/API** | API Routes de Next.js (~687 endpoints) |
| **Base de Datos** | PostgreSQL + Prisma ORM 6.7 (~6,949 líneas de schema, 50+ modelos) |
| **Autenticación** | NextAuth.js 4.24 + API Keys con permisos granulares |
| **CMS Visual** | @measured/puck (páginas editables) + GrapesJS (web creator) |
| **Pagos/Facturación** | Stripe + GoCardless (Nordigen) + Plaid + Square |
| **Colas/Tareas** | BullMQ + Redis (ioredis) |
| **IA** | OpenAI + OpenRouter (fallback DeepSeek → Gemini 2.5 Flash) + Gemma local |
| **Testing** | Vitest + Supertest + @testing-library/react |
| **Notificaciones Push** | OneSignal |
| **Email** | Resend + AWS SES + Nodemailer |
| **Logging** | Pino (estructurado, JSON) |
| **Mapas** | Leaflet + React-Leaflet + MarkerCluster |
| **Formularios** | React Hook Form + Zod + Yup + Formik |
| **App Móvil** | Expo (gemma-app/) |

---

## 3. Arquitectura General

```
Usuario → Dominio/Slug → Next.js (App Router)
                           │
                    ┌──────┴──────┐
                    │  Middleware  │
                    │  (tenant,    │
                    │   rate-limit)│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         Públicas     Dashboard      API Routes
         (landing,    (app/[tenant]  (app/api/)
          booking,     /dashboard/)   687 routes
          embed)
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────┴──────┐
                    │   Prisma    │
                    │  (PostgreSQL│
                    │   + Redis)  │
                    └─────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         Stripe       BullMQ/Redis     IA/OpenRouter
         (pagos)      (colas/tareas)   (Gemma/OpenAI)
```

### 3.1 Multi-tenancy

El aislamiento entre inquilinos se logra mediante:

1. **Slug en la URL:** `/[tenantSlug]/dashboard/...`
2. **Middleware de inyección:** Extrae el slug, valida sesión y contexto
3. **Vault criptográfico:** Cada tenant tiene `masterKeyEncrypted` + `hmacSecret`
4. **API Keys:** Granulares por tenant (`leads:read`, `leads:write`, etc.)
5. **HOC `withTenantAuth`:** Envuelve endpoints, valida que el usuario pertenezca al tenant

### 3.2 Sistema de Skills

Más de **60 skills** registrados en `lib/skills/` que permiten a agentes IA (Gemma) y automatizaciones ejecutar operaciones de negocio:

| Categoría | Skills principales |
|-----------|-------------------|
| **Contacts** | `create_contact`, `update_contact`, `find_contact_by_email` |
| **Leads** | `create_lead`, `get_lead`, `convert_lead` |
| **Conversations** | `send_message`, `close_conversation` |
| **Tasks** | `create_task`, `complete_task`, `get_pending_tasks` |
| **Bookings** | `create_booking`, `confirm_booking`, `cancel_booking` |
| **Deals** | `create_deal`, `update_deal`, `prequalify_lead` |
| **Finance** | `create_invoice`, `rectify_invoice`, `analyze_burn_rate` |
| **Inventory** | `adjust_stock`, `get_inventory_health`, `inventory_watchdog` |
| **HR** | `talent_retention_risk`, `get_employee_confidential_data` |
| **Marketing** | `generate_marketing_copy`, `analyze_marketing_sentiment` |
| **Quality** | `detect_quality_anomalies`, `register_qc_inspection` |

---

## 4. Los 13 Hubs / Módulos del Sistema

### 00. Core e Infraestructura
**Archivos clave:** `middleware.ts`, `lib/core/`, `lib/db.ts`, `lib/api-key-auth.ts`
- Middleware de inyección de tenant, MasterKey Vault, Industrial Onboarding (Génesis)
- Rate limiting, health checks, logger estructurado (Pino)
- Sistema de Skills Registry y MCP Server

### 01. Sales Hub (CRM + Ventas)
**APIs:** `app/api/leads/`, `app/api/deals/`, `app/api/contacts/`, `app/api/pipeline/`
**Componentes:** `components/lead-pipeline.tsx`, `components/deals/`
- Leads con scoring inteligente, pipeline Kanban, deals con forecast
- Cotizaciones con items, descuentos, IVA; contratos con firmas digitales
- Orquestación transaccional: ATP/CTP, MarginGuard

### 02. Academy Hub (LMS)
**APIs:** `app/api/academy/`, `app/api/cursos/`, `app/api/certificados/`
**Páginas:** `app/academy/`, `app/[tenant]/academy/`
- Cursos, lecciones, módulos, quizzes, certificaciones
- Progreso de estudiante, evaluaciones, supervisor

### 03. Member Portal
**Páginas:** `app/member/`, `app/[tenant]/member/`
- Portal privado para miembros con login propio
- Contenido exclusivo por membresía

### 04. Production Hub
**APIs:** `app/api/erp/` (producción)
**Componentes:** `components/hubs/ProduccionDashboard.tsx`
- Órdenes de trabajo, MRP autónomo, costing, calidad
- Planificación, scheduling, readiness

### 05. Logistics Hub
**APIs:** `app/api/erp/` (logística, inventario, flota)
**Componentes:** `components/hubs/Logistica*.tsx`, `components/hubs/FleetLiveMap.tsx`
- Inventario con stock movements, almacenes, flota GPS
- Tracking de envíos, rutas, alertas

### 06. HR & Payroll Hub
**APIs:** `app/api/erp/` (RRHH), `app/api/ausencias/`
**Componentes:** `components/hr/`
- Expedientes de empleados, asistencia (punch clock), vacaciones
- Nóminas con payroll sealing (firma criptográfica), beneficios

### 07. Contracts Hub
**APIs:** `app/api/contratos/`
**Páginas:** `app/contrato/[token]/`
- Contratos blindados con firma digital del cliente
- Cláusulas personalizables, métodos de pago, schedule automático
- URL pública para firma sin login

### 08. Security & Audit Hub
**APIs:** `app/api/audit-logs/`, `app/api/rbac/`, `app/api/roles/`
**Componentes:** `components/sovereignty/`, `components/compliance/`
- RBAC con roles y permisos granulares
- 2FA, trust protocol, integrity logs
- Compliance scoring, alertas inteligentes

### 09. Finance Hub
**APIs:** `app/api/accounting/`, `app/api/fiscal/`, `app/api/invoices/`
**Componentes:** `components/hubs/accounting/`, `components/fiscal/`
- Facturación Veri*Factu (España), contabilidad PGC (Plan General de Contabilidad)
- Conciliación bancaria, gastos, proveedores, IVA
- Modelos 130, 347, 349, 390, IRPF
- Múltiples SLIs contables (España, México)

### 10. Projects Hub
**APIs:** `app/api/erp/projects/`
**Componentes:** `components/hubs/ProyectosDashboard.tsx`
- Gestión de proyectos con hitos, tareas, rentabilidad
- Detección de desviaciones (project drifting)

### 11. Catalog Hub
**APIs:** `app/api/catalogo/`
- Catálogo de productos/servicios con campos dinámicos via JSONB
- BOM (Bill of Materials), fabricación, importación

### 12. Communications Hub
**APIs:** `app/api/mensajes/`, `app/api/canales/`, `app/api/chatbot/`
**Componentes:** `components/messaging/`, `components/connect/`
- Omnicanal: WhatsApp (Evolution API + Anytimebot), email, web chat, Telegram
- Helpdesk con tickets, SLA monitor
- Chat persistente con historial completo

### 13. Marketing CRM
**APIs:** `app/api/campanas/`, `app/api/marketing/`, `app/api/email-campanas/`
**Componentes:** `components/marketing/`
- Campañas de email, automatizaciones de marketing
- Segmentación, analítica, social media posting
- Generación de copy con IA

---

## 5. IA: Gemma — Asistente Nativo

Volkern incluye un asistente de IA propio llamado **Gemma** con las siguientes capacidades:

| Característica | Detalle |
|---------------|---------|
| **Clasificador de intenciones** | 50+ intenciones separadas por dominio (6 archivos) |
| **Extractor de entidades** | Fechas, horas, nombres, montos (regex + NLP) |
| **Ejecutor de skills** | 60+ skills disponibles vía MCP |
| **Proveedor AI** | OpenRouter con fallback DeepSeek → Gemini 2.5 Flash |
| **Auto-diagnóstico** | Cada 5 minutos (AIOps) |
| **Visión** | Análisis de imágenes (facturas, capturas) vía vision-service |
| **App Móvil** | Expo app (`gemma-app/`) |
| **Modo consola** | `app/api/volkern/` y `app/api/volkern-execute/` |

Flujo de procesamiento:

```
Mensaje → Security Checkpoint → Intent Classifier → Entity Extractor
    → Context Builder → Skill Orchestrator → Execution
    → Response Formatter → Audit Log
```

---

## 6. Métricas del Proyecto

| Métrica | Valor |
|---------|-------|
| **Endpoints API** | ~687 en `app/api/` |
| **Modelos Prisma** | 50+ en 6,949 líneas de schema |
| **Páginas/Dashboards** | 160+ en `app/[tenant]/dashboard/` |
| **Componentes React** | 90+ en `components/` |
| **Archivos de lógica** | 200+ en `lib/` |
| **Schemas de validación** | 31 archivos Zod en `lib/validation/schemas/` |
| **Skills registrados** | 60+ en `lib/skills/` |
| **Tests** | 842+ tests, 50+ suites, 98.3% cobertura |
| **App Móvil** | Expo, 32,335+ archivos |
| **Documentación técnica** | 20 documentos markdown + PDFs |
| **Dependencias** | ~230 en producción |

---

## 7. Estado de la Deuda Técnica (Roadmap 15/15 ✅)

El proyecto ha completado **15 de 15 mejoras** identificadas en su roadmap:

### 🔴 Críticas (completadas)
| # | Mejora | Acción |
|---|--------|--------|
| 1 | Tests automatizados | 842+ tests, 98.3% cobertura (Vitest) |
| 2 | Secrets hardcodeados | MASTER_KEY y TENANT_PEPPER ahora son obligatorios en entorno |
| 3 | Rate limiting | 30 req/min público, 300 req/min autenticado |

### 🟠 Arquitectura (completadas)
| # | Mejora | Acción |
|---|--------|--------|
| 4 | automation-engine monolítico | Refactorizado: 2,918 → 716 líneas en 12 módulos |
| 5 | intent-classifier monolítico | Separado en 6 archivos por dominio |
| 6 | Validación Zod | 302 endpoints de escritura con `validateBody()` |
| 7 | Abacus AI SPOF | Migrado a OpenRouter con fallback automático |

### 🟡 Mantenibilidad (completadas)
| # | Mejora | Acción |
|---|--------|--------|
| 8 | Cola secuencial | PromisePool con concurrencia 10 (BullMQ pendiente) |
| 9 | Sin caché | Helper `withCache()` con Redis + in-memory fallback |
| 10 | Middleware frágil | Constantes centralizadas en `lib/middleware-routes.ts` |
| 11 | Sin health checks | Endpoint `/api/health` con DB + Redis |

### 🟢 DX y Calidad (completadas)
| # | Mejora | Acción |
|---|--------|--------|
| 12 | Sin linting | Husky + lint-staged + ESLint estricto |
| 13 | Tipos `any` dispersos | Eliminados en 5 archivos clave |
| 14 | console.log sin estructura | Pino logger con requestId y redacción de secrets |
| 15 | Sin OpenAPI | Especificación 3.0.3 + Swagger UI en `/api/docs` |

---

## 8. Estructura del Proyecto

```
Volkern/
├── nextjs_space/                 # ★ Aplicación principal
│   ├── app/
│   │   ├── api/                  # ~687 endpoints API modulares
│   │   │   ├── leads/            # CRM (leads, contactos, deals)
│   │   │   ├── erp/              # ERP (proyectos, inventario, RRHH, producción)
│   │   │   ├── accounting/       # Contabilidad y fiscal
│   │   │   ├── citas/            # Calendario y citas
│   │   │   ├── webhooks/         # Webhooks entrantes (Stripe, Telegram, etc.)
│   │   │   ├── public/           # API públicas embebibles
│   │   │   ├── v1/               # API versión 1 (legacy)
│   │   │   └── ... (90+ directorios de API)
│   │   ├── [tenant]/             # ★ Rutas multi-tenant
│   │   │   ├── dashboard/        # Panel principal (160+ páginas)
│   │   │   ├── academy/          # LMS
│   │   │   ├── booking/          # Booking público
│   │   │   ├── contrato/         # Firma de contratos
│   │   │   ├── webcreator/       # Editor web
│   │   │   └── portal/           # Portal de miembros
│   │   ├── admin/                # Panel de superadmin
│   │   ├── landing/              # Páginas públicas (marketing, soluciones, precios)
│   │   └── ... (40+ rutas de página)
│   ├── components/               # 90+ componentes React
│   │   ├── ui/                   # Shadcn/UI (50+ componentes base)
│   │   ├── public/               # Componentes de landing pages
│   │   ├── hubs/                 # Dashboards por módulo
│   │   ├── hr/                   # RRHH (nóminas, vacaciones, expedientes)
│   │   ├── messaging/            # Chat y comunicaciones
│   │   ├── webcreator/           # Editor visual GrapesJS
│   │   └── ... (30+ directorios)
│   ├── lib/                      # 200+ archivos de lógica
│   │   ├── skills/               # 40+ skills de IA
│   │   ├── agents/               # Motor de chatbot e IA
│   │   ├── automation/           # Motor de automatizaciones
│   │   ├── validation/           # Schemas Zod (31 archivos)
│   │   ├── accounting/           # Contabilidad y fiscal
│   │   ├── erp/                  # ERP (RRHH, producción, logística)
│   │   └── ... (50+ directorios)
│   ├── prisma/
│   │   └── schema.prisma        # 6,949 líneas, 50+ modelos
│   ├── tests/                    # 842+ tests
│   ├── hooks/                    # Custom hooks React
│   ├── mcp-server/               # Servidor MCP (fuente única)
│   └── gemma-app/               # App móvil Expo (32,335+ archivos)
├── documentacion_tecnica/        # Documentación completa (20+ docs)
├── auditor/                      # Scripts de auditoría
├── *.md                          # Documentación de integraciones y fixes
└── fluy_crm.zip                  # Backup/export
```

---

## 9. Posibles Áreas de Mejora

Basado en el análisis completo, estas son las áreas con mayor potencial de mejora:

### 9.1 Rendimiento y Build

| Área | Problema | Propuesta |
|------|----------|-----------|
| **Build time** | Next.js 14 con 687 endpoints + App Router tiene builds lentos | Evaluar modularización en monorepo Turborepo |
| **Bundle size** | No se usa `next/dynamic` consistentemente | Auditoría de bundles con `@next/bundle-analyzer` |
| **WebSockets** | Sin WebSocket nativo en producción (limitación serverless) | Usar Socket.io con servidor Node dedicado o Pusher |
| **Imágenes** | Sin optimización sistemática | Migrar a next/image y CDN (Cloudflare R2 ya está) |

### 9.2 Infraestructura y Colas

| Área | Problema | Propuesta |
|------|----------|-----------|
| **BullMQ pendiente** | El PromisePool actual es parcial; las colas de tareas no tienen prioridad por tenant | Migrar a BullMQ con colas dedicadas por tenant |
| **Monitoreo** | Solo health check básico | Agregar APM (DataDog, Sentry) y métricas de negocio |
| **Backups** | No hay sistema visible de backups automatizados | Implementar pg_dump programado + R2 |

### 9.3 Testing y Calidad

| Área | Problema | Propuesta |
|------|----------|-----------|
| **Tests E2E** | Solo hay unitarios + integración | Expandir tests E2E con Puppeteer para flujos críticos (booking, checkout, firma) |
| **Tests visuales** | Sin pruebas de regresión visual | Agregar Chromatic o Percy para componentes UI |
| **Coverage thresholds** | No hay gate de coverage en CI | Agregar mínimo de 80% en CI |

### 9.4 UX y Frontend

| Área | Problema | Propuesta |
|------|----------|-----------|
| **i18n** | Todo el UI está en español fijo | Agregar next-intl o react-i18next para expansión LATAM |
| **Modo offline** | Sin soporte para trabajo offline | Service workers + IndexedDB para datos críticos |
| **Carga diferida** | Muchos dashboards cargan todo al inicio | Implementar lazy loading por pestaña/módulo |
| **Accesibilidad** | Sin auditoría a11y | Revisar contraste, roles ARIA, navegación por teclado |

### 9.5 API y Documentación

| Área | Problema | Propuesta |
|------|----------|-----------|
| **API v1 vs v2** | Coexisten rutas en `/api/v1` y `/api/` sin versionado claro | Estandarizar versionado o migrar v1 |
| **Rate limiting granular** | Límites fijos por rol (30/300) | Limites configurables por plan (BASIC=100, PRO=500, ENTERPRISE=2000) |
| **Documentación API** | Swagger UI existe pero podría tener ejemplos interactivos | Agregar "Try it out" con autenticación sandbox |

### 9.6 Seguridad

| Área | Problema | Propuesta |
|------|----------|-----------|
| **Auditoría de dependencias** | 230+ dependencias sin auditoría periódica | `npm audit` en CI, Dependabot |
| **CORS** | Configuraciones de CORS pueden ser restrictivas | Revisar y centralizar política CORS |
| **SQL Injection** | Algunos queries usan interpolación de strings en vez de Prisma raw parameterized | Auditoría de todos los `prisma.$queryRaw` |

---

## 10. Glosario Técnico

| Término | Significado |
|---------|-------------|
| **ATP/CTP** | Available To Promise / Capable To Promise — orquestación inventario vs producción |
| **BOM** | Bill of Materials — lista de materiales para fabricación |
| **BullMQ** | Cola de mensajes basada en Redis para tareas background |
| **CUID** | Identificador único similar a UUID pero más corto |
| **Gemma** | Asistente de IA nativo de Volkern |
| **HOC** | Higher-Order Component — patrón de React para envolver funcionalidad |
| **Hub** | Módulo funcional del sistema (Sales Hub, Finance Hub, etc.) |
| **MCP** | Model Context Protocol — protocolo para comunicación con asistentes IA |
| **PGC** | Plan General de Contabilidad — estándar contable español |
| **RBAC** | Role-Based Access Control — control de acceso por roles |
| **Skill** | Unidad de funcionalidad ejecutable por IA o automatización |
| **Veri\*Factu** | Sistema de facturación electrónica obligatorio en España |
| **Vault** | Bóveda criptográfica por tenant para aislamiento seguro |

---

*Documento generado a partir del análisis estructural del código fuente, documentación técnica y configuración del proyecto.*
