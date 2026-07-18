# Módulo Marketing Ads — Plan de Desarrollo

## Objetivo
Construir un módulo completo de Marketing Ads dentro de Volkern que permita:
- Conectar cuentas de Meta Ads, Google Ads y LinkedIn Ads
- Crear y calendarizar campañas desde Volkern
- Sincronizar métricas automáticamente
- Obtener análisis de rendimiento por campaña
- Controlar presupuestos y recursos
- IA que pause campañas que no funcionan antes de que generen gastos innecesarios
- Pruebas A/B con declaración automática de ganador
- Control vía agente conversacional (el usuario habla y la IA ejecuta)

---

## Fase 1 — Base de datos + APIs CRUD

### Agente 1 — Schema Prisma
Modelos a crear en `prisma/schema.prisma`:

```
AdAccount
  id, tenantId, platform (META|GOOGLE|LINKEDIN), accountName, accountId,
  status (ACTIVE|DISCONNECTED|ERROR), lastSyncAt, metadata (Json),
  createdAt, updatedAt

AdCampaign
  id, tenantId, adAccountId, platformCampaignId, name, status (ACTIVE|PAUSED|ARCHIVED),
  objective, dailyBudget, lifetimeBudget, startDate, endDate,
  platformStatus, optimizationGoal, buyingType, metadata (Json),
  createdAt, updatedAt

AdSet
  id, tenantId, adCampaignId, platformAdSetId, name, status,
  dailyBudget, bidAmount, bidStrategy, targeting (Json),
  startDate, endDate, metadata (Json), createdAt, updatedAt

AdCreative
  id, tenantId, adSetId, platformCreativeId, name, status,
  headline, body, callToAction, imageUrl, videoUrl, linkUrl,
  thumbnailUrl, metadata (Json), createdAt, updatedAt

AdDailyMetric
  id, tenantId, adAccountId, adCampaignId, adSetId,
  date (DateTime), platform,
  impressions, clicks, spend, reach, frequency,
  ctr, cpc, cpm, cpa, conversions, roas,
  videoViews, videoP25Watched, videoP50Watched, videoP75Watched, videoP100Watched,
  costPerUniqueClick, uniqueClicks, uniqueImpressions,
  metadata (Json), createdAt

AdSchedule
  id, tenantId, adCampaignId, adSetId,
  daysOfWeek (Json), startTime, endTime, timezone,
  action (ACTIVATE|PAUSE), enabled (Boolean default true),
  createdAt, updatedAt

AdBudget
  id, tenantId, adAccountId, adCampaignId,
  budgetAmount (Float), period (DAILY|WEEKLY|MONTHLY|CUSTOM),
  startDate, endDate, spentAmount (Float), alertThreshold (Float),
  autoPauseWhenExceeded (Boolean default false),
  status (ACTIVE|PAUSED|EXCEEDED), createdAt, updatedAt

AdRule
  id, tenantId, name, description,
  platform (META|GOOGLE|LINKEDIN|ALL),
  metric (CPC|CTR|CPA|ROAS|SPEND|IMPRESSIONS|CLICKS),
  condition (GREATER_THAN|LESS_THAN|EQUALS|CHANGE_PERCENTAGE),
  threshold (Float), evaluationWindow (Int),  // en horas
  consecutiveViolations (Int),  // cuantas veces seguidas antes de accionar
  action (PAUSE_CAMPAIGN|PAUSE_ADSET|ALERT_ONLY|REDUCE_BUDGET|INCREASE_BUDGET),
  budgetAdjustmentPct (Float?),  // si accion es ajuste presupuesto
  enabled (Boolean default true), cooldownHours (Int),
  lastActionAt (DateTime?), createdAt, updatedAt

AdABTest
  id, tenantId, adCampaignId, name, description,
  status (DRAFT|RUNNING|COMPLETED|CANCELLED),
  metric (CTR|CPC|CPA|ROAS|CONVERSIONS),
  significanceThreshold (Float default 0.95),
  winnerId (String?), declaredAt (DateTime?),
  startDate, endDate, createdAt, updatedAt

AdABTestVariant
  id, tenantId, abTestId, variantLabel (A|B|C...),
  adSetId, trafficAllocation (Float),  // porcentaje
  currentImpressions, currentClicks, currentConversions,
  currentSpend, currentMetric, createdAt, updatedAt

AdAiAction
  id, tenantId, ruleId (String?),
  actionType (PAUSE_CAMPAIGN|PAUSE_ADSET|ADJUST_BUDGET|ALERT|SUGGEST),
  targetType (CAMPAIGN|ADSET|CREATIVE), targetId,
  reason (Text), evidence (Json),
  status (PENDING|EXECUTED|FAILED|REJECTED),
  requiresApproval (Boolean default false), approvedBy (String?),
  executedAt (DateTime?), createdAt
```

### Agente 2 — API Routes CRUD
Crear en `app/api/marketing/ads/`:
- `accounts/route.ts` — GET (listar), POST (conectar)
- `accounts/[id]/route.ts` — GET, PATCH, DELETE
- `accounts/[id]/sync/route.ts` — POST (sync manual)
- `campaigns/route.ts` — GET, POST
- `campaigns/[id]/route.ts` — GET, PATCH, DELETE
- `campaigns/[id]/pause/route.ts` — POST
- `campaigns/[id]/resume/route.ts` — POST
- `adsets/route.ts`, `adsets/[id]/route.ts`
- `creatives/route.ts`, `creatives/[id]/route.ts`
- `rules/route.ts`, `rules/[id]/route.ts`
- `ab-tests/route.ts`, `ab-tests/[id]/route.ts`
- `ab-tests/[id]/declare-winner/route.ts` — POST
- `budgets/route.ts`, `budgets/[id]/route.ts`
- `analytics/route.ts` — GET con filtros (fechas, campañas, cuentas, métricas agregadas)
- `schedules/route.ts`, `schedules/[id]/route.ts`

Todas con autenticación multi-tenant via `withTenantAuth`.

### Agente 3 — Migración + Seed
- `npx prisma migrate dev --name add_marketing_ads`
- Seed con datos de ejemplo para desarrollo

### ✅ Checkpoint 1
Tablas creadas, migración aplicada, APIs CRUD funcionales probadas con tests.

---

## Fase 2 — Integraciones con plataformas Ads

### Agente 1 — Meta Ads Adapter
Archivo: `lib/marketing/ads/meta-adapter.ts`

- OAuth flow (reutilizar patrón de `Integration` + `credenciales` Json)
  - App ID, App Secret de Meta Developer
  - Access token (Page Token o Ads Token)
  - Refresh automático
- Métodos:
  - `getAccounts()` — Listar cuentas publicitarias
  - `getCampaigns(accountId)` — Listar campañas
  - `getAdSets(campaignId)` — Listar conjuntos de anuncios
  - `getAdCreatives(adSetId)` — Listar creativos
  - `getInsights(accountId, since, until, level)` — Obtener métricas
  - `createCampaign(accountId, data)` — Crear campaña
  - `updateCampaign(campaignId, data)` — Actualizar campaña
  - `pauseCampaign(campaignId)` — Pausar
  - `resumeCampaign(campaignId)` — Reanudar
  - `deleteCampaign(campaignId)` — Eliminar
  - `createAdSet(campaignId, data)`
  - `createAdCreative(adSetId, data)`

### Agente 2 — Google Ads Adapter
Archivo: `lib/marketing/ads/google-adapter.ts`

- OAuth flow via Google Cloud Console (Google Ads API)
  - Cliente ID, Client Secret, Developer Token
  - Refresh token
- Métodos equivalentes a Meta adapter
- Usar `googleapis` SDK o REST API directamente

### Agente 3 — LinkedIn Ads Adapter
Archivo: `lib/marketing/ads/linkedin-adapter.ts`

- OAuth flow via LinkedIn Developer
- Métodos equivalentes

### Agente 4 — Sistema de Integración Unificado
- Reutilizar modelo `Integration` con `tipo: 'meta_ads' | 'google_ads' | 'linkedin_ads'`
- Factory `getAdapter(platform, credentials)` que retorna el adapter correcto
- Health check: verificar que el token sigue siendo válido, marcar cuenta como DISCONNECTED si falla

### ✅ Checkpoint 2
Las 3 plataformas conectables desde la UI, OAuth funcional, se pueden listar campañas desde cada API.

---

## Fase 3 — Sincronización periódica (CRON + BullMQ)

### Agente 1 — Job Definitions
Archivo: `lib/cron/ads-sync-jobs.ts`

- Usar `node-cron` (patrón existente en `scheduler.ts`)
- CRON cada 1 hora: `0 * * * *`
- Encola un job BullMQ por cada cuenta activa
- Tipo de job: `ads_sync`

### Agente 2 — Worker
Archivo: `lib/queue/ads-sync-worker.ts`

- Procesa `ads_sync` jobs
- Para cada cuenta:
  1. Obtener adapter correspondiente
  2. Traer campañas activas
  3. Traer métricas de las últimas 24-48h (dependiendo de última sync)
  4. Upsert en `AdDailyMetric`
  5. Actualizar `lastSyncAt` en `AdAccount`
- Actualizar worker en `lib/queue/execution-worker.ts` o crear worker independiente

### Agente 3 — Rate Limiter + Logging
- Respetar límites de cada API (Meta: 200 calls/h por token, Google: 50k QPD)
- Cola de reintentos con backoff exponencial (reutilizar patrón BullMQ existente)
- Log de sync: cuántas campaigns/metrics se sincronizaron, errores
- Marcar cuenta como ERROR si falla N veces seguidas

### ✅ Checkpoint 3
Métricas sincronizándose automáticamente cada hora, logs visibles, errores manejados.

---

## Fase 4 — Calendarización y control de campañas

### Agente 1 — Schedule Engine
Archivo: `lib/marketing/ads/schedule-engine.ts`

- CRON cada 5 minutos (o vía BullMQ recurrente)
- Evaluar `AdSchedule`:
  - Coincide día de semana?
  - Coincide hora actual con rango?
  - Si activación programada → llamar `adapter.resumeCampaign()`
  - Si pausa programada → llamar `adapter.pauseCampaign()`
- Log en `AdAiAction` con `actionType: 'SCHEDULE_PAUSE' | 'SCHEDULE_ACTIVATE'`

### Agente 2 — Budget Controller
Archivo: `lib/marketing/ads/budget-controller.ts`

- Evaluar `AdBudget`:
  - Comparar `spentAmount` vs `budgetAmount`
  - Si excede threshold → alerta (notificación + `AdAiAction`)
  - Si `autoPauseWhenExceeded` → pausar campaña via adapter
- Actualizar `spentAmount` después de cada sync

### Agente 3 — UI de Schedule y Budgets
- Componentes en `components/marketing/ads/`:
  - `AdScheduleCalendar.tsx` — Calendario semanal con drag & drop de bloques horarios
  - `AdBudgetPanel.tsx` — Panel de control de presupuesto con barra de progreso
  - `AdBudgetForm.tsx` — Crear/editar presupuesto
- Integrar con APIs de schedules y budgets

### ✅ Checkpoint 4
Campañas se pausan/activan según calendario, budgets controlados con alertas.

---

## Fase 5 — IA de optimización y auto-pause

### Agente 1 — Marketing Ads Skills
Archivo: `lib/skills/marketing-ads-skills.ts`

Skills que el agente conversacional podrá ejecutar:
- `evaluate_campaign_performance` — Evalúa métricas de una campaña contra thresholds
- `pause_campaign` — Pausa campaña vía API de la plataforma
- `resume_campaign` — Reanuda campaña
- `adjust_budget` — Ajusta presupuesto de campaña (±X%)
- `get_campaign_analytics` — Obtiene resumen de métricas
- `suggest_creative_change` — Sugiere cambio de creativo si CTR bajo
- `create_ab_test` — Crea test A/B
- `declare_ab_test_winner` — Declara ganador

### Agente 2 — Marketing Ads Intents
Archivo: `lib/agents/intents/marketing-ads-intents.ts`

Registrar intents para el clasificador:
- `pausar_campanha` — "pausa la campaña de Facebook", "detén la campaña X"
- `analizar_rendimiento` — "cómo va la campaña Y", "dame métricas de Z"
- `ajustar_presupuesto` — "sube el presupuesto un 20%", "reduce gasto"
- `crear_test_ab` — "crea un A/B test para la campaña X"
- `consultar_calendario` — "qué campañas están activas hoy"

### Agente 3 — Sistema de Reglas (AdRule)
- El usuario configura reglas desde la UI:
  - "Si CPC > 5€ por más de 3 horas consecutivas → pausar campaña"
  - "Si ROAS < 2.0 por más de 24h → alertar"
  - "Si CTR < 0.5% → sugerir nuevo creativo"
- UI en `components/marketing/ads/AdRuleForm.tsx`
- Interfaz visual con tabla de reglas, toggle enable/disable, historial de acciones

### Agente 4 — Evaluador Automático
Archivo: `lib/marketing/ads/ai-optimizer.ts`

- CRON cada 30 minutos
- Recorre todas las `AdRule` activas
- Para cada regla:
  1. Obtener métricas recientes del período de evaluación
  2. Evaluar condición vs threshold
  3. Si se violó N veces consecutivas → ejecutar acción
  4. Registrar en `AdAiAction`
- Si `requiresApproval: true` → no ejecutar, solo alertar al usuario
- Si `requiresApproval: false` → ejecutar automáticamente
- Cooldown: no repetir misma acción hasta que pase `cooldownHours`

### Agente 5 — Audit Trail + Notificaciones
- Dashboard de acciones de IA realizadas
- Notificaciones in-app cuando la IA pausa una campaña
- Posibilidad de "revertir" acción desde el UI
- Log completo en `AdAiAction` con evidencia (métricas al momento de la decisión)

### ✅ Checkpoint 5
IA evaluando campañas cada 30 min, pausando automáticamente bajo condiciones configurables, con audit trail completo.

---

## Fase 6 — A/B Testing

### Agente 1 — AB Test Engine
Archivo: `lib/marketing/ads/ab-test-engine.ts`

- `createTest(testId)` — Asigna variantes, configura tráfico (si la plataforma lo permite)
- `getResults(testId)` — Obtiene métricas actuales de cada variante
- `calculateSignificance(testId)` — Calcula significancia estadística
  - Método: Chi-cuadrado para CTR/conversiones, T-test para CPC/CPA
  - Fórmula bayesiana como alternativa
- `declareWinner(testId)` — Declara ganador basado en significancia
  - Opcional: migrar automáticamente presupuesto al ganador
- Verificar si la plataforma soporta split nativo (Google Ads: experiments, Meta: no nativo)
  - Para Meta: crear 2 campañas separadas y comparar
  - Para Google: usar Campaign Experiments API

### Agente 2 — Significance Calculator
- Fórmula chi-cuadrado:
  ```
  χ² = Σ((O-E)²/E)
  ```
  donde O = observado, E = esperado
- Calcular p-value y comparar con threshold configurable (default 0.95)
- Resultado: `{ winner, confidence, significant, recommendations }`

### Agente 3 — Declaración Automática Opcional
- Opción en el test: "declarar ganador automáticamente al alcanzar significancia"
- Si está activa: el evaluador (Fase 5) también verifica tests abiertos
- Al declarar ganador: migrar presupuesto, pausar variante perdedora, notificar

### ✅ Checkpoint 6
A/B tests funcionales con cálculo de significancia estadística, declaración automática opcional.

---

## Fase 7 — Analytics y Dashboard

### Agente 1 — API de Analytics
Endpoint: `GET /api/marketing/ads/analytics`

Parámetros:
- `accountId`, `campaignId`, `startDate`, `endDate`, `granularity` (DAY|WEEK|MONTH)
- `metrics[]` — qué métricas incluir
- `compare` — boolean, comparar con período anterior

Respuesta:
```json
{
  "summary": { "impressions", "clicks", "spend", "conversions", "ctr", "cpc", "cpa", "roas" },
  "series": [ { "date", "impressions", "clicks", "spend" ... } ],
  "byCampaign": [ { "campaignId", "campaignName", "metrics" } ],
  "comparison": { "current", "previous", "change" }
}
```

- Usar consultas directas a `AdDailyMetric` para datos históricos
- Agregación server-side con Prisma groupBy

### Agente 2 — UI Dashboard
Componentes en `components/marketing/ads/dashboard/`:
- `AdsDashboard.tsx` — Layout principal con KPIs
- `AdsKpiCards.tsx` — Cards de gasto, impresiones, clicks, CPC, CTR, ROAS
- `AdsSpendChart.tsx` — Línea de gasto diario (Recharts)
- `AdsPerformanceChart.tsx` — CTR/CPC/CPA por día
- `AdsCampaignTable.tsx` — Tabla con todas las campañas y métricas
- `AdsComparisonPanel.tsx` — Comparativa vs período anterior
- `AdsFiltersBar.tsx` — Selector de cuenta, fechas, plataforma
- `AdsExportButton.tsx` — Exportar a PDF/CSV

### Agente 3 — Exportación
- PDF: usar `jspdf` + `jspdf-autotable` (ya en dependencias)
- CSV: generación server-side con streaming
- Programar reportes recurrentes (opcional): CRON semanal que envía PDF por email

### ✅ Checkpoint 7
Dashboard completo con gráficos, tabla de campañas, filtros, exportación.

---

## Fase 8 — Skills para el agente conversacional

### Agente 1 — Registrar skills
En `lib/skills/index.ts`, registrar todas las skills de marketing-ads.

### Agente 2 — Integrar con Orchestrator
- El `MinimaxOrchestratorAgent` detecta intents de marketing ads
- Ejecuta la skill correspondiente
- Retorna resultado formateado al usuario

### Agente 3 — Registrar intents
En `lib/agents/intents/marketing-intents.ts`, añadir los nuevos intents.

### ✅ Checkpoint 8
El usuario puede decir "pausa la campaña de Facebook que está gastando mucho" y la IA lo ejecuta.

---

## Resumen de agentes

| Fase | Agentes | Descripción |
|------|---------|-------------|
| 1 | 3 | Schema + APIs CRUD + Migración |
| 2 | 4 | Meta + Google + LinkedIn adapters + Factory |
| 3 | 3 | CRON sync + Worker + Rate limiter |
| 4 | 3 | Schedule engine + Budget controller + UI |
| 5 | 5 | Skills + Intents + Reglas + Evaluador + Audit |
| 6 | 3 | AB Test engine + Calculator + Auto-declare |
| 7 | 3 | Analytics API + Dashboard UI + Export |
| 8 | 3 | Registrar skills + Integrar orchestrator + Intents |
| **Total** | **~27 agentes** | |

---

## Checkpoints

1. ✅ Tablas + APIs CRUD funcionales
2. ✅ 3 plataformas conectadas via OAuth
3. ✅ Sincronización automática cada hora
4. ✅ Calendarización y control de budgets operando
5. ✅ IA evaluando y pausando campañas automáticamente
6. ✅ A/B tests con significancia estadística
7. ✅ Dashboard completo con analytics y exportación
8. ✅ Control vía agente conversacional

---

## Infraestructura y Servidor

### Arquitectura de despliegue (50 tenants reales)

```
                            Cloudflare
                               │
                    ┌──────────┴──────────┐
                    │                     │
               VPS Principal         Vercel (opcional)
           (8 vCPU · 16 GB RAM)     · Landing pages
                    │                · Docs / Marketing
           ┌────────┼────────┐       · Webhooks públicos
           │        │        │
       Next.js   Redis     Postgres
       (prod)   (BullMQ)   (datos)
                    │
            Workers BullMQ
         (sync + IA + cron)
```

### Especificación recomendada

| Recurso | Mínimo (inicio) | Recomendado (50 tenants) | Justificación |
|---------|:---------------:|:------------------------:|---------------|
| **CPU** | 4 vCPU | 8 vCPU | Sync cada hora: 150 jobs paralelos. Evaluador IA cada 30 min. Peticiones HTTP concurrentes de 50 tenants |
| **RAM** | 8 GB | 16 GB | Next.js ~2-3 GB · Redis ~2 GB · Postgres cache ~4 GB · BullMQ workers ~2 GB · AI engine ~1-2 GB · Sistema ~1 GB |
| **Storage** | 40 GB SSD | 80 GB SSD | SO ~10 GB · App + logs ~5 GB · Métricas diarias ~36 GB/año (200 KB/día/campaña × 50 tenants × 10 campañas) |
| **Redis** | En VPS | En VPS | BullMQ + cache. ~2 GB RAM. Persistencia RDB opcional |
| **Postgres** | En VPS | En VPS | ~4 GB RAM para cache de índices. SSD para escritura de métricas |

### Proveedor sugerido

| Proveedor | Plan | Especificación | Costo aprox/mes |
|-----------|------|---------------|:---------------:|
| **Hetzner** | CX52 | 8 vCPU · 16 GB RAM · 80 GB SSD | ~40 € |
| **Hetzner** | CX32 | 4 vCPU · 8 GB RAM · 40 GB SSD | ~25 € |
| **Netcup** | RS 2000 G11 | 8 vCPU · 16 GB RAM · 256 GB SSD | ~30 € |
| **Contabo** | Cloud VPS L | 8 vCPU · 16 GB RAM · 200 GB SSD | ~26 € |

### Alternativa serverless (Vercel + servicios externos)

Si se prefiere no administrar servidor:

| Servicio | Plan | Costo aprox/mes |
|----------|------|:---------------:|
| Vercel | Pro (para crons adicionales) | ~20 $ |
| Upstash Redis | Pay-as-you-go (~50 MB) | ~5-10 $ |
| Neon Postgres | Scale (~2 GB) | ~20 $ |
| **Total** | | **~45-50 $/mes** |

*Más caro que un VPS, pero cero administración.*

### Stack de servicios en el VPS

| Componente | Tecnología | Puerto | Notas |
|------------|-----------|:------:|-------|
| **Web server** | Next.js (Node 22) | 3000 | SSR + API routes |
| **Proxy reverso** | Caddy o Nginx | 80/443 | TLS automático con Caddy |
| **Base de datos** | PostgreSQL 16 | 5432 | Misma máquina para empezar |
| **Cache/Queue** | Redis 7 | 6379 | BullMQ + session cache |
| **Workers** | BullMQ worker (Node) | interno | Procesa sync + jobs IA |
| **Cron** | node-cron | interno | Dispara jobs en BullMQ |
| **Monitoreo** | pm2 + uptime-kuma | 3001 | Gestión de procesos + health checks |

### Crecimiento futuro

| Hito | Acción |
|------|--------|
| 100+ tenants | Postgres a servidor dedicado o RDS |
| 300+ tenants | Redis separado a server dedicado |
| 500+ tenants | Workers en máquina separada + autoescalado |
| 1000+ tenants | Multi-región, read replicas Postgres, Redis cluster |

### Provisionamiento inicial (checklist)

- [ ] Contratar VPS (Hetzner CX52 recomendado)
- [ ] Instalar Docker + Docker Compose
- [ ] Desplegar: Next.js (build + pm2), Redis, Postgres
- [ ] Configurar Caddy con TLS wildcard (`*.volkern.app`)
- [ ] Migrar base de datos (`prisma migrate deploy`)
- [ ] Configurar variables de entorno para cada plataforma Ads
- [ ] Activar workers BullMQ como servicio systemd
- [ ] Monitoreo con uptime-kuma + alertas Telegram
- [ ] Backup diario Postgres (pg_dump + S3)

---

*Documento generado el 17/07/2026. Para ejecutar este plan, volver a este archivo y solicitar: "Aplicar plan Marketing Ads desde Fase 1".*
