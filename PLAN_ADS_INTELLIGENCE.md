# Plan de Implementacion: ADS Intelligence Module para Volkern

> **Fecha:** 18 de julio de 2026

---

## Resumen Ejecutivo

Modulo completo de campanas de anuncios pagados (ADS) dentro de Volkern que permitira planificar, controlar, optimizar y automatizar campanas en Meta Ads, Google Ads, LinkedIn Ads y TikTok Ads desde un solo lugar, con IA para recomendaciones y auto-apagado de campanas no rentables.

**Objetivo:** Single Pane of Glass para toda la inversion publicitaria digital.

---

## Fase 0: Diagnostico

### Ya existe en Volkern (reutilizable)

| Componente | Archivos clave |
|------------|----------------|
| Campaign multicanal con estados, tracking, metricas | prisma/schema.prisma (Campaign, CampaignMessage, CampaignExecution, CampaignMetrics) |
| Email Campaigns con ROI, A/B testing | EmailCampaign, app/api/email-campanas/ |
| Social Posts multi-plataforma organica | SocialPost, SocialAnalytics, SocialPlatformConfig |
| Social Platform Config (OAuth + Vault) | lib/marketing/social-media-service.ts |
| Automation Engine (12 acciones de marketing) | lib/automation/actions/marketing.ts |
| Marketing Skills IA | lib/skills/marketing-skills.ts |
| Marketing Dashboard con KPIs | components/hubs/MarketingDashboard.tsx |
| Gemma Asistente IA | lib/agents/, lib/skills/ |
| Infraestructura BullMQ + Redis + CRON + Vault | lib/core/, lib/workers/ |

### No existe (construir desde cero)

| Componente | Descripcion |
|------------|-------------|
| Modelos de ADS | AdPlatformConnection, AdCampaign, AdSet, Ad, AdInsight, AdBudgetRule, AdRecommendation |
| Conectores a APIs | Meta Ads API, Google Ads API, LinkedIn Ads API, TikTok Ads API |
| Motor de sincronizacion | Sync engine con CRON + BullMQ |
| Budget Watchdog | Auto-apagado basado en condiciones de rendimiento |
| Predictor con IA | Prediccion de CPA, ROAS, CTR usando historico + IA |
| Recomendaciones con IA | Sugerencias de optimizacion de presupuesto, targeting, creativos |
| Dashboard de ADS | Centro de comando unificado con metricas en tiempo real |
| Automatizacion ADS | Nuevos triggers y acciones en automation-engine |
---

## Fase 1: Modelos de Datos (Prisma)

8 nuevos modelos en prisma/schema.prisma:

### AdPlatformConnection
Conexion OAuth a cada plataforma de anuncios.
- Campos: id, tenantId, platform (META|GOOGLE|LINKEDIN|TIKTOK), accountId, accountName
- accessToken (cifrado en Vault), refreshToken, tokenExpiresAt
- status (CONNECTED|EXPIRED|DISCONNECTED|ERROR), metadata (Json), lastSyncedAt, createdAt, updatedAt
- Relaciones: adCampaigns AdCampaign[], adInsights AdInsight[]
- Unico: [tenantId, platform, accountId]

### AdCampaign
Campana de anuncios en una plataforma.
- Campos: id, tenantId, platformId, externalId, name, status (ACTIVE|PAUSED|ARCHIVED|DELETED)
- objective (CONVERSIONS|TRAFFIC|AWARENESS|LEAD_GENERATION), dailyBudget, lifetimeBudget
- startDate, endDate, bidStrategy, bidAmount, optimizationGoal, trackingTemplate
- isVolkernManaged (boolean), createdAt, updatedAt, syncedAt
- Relaciones: platform, adSets AdSet[], adInsights AdInsight[], budgetAlerts AdBudgetAlert[]

### AdSet
Ad set en Meta / ad group en Google.
- Campos: id, campaignId, externalId, name, status, dailyBudget, lifetimeBudget
- bidAmount, bidStrategy, targeting (Json), placements (Json), startDate, endDate, createdAt, updatedAt

### Ad
Anuncio individual (creative + copy).
- Campos: id, adSetId, externalId, name, status, creativeType (IMAGE|VIDEO|CAROUSEL|COLLECTION|TEXT)
- creativeUrl, headline, primaryText, callToAction, destinationUrl, displayUrl, imageHash, videoId, thumbnailUrl

### AdInsight
Metricas historicas por intervalo diario.
- Campos: id, tenantId, platformId, campaignId?, adSetId?, adId?
- dateStart, dateEnd, impressions, clicks, spend, reach, frequency, cpc, cpm, ctr
- conversions, conversionRate, cpa, roas, revenue, leads, costPerLead, qualityRank
- engagementRate, videoPlays, videoAvgWatchTime, canvas (Json), createdAt
- Indices: [tenantId, platformId, dateStart], [campaignId, dateStart], [platformId, dateStart]

### AdBudgetRule
Regla de auto-apagado basada en condiciones de rendimiento.
- Campos: id, tenantId, name, description, isActive, scope (CAMPAIGN|AD_SET|AD|ACCOUNT)
- scopeId?, condition (Json: metric, operator, value, window), action (PAUSE|REDUCE_BUDGET_PERCENTAGE|NOTIFY_ONLY)
- actionValue?, cooldownHours (default 24), lastTriggeredAt, executionCount, createdAt, updatedAt

### AdBudgetRuleExecution
Log de cada ejecucion de una regla de watchdog.
- Campos: id, ruleId, campaignId?, adSetId?, adId?, condition (Json), metricCurrent, metricThreshold
- action, actionResult (SUCCESS|FAILED|SKIPPED), actionDetail, previousBudget?, newBudget?
- previousStatus?, newStatus?, executedAt

### AdRecommendation
Recomendaciones generadas por IA.
- Campos: id, tenantId, campaignId?, adSetId?, adId?
- type (BUDGET|TARGETING|CREATIVE|BID|SCHEDULE|PLATFORM), title, description, impact (HIGH|MEDIUM|LOW)
- confidence (Float), metric, projectedValue, currentValue, implementation (Json)
- isApplied, isDismissed, appliedAt, createdAt
---

## Fase 2: Conectores a Plataformas ADS

### Interfaz comun (lib/ads/types.ts)

Interfaz AdPlatformConnector con metodos:
- connect(tenantId): Iniciar conexion OAuth
- disconnect(tenantId): Cerrar conexion
- syncCampaigns(tenantId, platformId): Sincronizar estructura de campanas
- syncInsights(tenantId, platformId, dateFrom, dateTo): Sincronizar metricas
- pauseCampaign(campaignId, externalId): Pausar campana en la plataforma
- resumeCampaign(campaignId, externalId): Reanudar campana
- updateBudget(campaignId, externalId, budget): Actualizar presupuesto
- createCampaign(tenantId, data): Crear campana en la plataforma

### Conectores

| Conector | API | Autenticacion | Archivo |
|----------|-----|---------------|---------|
| Meta Ads | Graph API v22 | OAuth + Long-lived tokens (60d) + renovacion | lib/ads/connectors/meta-ads.ts |
| Google Ads | Google Ads API | OAuth + Developer Token + GAQL | lib/ads/connectors/google-ads.ts |
| LinkedIn Ads | LinkedIn Marketing API | OAuth 2.0 con 2FA | lib/ads/connectors/linkedin-ads.ts |
| TikTok Ads | TikTok Ads API | OAuth + Access Token | lib/ads/connectors/tiktok-ads.ts |

### Registro centralizado (lib/ads/connectors/index.ts)
Registry CONNECTORS: Record<platform, AdPlatformConnector> con factory function getConnector(platform)

---

## Fase 3: Motor de Sincronizacion

Archivo: lib/ads/sync-engine.ts

### Flujo
1. CRON cada 1h dispara sync para todos los tenants con plataformas conectadas
2. Por cada plataforma: syncCampaigns() -> obtiene/actualiza estructura
3. syncInsights() -> metricas diarias de ultimas 24-48h
4. Transformar al modelo unificado AdInsight (upsert)
5. Logging con Pino para auditoria

### Jobs BullMQ

| Queue | Descripcion | Frecuencia |
|-------|-------------|------------|
| ads-sync-campaigns | Sincronizar estructura | Cada 1h |
| ads-sync-insights | Sincronizar metricas | Cada 1h |
| ads-sync-full | Sincronizacion completa | Cada 6h |
| ads-watchdog-evaluate | Evaluar reglas watchdog | Cada 30min |

### Workers (lib/ads/workers/)
- sync-worker.ts: Procesa colas de sincronizacion
- watchdog-worker.ts: Procesa cola de evaluacion de reglas

### CRON (lib/ads/cron/ads-jobs.ts)
Tareas programadas que encolan jobs en BullMQ

---

## Fase 4: Budget Watchdog (Auto-apagado Inteligente)

Archivo: lib/ads/budget-watchdog.ts

### Clase BudgetWatchdog
- evaluateAll(tenantId): Evaluar todas las reglas activas del tenant
- evaluateCampaign(campaignId): Evaluar reglas aplicables a una campana
- evaluateRule(ruleId): Evaluar una regla especifica

### Condiciones Soportadas

| Metrica | Operadores | Descripcion |
|---------|-----------|-------------|
| cpa | >, >=, <, <= | Costo por adquisicion |
| roas | >, >=, <, <= | Retorno sobre inversion |
| ctr | >, >=, <, <= | Click-through rate |
| cpc | >, >=, <, <= | Costo por click |
| spendPerConversion | >, >=, <, <= | Gasto por conversion |
| conversionRate | >, >=, <, <= | Tasa de conversion |
| impressions | >, >=, <, <= | Impresiones |
| frequency | >, >=, <, <= | Frecuencia (cansasio audiencia) |

### Ventanas de Tiempo Configurables
- Horas: 1h, 6h, 12h, 24h
- Dias: 3d, 7d, 14d, 30d
- Personalizado: desde/hasta

### Acciones
| Accion | Comportamiento |
|--------|---------------|
| PAUSE | Pausa via connector de la plataforma |
| REDUCE_BUDGET_PERCENTAGE | Reduce presupuesto diario en X% |
| NOTIFY_ONLY | Solo notifica sin tomar accion |

### Notificaciones
- In-app: Via NotificationCenter existente
- Telegram: Via notifyByTelegram skill
- Email: Via sendNewLeadNotification (patron existente)

### Seguridad
- Cooldown de N horas entre ejecuciones de la misma regla
- Maximo de ejecuciones por periodo configurable
- Solo afecta campanas con isVolkernManaged = true
---

## Fase 5: Predictor de Rendimiento con IA

Archivo: lib/ads/predictor.ts

### Predicciones generadas por campana
Para proximas 24h, 7d, 30d:
- spend (gasto), impressions, clicks, cpc, conversions, cpa, roas
- Cada prediccion incluye: valor estimado + rango de confianza [min, max]
- confidence: nivel de confianza general (0-1)
- anomalyScore: deteccion de anomalias (0-1)

### Algoritmo por niveles de datos
1. < 7 dias: Promedio simple de los dias disponibles
2. 7-30 dias: Media movil ponderada con tendencia lineal
3. > 30 dias: Llamada a OpenRouter/Gemma con serie temporal + contexto de estacionalidad
   - Input: ultimos 60-90 dias de AdInsight
   - Contexto: dia de semana, mes, objetivo de campana, audiencia, presupuesto
   - Output: JSON estructurado con predicciones + intervalo de confianza
4. Deteccion de anomalias: spend real se desvia > 2 desviaciones estandar del promedio

### Skill de IA (lib/skills/ads-skills.ts)
predict_ad_performance(params: campaignId, tenantId): Promise<AdPrediction>

---

## Fase 6: Recomendaciones con IA

Archivo: lib/ads/recommendation-engine.ts

### Skills de IA (lib/skills/ads-skills.ts)

1. suggest_ad_optimizations(tenantId, campaignId?): Analiza ROAS, CPA, CTR, CPC, frecuencia
   -> Sugiere ajustes de presupuesto, targeting, creativos, horarios, pujas

2. suggest_budget_allocation(tenantId, totalBudget, campaigns[]):
   -> Propone distribucion optima del presupuesto entre campanas basado en ROAS historico

3. suggest_audiences(tenantId, campaignId):
   -> Analiza leads convertidos y sugiere audiencias lookalike y segmentaciones optimas

4. generate_ad_copy(platform, product, audience, objective):
   -> Genera headline, primary text y CTA optimizado por plataforma

### Tipos de recomendaciones

| Tipo | Descripcion | Fuente |
|------|-------------|--------|
| BUDGET | Ajustar presupuesto diario | ROAS historico vs gasto actual |
| TARGETING | Refinar segmentacion | Leads convertidos vs audiencia actual |
| CREATIVE | Cambiar creativo / CTRL | CTR por creative, A/B testing |
| BID | Ajustar puja/estrategia | CPC actual vs historico por placement |
| SCHEDULE | Optimizar horario entrega | Conversion rate por hora/dia |
| PLATFORM | Redistribuir entre plataformas | ROAS comparativo entre plataformas |

### Frecuencia
- Automatica: Cada 24h via CRON (ads-generate-recommendations)
- Bajo demanda: Desde la UI por el usuario

---

## Fase 7: API REST

Todas las rutas bajo /api/ads/ con withTenantAuth y permisos RBAC.

### Conexion de plataformas
- POST /api/ads/connect -> Iniciar OAuth
- GET /api/ads/connect/callback -> Callback OAuth
- GET /api/ads/platforms -> Listar plataformas conectadas
- DELETE /api/ads/platforms/:id -> Desconectar plataforma

### Campanas ADS
- GET /api/ads/campaigns -> Listar (filtros: plataforma, estado, objetivo)
- GET /api/ads/campaigns/:id -> Detalle con metricas y ad sets
- POST /api/ads/campaigns -> Crear (opcional: crear en plataforma externa)
- PUT /api/ads/campaigns/:id -> Actualizar
- POST /api/ads/campaigns/:id/pause -> Pausar
- POST /api/ads/campaigns/:id/resume -> Reanudar
- POST /api/ads/campaigns/:id/sync -> Forzar sincronizacion

### Insights y metricas
- GET /api/ads/insights -> Metricas agregadas (filtros: fecha, plataforma, campana)
- GET /api/ads/insights/summary -> Resumen ejecutivo (gasto total, ROAS, CPA)
- GET /api/ads/insights/daily -> Serie temporal por dia

### Watchdog (auto-apagado)
- GET /api/ads/watchdog/rules -> Listar reglas
- POST /api/ads/watchdog/rules -> Crear regla
- PUT /api/ads/watchdog/rules/:id -> Actualizar
- DELETE /api/ads/watchdog/rules/:id -> Eliminar
- POST /api/ads/watchdog/evaluate -> Evaluar reglas manualmente
- GET /api/ads/watchdog/logs -> Historial de ejecuciones

### Predictivo
- GET /api/ads/predict/:campaignId -> Prediccion de rendimiento

### Recomendaciones
- GET /api/ads/recommendations -> Recomendaciones activas
- POST /api/ads/recommendations/:id/apply -> Aplicar recomendacion
- POST /api/ads/recommendations/:id/dismiss -> Descartar
- POST /api/ads/recommendations/generate -> Generar nuevas recomendaciones

### Permisos RBAC nuevos
| Permiso | Alcance |
|---------|--------|
| ads:read | Ver campanas, metricas, recomendaciones |
| ads:write | Crear/editar campanas y reglas |
| ads:manage | Conectar/desconectar plataformas, pausar/reanudar |
| ads:admin | Gestion completa, modificar budgets, auto-gestion |
---

## Fase 8: Interfaz de Usuario

Ruta del dashboard: /[tenant]/dashboard/ads/

### Componentes (components/ads/)

| Componente | Proposito |
|------------|----------|
| AdsDashboard.tsx | Centro de comando principal con KPIs y graficos |
| CampaignsTable.tsx | Tabla de campanas con metricas en vivo |
| CampaignDetail.tsx | Detalle de campana con graficos y desglose |
| CampaignForm.tsx | Formulario de creacion/edicion |
| InsightsChart.tsx | Grafico de metricas en timeline (Recharts) |
| PlatformConnector.tsx | Wizard de conexion OAuth |
| WatchdogRulesList.tsx | Lista de reglas de auto-apagado |
| WatchdogRuleForm.tsx | Formulario de creacion/edicion de reglas |
| WatchdogLogTimeline.tsx | Timeline de ejecuciones de reglas |
| RecommendationCard.tsx | Tarjeta de recomendacion individual |
| RecommendationList.tsx | Lista de recomendaciones priorizadas |
| KpiCard.tsx | Tarjeta KPI con sparkline |
| BudgetGauge.tsx | Medidor de presupuesto vs gastado |
| PlatformBadge.tsx | Badge de plataforma (Meta, Google, etc.) |
| PredictionChart.tsx | Grafico con predicciones (linea punteada) |

### Paginas
- ads/page.tsx -> AdsDashboard
- ads/campaigns/page.tsx -> CampaignsTable
- ads/campaigns/[id]/page.tsx -> CampaignDetail
- ads/watchdog/page.tsx -> WatchdogRulesList
- ads/recommendations/page.tsx -> RecommendationList

---

## Fase 9: Automatizacion del Engine de Volkern

### Nuevas acciones (lib/automation/actions/ads.ts)
- pauseAdCampaign: Pausar campana ADS por regla de watchdog
- adjustAdBudget: Ajustar presupuesto de campana ADS
- syncAdPlatform: Forzar sincronizacion con plataforma ADS
- generateAdReport: Generar reporte de rendimiento ADS
- applyAdRecommendation: Aplicar recomendacion de IA a campana ADS

### Nuevos triggers (lib/automation/constants.ts)
- ads.campaign_completed: Campana alcanzo fecha fin
- ads.budget_exceeded: Gasto supero presupuesto en X%
- ads.roas_below_threshold: ROAS cayo bajo umbral
- ads.cpa_above_threshold: CPA supero umbral
- ads.new_recommendation: Nueva recomendacion de IA
- ads.watchdog_triggered: Regla de watchdog se ejecuto

---

## Fase 10: Estimacion y Cronograma

### Estimacion de esfuerzo

| Fase | Descripcion | Dias |
|------|-------------|------|
| 1 | Modelos de datos + migracion Prisma | 1 |
| 2a | Conector Meta Ads | 2 |
| 2b | Conector Google Ads | 2 |
| 2c | Conectores LinkedIn + TikTok | 1.5 |
| 3 | Motor de sincronizacion + BullMQ | 1.5 |
| 4 | Budget Watchdog | 1.5 |
| 5 | Predictor de rendimiento con IA | 2 |
| 6 | Recomendaciones con IA | 2 |
| 7 | API REST (todos los endpoints) | 2 |
| 8 | UI (componentes y paginas) | 3 |
| 9 | Automatizacion + notificaciones | 1 |
| - | Tests | 2 |
| - | Documentacion | 0.5 |
| **Total** | | **~22 dias** |

### Distribucion sugerida (4.5 semanas)

| Semana | Fases | Enfoque |
|--------|-------|---------|
| Semana 1 | 1-3 | Modelos, conectores Meta+Google, sync engine |
| Semana 2 | 3-4 | Sincronizacion, watchdog, LinkedIn+TikTok |
| Semana 3 | 5-7 | IA predictor, recomendaciones, API REST |
| Semana 4 | 8-10 | UI, automatizacion, tests, documentacion |

---

## Resumen de Archivos

### Nuevos archivos (~28)

prisma/schema.prisma (+8 modelos)

lib/ads/
  types.ts
  sync-engine.ts
  budget-watchdog.ts
  predictor.ts
  recommendation-engine.ts
  connectors/base.ts, index.ts, meta-ads.ts, google-ads.ts, linkedin-ads.ts, tiktok-ads.ts
  workers/sync-worker.ts, watchdog-worker.ts
  cron/ads-jobs.ts

lib/skills/ads-skills.ts
lib/agents/intents/ads-intents.ts
lib/automation/actions/ads.ts
lib/validation/schemas/ads.ts

app/api/ads/ (~22 endpoints REST)

components/ads/ (~15 componentes UI)

app/[tenant]/dashboard/ads/ (~5 paginas)

### Archivos a modificar (~5)

lib/automation/actions/index.ts -> Registrar ADS_ACTIONS
lib/automation/constants.ts -> Agregar triggers ADS
lib/permissions.ts -> Agregar permisos ads:*
lib/navigation-config.ts -> Agregar ruta ADS en sidebar
components/hubs/MarketingDashboard.tsx -> Enlace a ADS

---

## Notas Tecnicas

### Autenticacion OAuth por plataforma
- Meta Ads: Long-lived tokens (60d) con renovacion automatica via refresh
- Google Ads: OAuth 2.0 + Developer Token (solicitud a Google)
- LinkedIn Ads: OAuth 2.0 con soporte 2FA
- TikTok Ads: OAuth 2.0 con Access Token

### Rate Limits
- Meta: 200 llamadas/hora por ad account
- Google: 50,000 operaciones/dia por cliente
- LinkedIn: 100 llamadas/dia por usuario
- TikTok: 10 llamadas/segundo

### Costos de API
Todas las APIs de anuncios son gratuitas. Google Ads requiere Developer Token.

### Seguridad
- Tokens cifrados en VaultService.encrypt()
- Secrets OAuth en .env (ADS_META_CLIENT_ID, ADS_META_CLIENT_SECRET, etc.)
- Permisos granulares por rol: ads:read, ads:write, ads:manage, ads:admin

### Stack a reutilizar
- BullMQ + Redis (ya existe)
- VaultService (lib/security/vault.ts)
- Pino logger (ya existe)
- withTenantAuth (ya existe)
- Rate limiter existente
- OpenRouter para llamadas IA (ya integrado)
- Recharts para graficos (ya integrado)
- shadcn/ui para componentes base (ya integrado)

---