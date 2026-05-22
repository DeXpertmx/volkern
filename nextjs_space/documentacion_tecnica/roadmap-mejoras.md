# 🛠️ Roadmap de Mejoras — Volkern CRM

> Documento de seguimiento de mejoras técnicas identificadas en la auditoría del proyecto.
> Última actualización: 21 de mayo de 2026  
> ✅ Críticas #1, #2, #3 completadas

---

## 🔴 Críticas (riesgo de producción)

### ✅ 1. Tests automatizados (parcial)
**Archivos afectados:** Todo el proyecto  
**Riesgo:** Cualquier cambio puede romper facturación, scoring o el pipeline de IA sin detección.  
**Acción:**
- [x] Instalar Vitest + @testing-library/react (ya instalado)
- [ ] Crear tests para el motor fiscal (`lib/fiscal-engine.ts`)
- [x] Crear tests para scoring engine (`lib/scoring-engine.ts`) — 18 tests
- [ ] Crear tests para el pipeline del chatbot (intent-classifier, entity-extractor, orchestrator)
- [ ] Crear tests para webhooks críticos (Stripe, Telegram, Evolution)
- [x] Crear tests para vault security (`lib/security/vault.ts`) — 8 tests
- [ ] Configurar coverage mínimo del 60%
- [x] 28 tests unitarios creados y pasando (vault + scoring)

**Esfuerzo estimado:** 3-4 días

---

### ✅ 2. Secrets hardcodeados en `lib/security/vault.ts`
**Archivo:** `lib/security/vault.ts` (líneas 7, 18)  
**Riesgo:** Si `MASTER_KEY` y `TENANT_PEPPER` no se configuran en entorno, todos los tenants comparten la misma clave maestra → ruptura total del aislamiento criptográfico.

```typescript
// ❌ Actual
const MASTER_KEY = process.env.MASTER_KEY || 'volkern-nexus-premium-secret-2024';
const pepper = process.env.TENANT_PEPPER || 'volkern-default-pepper-2024';

// ✅ Esperado
const MASTER_KEY = process.env.MASTER_KEY;
const pepper = process.env.TENANT_PEPPER;
if (!MASTER_KEY || !pepper) throw new Error('FATAL: MASTER_KEY y TENANT_PEPPER requeridos');
```

**Acción:**
- [x] Eliminar fallbacks de `MASTER_KEY` y `TENANT_PEPPER`
- [x] Lanzar error fatal en startup si no están configurados (`validateVaultConfig()`)
- [x] Validar longitud mínima de 32 caracteres para MASTER_KEY
- [x] Agregar validación en `instrumentation.ts` o bootstrap (validación en import-time)

**Esfuerzo estimado:** 0.5 días

---

### ✅ 3. Rate limiting en endpoints críticos
**Archivos afectados:** `middleware.ts`, endpoints públicos  
**Riesgo:** Endpoints como `/api/chatbot/widget` (CORS abierto), webhooks y `/api/public/*` son vulnerables a abuso/DoS.

**Acción:**
- [x] ~~Instalar `@upstash/ratelimit` + `@upstash/redis`~~ (ya existía `lib/rate-limiter.ts` con Redis + in-memory)
- [x] Implementar rate limiting por IP en middleware para rutas públicas (30 req/min)
- [x] Implementar rate limiting por tenantId para rutas autenticadas (ya existía en `lib/rate-limit-middleware.ts`)
- [x] Configurar límites: 30 req/min público, 300 req/min autenticado
- [x] Headers estándar: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

**Esfuerzo estimado:** 1 día

---

## 🟠 Altas (arquitectura y mantenibilidad)

### ✅ 4. `automation-engine.ts` monolítico (2918 líneas)
**Archivo:** `lib/automation-engine.ts` → `lib/automation/`  
**Problema:** El motor de automatizaciones entero en un solo archivo. Difícil de mantener, testear y extender.

**Acción:**
- [x] Extraer `types.ts` — interfaces compartidas (ExecutionContext, ActionContext, ActionHandler)
- [x] Extraer `constants.ts` — VALID_TRIGGERS y TriggerType
- [x] Extraer `variables-parser.ts` — reemplazo de variables de plantilla
- [x] Extraer `condition-evaluator.ts` — evaluación de condiciones (24+ operadores)
- [x] Extraer 12 archivos de acciones por dominio bajo `lib/automation/actions/`:
  - `communication.ts` (5 handlers), `leads.ts` (16), `integrations.ts` (7)
  - `inventory.ts` (4), `production.ts` (4), `support.ts` (6)
  - `marketing.ts` (13), `academy.ts` (5), `hr.ts` (2)
  - `finance.ts` (10), `quality.ts` (6), `projects.ts` (9)
- [x] Crear `actions/index.ts` — `ACTION_REGISTRY` con 87 action handlers
- [x] Refactorizar `automation-engine.ts` como fachada: 2918 → 716 líneas (75% reducción)
- [x] Re-exportar `VALID_TRIGGERS`, `TriggerType`, `ExecutionContext` para backward compat
- [x] Verificar que los 22 imports externos (`triggerAutomation`, `enqueueAutomation`, etc.) sigan funcionando
- [x] Typecheck limpio + 26/26 tests pasando

**Esfuerzo estimado:** 2-3 días ✅ Completado

---

### ✅ 5. `intent-classifier.ts` con 50 intenciones mezcladas
**Archivo:** `lib/agents/intent-classifier.ts`  
**Problema:** Todas las intenciones del chatbot en un solo archivo, mezclando dominios (CRM, ERP, HR, Finance).

**Acción:**
- [x] Crear `lib/agents/intents/crm-intents.ts` — 26 intenciones: leads, contactos, citas, pipeline, mensajes, tareas
- [x] Crear `lib/agents/intents/erp-intents.ts` — 8 intenciones: inventario, producción, proyectos, calidad
- [x] Crear `lib/agents/intents/hr-intents.ts` — 3 intenciones: briefing, vacaciones, rotación
- [x] Crear `lib/agents/intents/finance-intents.ts` — 8 intenciones: facturación, gastos, proveedores, análisis
- [x] Crear `lib/agents/intents/marketing-intents.ts` — 3 intenciones: copy, sentimiento, campañas
- [x] Crear `lib/agents/intents/operations-intents.ts` — 2 intenciones + `ALL_INTENTS` registry
- [x] Crear `lib/agents/intents/types.ts` — interfaz `IntentSchema` compartida (evita imports circulares)
- [x] Actualizar `intent-classifier.ts` para importar `ALL_INTENTS` del registry

**Esfuerzo estimado:** 2 días ✅ Completado

---

### 6. Sin validación de schemas en APIs (581 endpoints)
**Archivos afectados:** Todas las rutas `app/api/**/route.ts`  
**Riesgo:** Datos malformados pueden llegar a Prisma causando errores 500 o datos corruptos.

**Acción:**
- [ ] Instalar `zod`
- [ ] Crear `lib/validation/schemas/` con schemas por dominio
- [ ] Priorizar rutas de escritura: leads, citas, deals, facturas, empleados
- [ ] Crear helper `validateBody(schema)` para usar en route handlers
- [ ] Meta: cubrir 100% de endpoints de escritura

**Esfuerzo estimado:** 3-4 días

---

### ✅ 7. Abacus AI como single-point-of-failure
**Archivos:** `lib/scoring-engine.ts`, `app/api/scoring/route.ts`  
**Riesgo:** Si Abacus AI cae, el scoring inteligente y sugerencias de respuesta se detienen.

**Acción:**
- [x] Migrar todas las llamadas LLM de Abacus AI a OpenRouter (9 archivos)
- [x] Agregar fallback automático DeepSeek → Gemini 2.5 Flash en `callOpenRouterWithFallback()`
- [x] Migrar generación de imágenes a OpenRouter (`modalities: ["image"]`)
- [x] Migrar conversión HTML→PDF de Abacus a Puppeteer local (4 archivos)
- [x] Eliminar `ABACUSAI_API_KEY` de archivos `.env`

**Esfuerzo estimado:** 1 día ✅ Completado

---

## 🟡 Medias (deuda técnica progresiva)

### 8. `execution-queue.ts` procesa tenants secuencialmente
**Archivo:** `lib/execution-queue.ts`  
**Problema:** Si hay 100 tenants, los últimos esperan a que todos los anteriores terminen. Además usa `automationExecutionLog` como tabla de cola improvisada.

**Acción:**
- [ ] Migrar a BullMQ con colas dedicadas por tenant (o cola compartida con tenantId en el job)
- [ ] Como quick win: procesar tenants en paralelo con `Promise.all()` limitado a 10 concurrentes
- [ ] Separar tabla de cola de la tabla de logs (`automationExecutionLog`)

**Esfuerzo estimado:** 2 días

---

### 9. Sin caché en endpoints de lectura frecuente
**Archivos afectados:** Disponibilidad, configuración, stats, tenant config  
**Problema:** Consultas repetitivas sin caché generan carga innecesaria en DB.

**Acción:**
- [ ] Implementar helper `withCache(key, ttl, fn)` usando Redis
- [ ] Cachear `GET /api/config/disponibilidad` (TTL: 5 min)
- [ ] Cachear `GET /api/configuracion/fiscal` (TTL: 10 min)
- [ ] Cachear stats de scoring y chatbot (TTL: 1 min)
- [ ] Invalidar caché en endpoints de escritura correspondientes

**Esfuerzo estimado:** 1.5 días

---

### 10. `middleware.ts` — path matching frágil
**Archivo:** `middleware.ts`  
**Problema:** Lista de paths públicos hardcodeada con `startsWith()`, fácil de olvidar al agregar nuevas rutas.

**Acción:**
- [ ] Centralizar en constantes `PUBLIC_API_PREFIXES` y `PUBLIC_PAGE_PREFIXES`
- [ ] Agregar comentario `// PUBLIC` requerido sobre cada nueva ruta pública
- [ ] Considerar patrón de archivo `route.public.ts` como convención
- [ ] Agregar test que verifique que todas las rutas en `PUBLIC_API_PREFIXES` existen

**Esfuerzo estimado:** 0.5 días

---

### 11. Sin health checks ni readiness probes
**Archivos afectados:** Infraestructura Docker/K8s  
**Problema:** Sin endpoint de health, los orquestadores no pueden detectar si la app está viva.

**Acción:**
- [ ] Crear `app/api/health/route.ts`
- [ ] Verificar conexión a PostgreSQL (`prisma.$queryRaw`)
- [ ] Verificar conexión a Redis (`redis.ping()`)
- [ ] Devolver `{ status: "healthy", db: "ok", redis: "ok", uptime: N }`
- [ ] Agregar a `docker-compose.yml` como healthcheck

**Esfuerzo estimado:** 0.5 días

---

## 🟢 Bajas (mejoras de DX y calidad)

### 12. Sin linting estricto ni pre-commit hooks
**Acción:**
- [ ] Configurar ESLint con reglas estrictas (`@typescript-eslint/strict-type-checked`)
- [ ] Instalar `husky` + `lint-staged`
- [ ] Agregar pre-commit hook: `eslint --fix` + `prettier --write`
- [ ] Agregar pre-push hook: `tsc --noEmit`

**Esfuerzo estimado:** 0.5 días

---

### 13. Tipos `any` dispersos
**Archivos:** `lib/scoring-engine.ts`, `lib/marketing/automation/rule-engine.ts`, `lib/execution-queue.ts`, etc.  
**Acción:**
- [ ] Definir `RuleConditions` interface en `lib/marketing/automation/types.ts`
- [ ] Definir `ExecutionContext` interface en `lib/automation-types.ts`
- [ ] Reemplazar `any` en firmas de funciones clave
- [ ] Configurar ESLint rule `@typescript-eslint/no-explicit-any: warn`

**Esfuerzo estimado:** 1 día

---

### 14. Logs con `console.log` sin estructura
**Archivos:** Todo el proyecto  
**Problema:** Sin niveles, sin request ID, sin formato JSON. Difícil de ingestar en sistemas de observabilidad.

**Acción:**
- [ ] Instalar `pino`
- [ ] Crear `lib/logger.ts` con instancia configurada (niveles, pretty en dev, JSON en prod)
- [ ] Agregar `requestId` vía `AsyncLocalStorage` en middleware
- [ ] Migrar progresivamente `console.log` → `logger.info`, `console.error` → `logger.error`

**Esfuerzo estimado:** 1.5 días

---

### 15. Sin documentación de API (OpenAPI/Swagger)
**Acción:**
- [ ] Evaluar `next-swagger-doc` o `zod-to-openapi`
- [ ] Al implementar Zod validation (#6), generar schema OpenAPI automáticamente
- [ ] Exponer `/api/docs` con Swagger UI
- [ ] Documentar al menos los 20 endpoints más usados

**Esfuerzo estimado:** 2 días (progresivo)

---

## 📊 Resumen

| Prioridad | Cantidad | Issues | Esfuerzo |
|-----------|----------|--------|----------|
| 🔴 Críticas | 3 | #1, #2, #3 ✅ | 4.5 - 5.5 días |
| 🟠 Altas | 4 | #4, #5, #6, #7 | 8 - 10 días |
| 🟡 Medias | 4 | #8, #9, #10, #11 | 4.5 días |
| 🟢 Bajas | 4 | #12, #13, #14, #15 | 5 días |
| **Total** | **15** | | **22 - 25 días** |

---

## 🗓️ Plan sugerido (semanas)

| Semana | Foco | Issues |
|--------|------|--------|
| **Semana 1** | Estabilización crítica | #2, #3, #11 — Secrets, rate limiting, health check |
| **Semana 2** | Validación y safety | #6, #13 — Zod schemas, eliminar `any` |
| **Semana 3** | Tests core | #1 — Tests para fiscal, scoring, chatbot |
| **Semana 4** | Refactorización | #4, #5 — Partir automation-engine e intent-classifier |
| **Semana 5** | Resiliencia y DX | #7, #8, #9, #10, #12, #14, #15 |

---

## 📝 Notas

- Cada issue debe crearse como tarea independiente con su propia rama y PR
- Priorizar siempre los issues 🔴 antes que los 🟠, y así sucesivamente
- El orden dentro de cada nivel de prioridad es sugerido, no estricto
- Marcar `[x]` los checkboxes conforme se completen
