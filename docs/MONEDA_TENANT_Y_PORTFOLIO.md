# Moneda del Tenant y Portfolio Ejecutivo de Seguros

Documenta:
- Por qué existe `Tenant.moneda` (la “moneda de reporte”).
- Cómo se usa en `/dashboard/seguros/portfolio` (KPIs, mix por ramo, top aseguradoras, forecast).
- Cómo arreglarla cuando el broker maneja una moneda distinta a la que muestra el dashboard.
- Cómo prevenir regresiones.

## El problema real

Teníamos dos hipotecas visibles:

1. Una póliza en el CRM tiene su **moneda nativa** (`poliza.moneda`, puede ser EUR, USD, MXN…)
2. El tenant tiene una **moneda de reporte** (`tenant.moneda`, único por tenant, default `'MXN'`).

El portfolio ejecutivo (`/dashboard/seguros/portfolio`) siempre muestra los KPIs agregados
(prima total, prima promedio, mix por ramo, top aseguradoras, forecast) en `tenant.moneda`.
Si la cartera tiene pólizas en EUR y el tenant sigue en MXN por defecto, el KPI global
se muestra **convertido y aproximado**, no en la moneda real del broker.

El síntoma típico:

> “Manejamos Euros pero el chip junto al botón ‘Refrescar’ dice MXN,
> y la prima anual total aparece como $15,828 en lugar de ~€850.”

## Cómo está implementado

- Schema (`prisma/schema.prisma:173`):
  ```
  model Tenant {
    ...
    moneda  String  @default("MXN")
    ...
  }
  ```
- Tipos y catálogo FX (`lib/insurance/currency.ts`):
  - `Currency` = `'USD' | 'EUR' | 'MXN' | 'GBP' | 'JPY' | 'CNY' | 'CAD' | 'BRL' | 'CLP' | 'ARS' | 'COP' | 'PEN'`
  - `SUPPORTED_CURRENCIES` (exportada para UI y validación).
  - Tabla FX_TO_USD fija con 12 monedas (pivote USD).
  - `resumenMoneda(polizas, target)` agrega respetando moneda nativa por póliza.
- Endpoint API: `/api/insurance/portfolio` y `/api/insurance/portfolio/forecast*`
  leen `tenant.moneda` del Control Plane (`globalPrisma.tenant.findUnique`).
- Frontend: el chip ` {snapshot.tenantMoneda} ` está en
  `app/dashboard/seguros/portfolio/page.tsx:303` (junto al botón Refrescar).

## Cómo arreglarlo (3 caminos)

### Camino 0 — Prevenirlo en el onboarding (NUEVO 2026-08-03)

El origen del problema es que `Tenant.moneda` defaultea a `'MXN'` y muchos
brokers ni siquiera saben que ese campo existe hasta que ven el chip del
portfolio. Por eso, en el flujo de onboarding de partner tenants
(`scripts/seed-partner-tenants.ts`) y en el endpoint de provisionamiento
(`POST /api/tenants/create`), **se fuerza a pedir la moneda preferida antes
de crear el primer tenant**.

Para 50 tenants demo de staging, ahora:

```bash
# Antes (defaults silenciosos a MXN — pésimo para brokers EUR)
DATABASE_URL=… npx tsx scripts/seed-partner-tenants.ts

# Después — prompt interactivo en TTY
DATABASE_URL=… npx tsx scripts/seed-partner-tenants.ts
#   → aparece menú 1..12 con USD, EUR, MXN, GBP, …
#   → broker elige EUR → los 50 tenants nacen con moneda='EUR'

# CI/CD sin prompt: flag explícito o auto
DATABASE_URL=… npx tsx scripts/seed-partner-tenants.ts --moneda=EUR
DATABASE_URL=… npx tsx scripts/seed-partner-tenants.ts --allow-auto  # default MXN
```

Y el endpoint provisioner (`POST /api/tenants/create`) acepta el campo
opcional `moneda` en el body, validado contra `SUPPORTED_CURRENCIES`.
Si el partner llena el campo en el wizard del admin, el broker nace con
la moneda correcta sin necesidad de revisar el dashboard.

#### Auto-detección al cerrar el loop del `--allow-auto` (NUEVO 2026-08-03)

Si el broker **saltó el prompt** (`--allow-auto` o admin rápido) y aceptó
el default MXN, el auto-fix se dispara **automáticamente al subir el primer
batch de pólizas via wizard**:

1. El broker va a `/dashboard/seguros/polizas` → abre el `ImportEntityWizard`
   → sube su primer CSV con todas las pólizas en EUR.
2. El CSV wizard llama a `POST /api/insurance/importar`. El endpoint:
   - Persiste las pólizas (`insuranceImportLog`).
   - Captura `batchStartTime = new Date()` y, tras el loop exitoso,
     consulta `prisma.poliza.findMany({ where: { tenantId, createdAt >= batchStartTime } })`.
   - Llama a `maybeAutoFixTenantCurrencyAfterImport(tenantId, polizasRecienImportadas)`.
3. El helper decide:
   - Lee `globalPrisma.tenant.findUnique({ where: { id: tenantId } })`.
   - Si `tenant.moneda !== 'MXN'` (ya elegido por el broker) → noop.
   - Si batch vacío → noop.
   - Resuelve via `resolveTenantCurrency` + `groupByMoneda`:
     - Una sola moneda no-MXN → auto-fix.
     - Múltiples monedas → noop (conservador: no asume cuál priorizar).
   - Si auto-fix warranted → actualiza `globalPrisma.tenant.update` +
     escribe `auditLog` con descripcion `"Auto-set desde primer import:
     MXN → EUR (N pólizas importadas, source=system:auto-import-bulk-csv).
     Cooldown de 24h saltado (es auto-fix, no cambio manual)."`
4. La respuesta del endpoint incluye `{ autoFixMoneda: { changed, previousMoneda, appliedMoneda, ... } }`
   para que la UI muestre un toast: *"Tu moneda de reporte se actualizó
   automáticamente a EUR tras el primer import."*

#### Propiedades clave del auto-fix

- **Idempotente**: si el broker sube un segundo batch (mismo tenant), el
  helper detecta `previousMoneda='EUR'` y entra en el branch
  `already-correct` → no hace nada.
- **No rompe el cooldown manual**: el `PATCH /api/tenant/moneda` sigue
  con su cooldown de 24h; el bypass es exclusivo del helper interno.
- **Trazable**: cada auto-fix deja un `auditLog` con `descripcion` que
  permite grep rápido ("¿qué tenants cambiaron moneda por auto-fix?")
  y distinguirlo de cambios manuales del superadmin / broker.
- **Defensivo**: si `auditLog.create` falla, el cambio del tenant NO se
  rollbacka (un fail de auditoría no debe impedir el fix funcional).
- **Pure decision**: la lógica pura vive en `lib/insurance/tenant-currency-resolver.ts`
  y se testea aislada; el helper sólo añade la capa de I/O y bypass.

#### Reglas de auto-detección (referencia rápida)

| Composición de pólizas importadas | Moneda seteada | `source` |
|-----------------------------------|----------------|-----------|
| El usuario pasó moneda explícita (script flag o API body) | Esa moneda | `explicit` |
| Una sola moneda (e.g. 100% EUR) | Esa moneda | `auto-from-polizas` |
| 0 pólizas (aún no importó) | Default conservador (MXN) | `fallback-default` |
| Múltiples monedas (mixto) | Default conservador (MXN) | `fallback-default` |

Por qué "conservador = MXN" en los casos ambiguos: es la moneda histórica
del schema, no rompe nada y el broker puede cambiarla cuando termine de
importar vía `/dashboard/configuracion?section=empresa` (cooldown 24h) o
a través del superadmin (sin cooldown).

### Camino 1 — El propio broker lo arregla desde la UI

1. Ir a `/dashboard/configuracion?section=empresa`.
2. En la nueva tarjeta **“Moneda de Reporte”**, elegir la moneda correcta (EUR, USD…),
   hacer clic en **Guardar Moneda**.
3. La PATCH a `/api/tenant/moneda` actualiza `Tenant.moneda` en el Control Plane
   y registra `auditLog` con `entidad='tenant', descripcion='Moneda del tenant cambiada: ...'`.
4. **Cooldown de 24h** entre cambios (defensivo contra crashloop de UI).
   Si necesitas un cambio urgente antes de las 24h, el superadmin puede saltarse
   el cooldown vía `/admin/tenants/{id}` → edit moneda directo.
5. Recarga el portfolio ejecutivo (`/dashboard/seguros/portfolio`) →
   el chip y todos los KPIs ya muestran la nueva moneda.

### Camino 2 — Diagnóstico + fix por script

Para diagnosticar (sin tocar nada):

```bash
cd nextjs_space
npx tsx scripts/diagnose-tenant-currency.ts
npx tsx scripts/diagnose-tenant-currency.ts --tenant=tudominio
```

El script reporta:
- `tenant.moneda` actual.
- Distribución de `poliza.moneda` en pólizas activas + suma de prima.
- Diagnóstico: ✅ coherente / ⚠️ mismatch claro / 🔀 portfolio multi-divisa.

Para aplicar el fix (dry-run por defecto):

```bash
# Sólo ver lo que haría
npx tsx scripts/update-tenant-currency.ts --tenant=mitemnant --moneda=EUR

# Aplicarlo (audita con timestamp + IP)
npx tsx scripts/update-tenant-currency.ts --tenant=mitemnant --moneda=EUR --apply
```

### Camino 3 — Superadmin (override manual)

`/admin/tenants/{slug}` → formulario → cambiar `moneda` → guardar.
Útil cuando el broker no puede esperar el cooldown de 24h.

## Casos borde

- **Portfolio multi-divisa**: si el tenant tiene pólizas en EUR y USD, la agregación
  convierte todas a la moneda de reporte. La UI muestra un banner amarillo arriba
  del portfolio: “Portfolio multi-divisa · Convertido a {EUR}” con desglose
  por moneda nativa.
- **Moneda no soportada** (póliza en una moneda distinta a las 12 de la tabla FX):
  `lib/insurance/currency.ts` cae a identidad defensiva (`fxConvert` devuelve el
  monto sin convertir + un warn único por código). La UI no rompe.
- **Cooldown 429**: la PATCH responde 429 con el mensaje “Ya cambiaste la moneda
  hace menos de 24h. Vuelve a intentarlo en N minutos.” El card en la UI muestra
  el banner ámbar y sugiere contactar al superadmin si urge.

## Tests

- `tests/currency.test.ts` — `fxConvert`, `resumenMoneda`, monedas desconocidas,
  combination totals.
- `tests/tenant-currency-resolver.test.ts` — 22 tests cubriendo todas las
  ramas del auto-detector (explícito, auto-from-polizas, fallback-default ×
  mixto/vacío/una moneda).
- `tests/post-import-moneda-autofix.test.ts` — 16 tests cubriendo el helper
  de auto-fix I/O (mockeando globalPrisma). Cubre: already-correct × 2
  monedas, batch-empty, minBatchSize, mixed-currency, all-MXN (no-op),
  auto-fix-applied × EUR/USD/GBP/minúsculas/moneda-no-soportada,
  dry-run-suggested, audit-source differentiation, audit-failure
  no-rollback, payload completo con trazabilidad.
- Todos los tests del vertical Seguros (`tests/forecast-*.test.ts`,
  `tests/multi-ramo-forecast.test.ts`, `tests/seasonal-forecast.test.ts`)
  usan `tenantMoneda='EUR'` o `'MXN'` para fijar el comportamiento.

## 🧭 Trazabilidad de la fuente de moneda (NUEVO 2026-08-09)

Cada cambio de `Tenant.moneda` debe propagarse a los nuevos campos:
- `monedaInferida` (String?) — snapshot de la última moneda.
- `monedaInferenciaSource` (`MonedaInferenciaSource` enum) — POR QUÉ.

Valores:
| Source | Quién lo asigna | Cuándo |
|---|---|---|
| `EXPLICIT` | Operador humano vía CLI flag, API body, o PATCH manual | `--moneda=USD`, `POST /api/tenants/create {moneda:EUR}`, `PATCH /api/tenant/moneda` |
| `USER_PROMPT` | Usuario en prompt interactivo TTY del seed script | `npx tsx scripts/seed-partner-tenants.ts` eligiendo 1..12 |
| `IMPORT_AUTO` | Helper `lib/insurance/post-import-moneda-autofix.ts` | Tras el primer import 100% en otra moneda via wizard |
| `FALLBACK` (schema default) | Nadie — dejarlo así cuando hereda `MXN` | Tenants creados vía provisioner sin `moneda` en body |

Uso programático típico del superadmin:

```sql
-- Tenants con moneda heredada del default MXN (limpiar mensualmente)
SELECT id, slug, nombre, plan,
       "moneda", "monedaInferida", "monedaInferenciaSource",
       "fechaCreacion"
FROM   "Tenant"
WHERE  "monedaInferenciaSource" = 'FALLBACK'
ORDER  BY "fechaCreacion" ASC;

-- Auto-fixes de la última semana
SELECT id, slug, "moneda", "monedaInferenciaSource"
FROM   "Tenant"
WHERE  "monedaInferenciaSource" = 'IMPORT_AUTO'
  AND  "fechaActualizacion" >= now() - interval '7 days';
```

Endpoint equivalente para el panel admin:
```
GET /api/admin/tenants/currency-inheritance-report
GET /api/admin/tenants/currency-inheritance-report?source=FALLBACK&limit=200&offset=0
```

Devuelve:
- `total` y `count` de la página actual.
- `bySource`: conteos agregados por cada valor del enum (4 totales,
  útiles para alimentar `/admin/saas-metrics` del follow-up).
- `items`: lista paginada con `id, slug, subdomain, nombre, plan,
  moneda, monedaInferida, monedaInferenciaSource, fechaCreacion`.

Reglas de actualización (regla de oro del módulo):

> Cada `globalPrisma.tenant.update` que toque `moneda` DEBE actualizar
> también `monedaInferida` y `monedaInferenciaSource`. Esta invariante
> está cubierta por tests vitest (`tests/post-import-moneda-autofix.test.ts`
> test #17: *"el update siempre incluye monedaInferida +
> monedaInferenciaSource"*).

Backfill para tenants pre-existentes (los creados antes del migration):
```bash
# Marca como FALLBACK a todo tenant que tenga moneda=MXN sin inferencia
npx tsx scripts/backfill-moneda-inference.ts --apply
# Marca como EXPLICIT a todo tenant con auditLog reciente de cambio manual de moneda
npx tsx scripts/backfill-moneda-inference.ts --from-audit-log --apply
```

## Cómo prevenir regresiones futuras

1. **Default del schema**: NO cambiar `Tenant.moneda @default("MXN")` —
   la migración sería invasiva. En su lugar, el seed de partner tenants
   debe llamar al endpoint PATCH para cada nuevo tenant.
2. **Onboarding**: al crear un nuevo tenant, pedir moneda preferida y
   setearla (work-in-progress; ver follow-ups).
3. **Regla ESLint custom** `eslint-rules/no-hardcoded-currency-fallback`
   — implementada el 2026-08-03 para bloquear, de una vez por todas, el
   patrón regresivo `?? 'MXN'` y compañía. Ver detalle más abajo.
4. **Trazabilidad de fuente** — implementada el 2026-08-09. Cada cambio
   de `Tenant.moneda` debe actualizar también `monedaInferida` +
   `monedaInferenciaSource`. Cubierto por tests vitest.

## 🛡️ Defensa ESLint: `eslint-rules/no-hardcoded-currency-fallback`

### Por qué existe

El bug del chip MXN del portfolio ejecutivo fue un caso de regresión de un
patrón perfectamente evitable: `snapshot?.tenantMoneda ?? 'MXN'`. Para que
ningún feature futuro de forecast / cartera / cobranza lo reintroduzca,
añadimos una regla ESLint custom que falla el build automáticamente cuando
aparece el literal `'MXN'` en posiciones de fallback.

### Qué detecta

Bloquea el string literal `'MXN'` en tres posiciones de **fallback** dentro
de los paths del vertical Seguros:

| Posición AST                              | Ejemplo bloqueado                                    |
| ----------------------------------------- | ---------------------------------------------------- |
| `AssignmentPattern.right` (default param) | `function f(x = 'MXN') {}`                          |
| `LogicalExpression.right` con `??` / `||` | `tenant?.moneda ?? 'MXN'`, `poliza.moneda \|\| 'MXN'` |
| `ConditionalExpression` (ternario)        | `cond ? 'MXN' : other`, `cond ? other : 'MXN'`       |

### Qué NO detecta (casos legítimos)

- `<SelectItem value="MXN">` del formulario de pólizas: el usuario elige su
  moneda, no es un fallback.
- `const cfg = { currency: 'MXN' }`: configuración inmutable.
- Template literals donde `'MXN'` aparece interpolado: la regla sólo mira
  el nodo `Literal` puro.

### Alcance (scoping)

Solo activa en los archivos del vertical Seguros:

```json
// .eslintrc.json
"overrides": [{
  "files": [
    "app/api/insurance/portfolio/**/*.ts",
    "components/insurance/**/*.tsx",
    "components/insurance/**/*.ts"
  ],
  "plugins": ["eslint-rules"],
  "rules": { "eslint-rules/no-hardcoded-currency-fallback": "error" }
}]
```

Otros verticales (real-estate, financiera) no se ven afectados: pueden seguir
usando MXN como default legítimo para clientes mexicanos sin campo
`tenant.moneda` equivalente.

### Mensaje de error (orienta al fix correcto)

> No hardcodear el fallback de moneda a "MXN". Usa `tenant.moneda`
> (en routes) o `snapshot.tenantMoneda`/prop explícita (en componentes).
> Para un default global legítimo, importa
> `CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY` desde
> "@/lib/insurance/currency".

### Cómo se carga en Vercel (sin symlinks ni hacks)

`eslint-rules/` es código del repo (committed). El `postinstall` script
`scripts/install-eslint-local-rules.js` copia los 3 archivos del plugin
a `node_modules/eslint-plugin-eslint-rules/` tras cualquier install
(local o Vercel). El `.eslintrc.json` lo referencia por nombre corto
(`"eslint-rules"`), que ESLint resuelve desde `node_modules` estándar.

```
eslint-rules/
├── package.json                        # name: eslint-plugin-eslint-rules
├── index.js                            # manifest + config.recommended
├── no-hardcoded-currency-fallback.js   # la regla
└── __tests__/
    └── no-hardcoded-currency-fallback.test.js  # 24 tests RuleTester
```

### Cómo agregar otra regla custom en el futuro

1. Crear `eslint-rules/<nombre-regla>.js` siguiendo el contrato de un rule
   ESLint v8 (`{ meta, create(context) }`).
2. Exportarla en `eslint-rules/index.js` bajo `rules['nombre-regla']`.
3. Registrar el nombre corto en el `overrides.plugins` de `.eslintrc.json`.
4. Escribir tests en `eslint-rules/__tests__/<nombre-regla>.test.js` con
   `RuleTester` de `eslint`.
5. (Opcional) Aplicar el override a otros paths.

### Cómo verificar manualmente

```bash
# 1. Validar la regla con tests:
cd nextjs_space && ./node_modules/.bin/vitest run \
  eslint-rules/__tests__/no-hardcoded-currency-fallback.test.js
# → 24/24 esperado

# 2. Lint scoped (debe estar limpio):
cd nextjs_space && npx eslint components/insurance/ \
  app/api/insurance/portfolio/
# → 0 errores de no-hardcoded-currency-fallback esperados

# 3. Probar la regla con un caso malo:
echo 'const x = tenant?.moneda ?? "MXN";' > /tmp/probe.ts
npx eslint --no-eslintrc --resolve-plugins-relative-to . \
  --config /tmp/cfg.json /tmp/probe.ts
# → 1 error esperado: la regla dispara
```

## Archivos relevantes

- `prisma/schema.prisma:173` — campo `Tenant.moneda`.
- `lib/insurance/currency.ts` — tabla FX, helpers, `SUPPORTED_CURRENCIES`,
  `CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY`.
- `lib/insurance/tenant-currency-resolver.ts` — lógica pura de auto-detección
  (reusable desde CLI/API/UI). Exporta `resolveTenantCurrency`,
  `groupByMoneda`, `CurrencyResolution`.
- `lib/insurance/post-import-moneda-autofix.ts` — helper I/O que decide +
  aplica el auto-fix tras un import. Bypasses cooldown de 24h y deja
  auditLog con `source='system:auto-import-bulk-csv'`.
- `lib/provisioning/tenant-provisioner.ts` — provisioner acepta campo
  `moneda` opcional (validado contra `SUPPORTED_CURRENCIES`).
- `app/api/insurance/importar/route.ts` — endpoint bulk-import de pólizas
  con `batchStartTime` capturado + llamada post-loop al helper de auto-fix.
- `app/api/insurance/portfolio/route.ts` — usa `tenant.moneda` para agregados.
- `app/api/tenants/create/route.ts` — endpoint de creación con `moneda`
  opcional en el body (validado, 400 si inválida).
- `app/api/tenant/moneda/route.ts` — PATCH + GET self-service (cambio
  posterior al onboarding, con cooldown 24h que el auto-fix bypassea).
  Cada cambio marca `monedaInferenciaSource='EXPLICIT'`.
- `app/api/admin/tenants/currency-inheritance-report/route.ts` — GET admin
  para listar tenants con moneda heredada del default MXN (o por otra
  fuente). Devuelve agregados + items paginados.
- `app/dashboard/seguros/portfolio/page.tsx:303` — chip junto a Refrescar.
- `components/hubs/ConfiguracionDashboard.tsx` — `MonedaReporteCard`.
- `components/insurance/ImportEntityWizard.tsx` — wizard genérico que
  muestra el toast de auto-fix cuando la respuesta incluye
  `autoFixMoneda.changed`.
- `scripts/seed-partner-tenants.ts` — fuerza prompt de moneda al crear
  tenants demo (`--moneda=`, prompt interactivo, o `--allow-auto`).
- `scripts/diagnose-tenant-currency.ts`, `scripts/update-tenant-currency.ts` —
  admin tools para diagnosticar/cambiar moneda tras importación.
- `eslint-rules/` — regla custom `no-hardcoded-currency-fallback` (ver arriba).
- `scripts/install-eslint-local-rules.js` — sync `eslint-rules/` → node_modules.
- `eslint-rules/__tests__/no-hardcoded-currency-fallback.test.js` — 24 tests.
- `tests/post-import-moneda-resolver.test.ts` (en el lib) — 22 tests del resolver.
- `tests/post-import-moneda-autofix.test.ts` — 17 tests del helper I/O + trazabilidad.
