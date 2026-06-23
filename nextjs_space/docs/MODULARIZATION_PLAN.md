# Plan de Modularización - Volkern Next.js

## Estado Actual (Actualizado: May 2026)

| Métrica | Valor |
|--------|-------|
| Build output (standalone) | **160 MB** (vs ~483MB pre-optimización, -67%) |
| First Load JS (shared) | **89.2 kB** |
| Route más pesada | `/dashboard/cms/editor/[id]` — 374 kB |
| API routes | 100+ |
| Dependencies | ~180 packages |
| Build time | ~5-10+ min (target <3 min) |
| Tests | 3095 tests, 109 files, 0 fallos |
| Módulos completados | 8 (Inmobiliario, CRM, ERP, Financiero, RRHH, Omnicanal, LMS, Gemma AI) |
| Bundle analyzer | ✅ Reportes en `.next/analyze/` (client.html, edge.html, nodejs.html) |

## Fases de Implementación

### Fase 1: Configuración Inmediata (Quick Wins) — ✅ En Progreso
**Objetivo:** Reducir build time ~30%

- [x] 1.1 Habilitar `output: 'standalone'`
- [x] 1.2 Configurar `experimental.optimizePackageImports` (⚠️ `compileMaxMemory` NO existe en Next.js 14 — ver nota abajo)
- [x] 1.3 Agregar lazy loading a librerías pesadas:
  - `leaflet` → ✅ Ya usaba `dynamic()` en los 3 componentes
  - `reactflow` → ✅ Page-level, Next.js code-splits por ruta automáticamente
  - `react-quill` → ✅ Ya usaba `dynamic()` (verificado)
  - `grapesjs` → ✅ Convertido a `dynamic()` con `ssr: false` en `EditorWorkspace.tsx` (~1MB off initial bundle)
- [x] 1.4 Eliminar dead dependencies (`plotly.js`, `react-plotly.js`, `mapbox-gl` + types)
- [x] 1.5 Excluir rutas no usadas del build (eliminadas 4 rutas test)

### Fase 2: Turborepo + Build Caching ✅ En Progreso
**Objetivo:** Habilitar build caching con Turborepo sin reestructurar el proyecto

- [x] 2.1 Instalar Turborepo v2.9.16
- [x] 2.2 Crear `turbo.json` con pipelines de build caching (build, dev, lint, typecheck, test)
- [ ] 2.3~2.4 Separar en workspaces (apps/, packages/) — pendiente para cuando se requiera

**Estructura elegida:** Single-package con Turborepo. Sin mover archivos. El caché de Turbo acelera builds repetitivos y prepara el terreno para futura separación en workspaces.

### Fase 3: Optimización de Dependencias
**Objetivo:** Reducir tamaño ~50%

- [x] 3.1 Identificar librerías no usadas (completado en Fase 1)
- [x] 3.2 Reemplazar librerías pesadas:
  - `plotly.js` → ❌ ya eliminada (no se usaba)
  - `grapesjs` → usado extensamente (30+ archivos). Mantener, ya lazy-loaded.
  - `puppeteer` → ✅ Reemplazado por `puppeteer-core` + Chrome del sistema (~300MB ahorrado)
- [x] 3.3 Implementar tree-shaking:
  - `@next/bundle-analyzer` instalado y configurado (ANALYZE=true)
  - `outputFileTracingExcludes` configurado: excluye engines CLI de Prisma + docs
  - Tree-shaking adicional vía `experimental.optimizePackageImports` (Fase 1)

### Fase 4: Dockerización ✅ Completado
**Objetivo:** Build reproducible en contenedor

- [x] 4.1 Dockerfile multi-stage (deps → builder → runner)
  - Stage `deps`: node:20-slim + `npm ci --ignore-scripts + npm rebuild esbuild`
  - Stage `builder`: Prisma generate + Next.js build (standalone)
  - Stage `runner`: node:20-slim + Chromium para PDFs + solo output standalone
  - HEALTHCHECK, non-root user, multi-stage (~300MB savings)
  - Chromium packages: solo `chromium` (Debian Bookworm no tiene `chromium-common`/`chromium-sandbox` como paquetes separados)
- [x] 4.2 Entrypoint script (`scripts/docker-entrypoint.sh`):
  - Espera a PostgreSQL con Node.js net module (30 intentos)
  - Ejecuta `prisma migrate deploy` con fallback a `db push`
  - Seed opcional vía `SEED_ON_START` env var
  - `exec "$@"` para señales correctas
- [x] 4.3 `.dockerignore` actualizado con exclusiones para build óptimo

---

## ⚠️ Nota: `experimental.compileMaxMemory`

**NO existe en Next.js 14.** Esta configuración era una sugerencia del plan original pero no forma parte de la API de Next.js.

**Alternativa real usada:** `experimental.optimizePackageImports` — optimiza imports de librerías con barrel exports (lucide-react, lodash, date-fns) transformándolos automáticamente en imports por módulo.

Para manejar memoria durante el build, usar `NODE_OPTIONS`:
```bash
NODE_OPTIONS="--max-old-space-size=8192" yarn build
```
(ya configurado en `package.json` script `typecheck`)

---

## Implementación Fase 1

### 1.1 standalone mode ✅ Habilitado
```javascript
// next.config.js
output: 'standalone',
```
Crea una carpeta autocontenida con solo los archivos necesarios para producción. Ideal para VPS/Docker.

### 1.2 optimizePackageImports ✅ Habilitado
```javascript
// next.config.js
experimental: {
  optimizePackageImports: ['lucide-react', 'lodash', 'date-fns'],
}
```
Transforma imports barrel en imports por módulo automáticamente.

### 1.3 Dead Dependencies ✅ Eliminadas
| Paquete | Razón |
|---------|-------|
| `plotly.js` (2.35.3) | 0 imports en código fuente |
| `react-plotly.js` (2.6.0) | 0 imports en código fuente |
| `@types/plotly.js` (2.35.5) | Type no usado |
| `@types/react-plotly.js` (2.6.3) | Type no usado |
| `mapbox-gl` (1.13.3) | 0 imports en código fuente |

### 1.4 Lazy Loading ✅ Completado
- **`grapesjs`**: Convertido a `dynamic()` con `ssr: false` en `EditorWorkspace.tsx` (~1MB off initial bundle)
- **`leaflet`**: ✅ Ya usaba `dynamic()` en los 3 componentes (verificado)
- **`reactflow`**: ✅ Page-level, Next.js code-splits por ruta automáticamente (verificado)
- **`react-quill`**: ✅ Ya usaba `dynamic()` (verificado)
- **`puppeteer`**: Solo en scripts, no afecta build de Next.js (sin cambios)
- **`tesseract.js`**: Solo en 1 API route, carga on-demand (sin cambios)

### 1.5 Rutas No Usadas ✅ Eliminadas
Se identificaron y eliminaron 4 rutas de API que eran exclusivamente para desarrollo/testing y no tenían referencias externas:

| Ruta | Propósito | Referencias externas |
|------|-----------|---------------------|
| `/api/test-host` | Debug info del host | 0 |
| `/api/test-post` | Echo POST endpoint | 0 |
| `/api/test-db` | Test de conexión DB | 0 |
| `/api/test-classifier` | Test de clasificación AI | 0 |

**Mantenida:** `/api/docs` (Swagger UI) — útil como documentación interactiva de API.

---

## Timeline Estimado

| Fase | Tiempo | Impacto | Estado |
|------|--------|---------|--------|
| Fase 1 | 1-2 días | -30% build | ✅ Completado |
| Fase 2 (light) | 1 día | Build caching | ✅ Completado |
| Fase 3 | 1 semana | -30% bundle (~300MB) | ✅ Completado |
| Fase 4 | 1-2 semanas | -70% deploy | ✅ Completado |
| CI/CD | 1 día | Deploy manual a Vercel (CLI) | ✅ Documentado en `docs/DEPLOY.md` |

---

## Riesgo y Mitigación

| Riesgo | Mitigation |
|--------|-------------|
| Breaking changes | Testing exhaustivo (842+ tests) |
| `standalone` rompe paths dinámicos | Verificar trace con `outputFileTracingIncludes` |
| Performance runtime | Benchmarks antes/después |

---

## Bundle Analysis (ANALYZE=true npm run build) ✅

### Resultados post-optimización

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| standalone (deployable) | ~483 MB (con puppeteer) | **160 MB** | **-67%** |
| First Load JS shared | ~120 kB (estimado) | **89.2 kB** | **-26%** |

### Top 5 rutas más pesadas
| Ruta | Tamaño |
|------|--------|
| `/dashboard/cms/editor/[id]` | 374 kB (grapesjs lazy-loaded) |
| `/p/[tenantSlug]/[pageSlug]` | 357 kB (Puck + CMS runtime) |
| `/dashboard/rrhh` | 294 kB |
| `/dashboard/marketing` | 277 kB |
| `/dashboard/configuracion/api-keys` | 257 kB |

### Bugs pre-existentes corregidos en el proceso
1. **Conflicto de rutas dinámicas:** `app/p/[slug]` vs `app/p/[tenantSlug]` coexistían en el mismo nivel con diferentes nombres de parámetro. Movido `[slug]/propiedades/` dentro de `[tenantSlug]/propiedades/` y unificado como `tenantSlug`.
2. **Async IIFE inválida:** `...(await (async () => {...}))()` dentro de spread de objeto literal en `app/api/public/real-estate/contact/route.ts`. Separado en fetch + update.

---

## Done Criteria

- [ ] Build < 3 minutos
- [x] Bundle standalone: **160 MB** (target <100 MB — progreso significativo)
- [ ] Deploy sin timeout
- [x] Todos los tests pasando (3095 tests, 0 fallos)

---

## docker-compose.yml ✅ Creado

`docker-compose.yml` orquesta 3 servicios para desarrollo local:

| Servicio | Imagen | Puerto |
|----------|--------|-------|
| `postgres` | postgres:16-alpine | 5432 |
| `app` | build desde Dockerfile | 3000 |
| `apprise` | lc1332/chat-harvester (extiende docker-compose.apprise.yml) | 8000 |

**Características:**
- `postgres` con healthcheck (`pg_isready`) y volumen persistente
- `app` depende de `postgres: service_healthy` — no arranca hasta que DB esté lista
- `ALLOW_DB_PUSH` y `SEED_ON_START` configurables vía `.env`
- Red compartida `volkern-network` con el servicio apprise existente

**Uso:**
```bash
docker compose up -d
docker compose logs -f app
docker compose down -v  # Bajar + borrar volúmenes
```

---

## .env.example ✅ Creado

**Archivo:** `.env.example` — 60 variables organizadas en 20 categorías, mapeadas desde 184 referencias `process.env` en el código fuente.

| Categoría | Variables clave |
|-----------|----------------|
| Core | DATABASE_URL, NEXTAUTH_SECRET, CRON_SECRET |
| Docker | POSTGRES_USER, ALLOW_DB_PUSH, SEED_ON_START |
| AWS/S3 | AWS_REGION, AWS_ACCESS_KEY_ID, AWS_BUCKET_NAME |
| AWS SES | AWS_SES_USER, AWS_SES_PASSWORD, EMAIL_FROM |
| Seguridad | MASTER_KEY, FISCAL_ENCRYPTION_KEY, JWT secrets |
| Stripe/n8n/Chatwoot | Webhooks, URLs, API keys |
| Meta/Plaid/Nordigen | OAuth, banking integrations |
| Canva/AI/Evolution | Creative, AI, WhatsApp APIs |
| AEAT | Certificado digital fiscal |
| App Móvil | EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WEB_URL |

---

## CI/CD Pipeline ✅ Creado

**Archivo:** `.github/workflows/docker.yml`

| Disparador | Acción |
|-----------|--------|
| `push` a `master` | Build + push a Docker Hub (`volkern/app:latest` + `volkern/app:<sha>`) |
| `push` tag `v*.*.*` | Build + push con tag semver (`volkern/app:1.2.3`) |
| `pull_request` a `master` | Build (sin push) + tests |

**Secretos requeridos:**
| Secreto | Valor |
|---------|-------|
| `DOCKER_USERNAME` | Usuario de Docker Hub |
| `DOCKER_PASSWORD` | Token de acceso de Docker Hub |

**Características:**
- Buildx con cache `type=gha` (GitHub Actions cache) — build incremental
- Multi-tag: `latest` + commit SHA + tags semver
- Solo hace push en `master` y tags, no en PRs
- Job independiente `test` para ejecutar tests paralelamente
- `provenance: false` evita metadatos SBOM que ralentizan el build