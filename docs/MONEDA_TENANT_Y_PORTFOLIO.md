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

---

## 🛰️ Conectar Telegram a un tenant creado sin bot

Cuando un broker se onboarzó con `telegram` omitido (toggle OFF en `/admin/partner-onboarding`),
el partner tenant nace con `messagingHubConfig.chatwootAccountId` ya creado pero sin `telegramInboxId`,
sin canal `Channel` de Telegram y sin webhook configurado. Antes había que pedirle al
broker que llamara al CLI o esperar a un fix manual; ahora el superadmin puede
conectar el bot en 1 click desde el DoneCard del wizard.

### Endpoint

```
POST /api/admin/tenants/{id}/telegram
Headers: Cookies de sesión + CSRF de next-auth (mismo patrón que /api/admin/*)
Body: { botName: string, botToken: string }
Auth: Superadmin (rol.nombre === 'Superadmin')
```

Respuestas:

| Status | Cuerpo                                                                                |
|--------|---------------------------------------------------------------------------------------|
| 200    | `{ success: true, state: 'created' \| 'already-exists', telegramInboxId, telegramChannelId, hubConfigId }` |
| 400    | `{ error: 'botName y botToken son requeridos' }`                                       |
| 401    | `{ error: 'No autorizado' }`                                                          |
| 403    | `{ error: 'Acceso denegado' }`                                                        |
| 404    | `{ error: 'Tenant no encontrado' }`                                                   |
| 409    | `{ error: 'TENANT_LACKS_CHATWOOT — el tenant no tiene hub de Nexus configurado' }`   |
| 422    | `{ code: 'TELEGRAM_BAD_TOKEN' \| 'TELEGRAM_BOTNAME_INVALID' \| 'TELEGRAM_BOTTOKEN_INVALID', error }` |
| 500    | `{ code: 'TELEGRAM_INBOX_ERROR' \| 'UNEXPECTED', error }`                              |

### Implementación

- `lib/provisioning/tenant-provisioner.ts:171` ahora exporta `addTelegramChannelToTenant(input)` —
  helper extraído del bloque `if (telegramProvided)` del provisioner original
  (pasos 4-7: createTelegramInbox + upsert messagingHubConfig + create Channel + configureWebhook + auditLog).
  Idempotente: si ya existe `Channel.type='telegram'` activo, devuelve
  `state='already-exists'` sin tocar nada. El provisioner llama al helper
  cuando telegram fue provisto; el endpoint admin lo llama cuando se conecta después.
- `app/api/admin/tenants/[id]/telegram/route.ts` (POST): valida token con
  `https://api.telegram.org/bot{token}/getMe`, lee el `hubApiToken` encriptado
  del `messagingHubConfig`, llama al helper con `actor={ kind:'user', id, email }`.
- `app/admin/partner-onboarding/page.tsx`: cuando el `CreateResponse.telegramSkipped === true`
  y la respuesta trae `tenantId`, el DoneCard ahora muestra una tarjeta ámbar
  inline-expandible con `@mi_empresa_bot` + `botToken` que llama al endpoint.
  El éxito actualiza el `SummaryRow` ("✅ Inbox #N") en vivo.

### Tests

- `tests/add-telegram-channel.test.ts` — 11 tests cubriendo: éxito, idempotencia,
  validación temprana (botName sin @ / botToken corto), dryRun, manejo de
  error de Chatwoot, defensivo contra webhook/auditLog fallando, actor
  system vs user se propaga al auditLog.

### Auditoría

Cada conexión del bot deja un `auditLog` con `entidad='tenant-telegram'` y
`cambiosDespues.actor` propagado. Para listar todas las conexiones:
```sql
SELECT * FROM "auditLog"
WHERE entidad = 'tenant-telegram' AND accion = 'crear'
ORDER BY "fechaCreacion" DESC;
```

---

## 🗃️ Wizard de partner-offboarding (archivar tenant)

Complementario al wizard de `partner-onboarding` (`/admin/partner-onboarding`).
El operator (superadmin) ahora puede archivar un partner tenant existente
desde la UI con el mismo aesthetic y stepper (`/admin/partner-offboarding`).

### Endpoint detrás del wizard

```
POST /api/admin/tenants/{id}/archive
Auth: Superadmin
Body: { reason: string, sendGoodbyeEmail?: boolean = true, dryRun?: boolean = false }
```

Códigos:

| Status | Cuerpo                                                                  |
|--------|-------------------------------------------------------------------------|
| 200    | `{ ok: true, tenantId, archivedAt, reason, steps:[{step,ok,detail}], goodbyeEmail }` |
| 200    | `{ ok: false, ... }` cuando algún step secundario falló pero `tenant.estado` ya quedó `archived`. |
| 400    | `{ error: 'reason es requerido (mínimo 3 caracteres)' }`              |
| 401/403/404/409 | mismo patrón que todos los endpoints `/api/admin/tenants/*`     |
| 500    | `{ code: 'UNEXPECTED' \| 'TENANT_UPDATE_FAILED', error }`              |

### Implementación (6 pasos atómicos, todos best-effort desde el 2º en adelante)

1. `prisma.tenant.update` — `estado='archived'`, `fechaVencimiento=now`, `mrr=0`.
2. `prisma.messagingHubConfig.updateMany` — `isActive=false`, `hubApiToken=""`.
3. `prisma.channel.updateMany` — `isActive=false`, `config={revoked:true,revokedAt,reason}`.
4. `deleteDomain(resendDomainId)` en Resend + `emailDomainStatus='archived'`.
5. `sendEmail({ to: tier.billingEmail || firstAdmin.email, subject, html })`
   con plantilla que muestra razón y TTL de 90 días para exportar datos.
6. `prisma.auditLog.create` con `accion='archivar'`, snapshot antes/después,
   `cambiosDespues.actor` propagado.

Cada paso reporta `ok:boolean + detail` al resultado. Si el paso 1 falla, `ok:false` global.
Si los pasos 2-6 fallan individualmente, el caller ve `allOk vs partial` en la UI
y decide si rollback manual.

### Tests (tests/tenant-archiver.test.ts — 13 tests)

Éxito end-to-end · tenant no existe · ya archivado · dryRun · sendGoodbyeEmail=false
· deleteDomain falla · goodbye email falla · recipient fallback (admin user) · sin
recipient · sin resendDomainId · audit snapshot · actor=system · smoke.

### Shared UI

Sub-componentes (`Stepper`, `Field`, `SummaryRow`, `WizardShell`) extraídos a
`components/admin/onboarding-ui.tsx` para que ambos wizards compartan exactamente
la misma estética (paleta, tipografía, transiciones, hover). Cambios futuros
de aesthetic van en 1 lugar.

### TODO conocidos (follow-ups)

- `stripeCustomerId` existe pero la cancelación real del subscription no se hace
  aquí (requeriría integración con Stripe API; por ahora sólo queda registrado
  en `cambiosAntes` del audit log para que el superadmin lo cancele manualmente).
- `fechaArchivado DateTime?` es un campo nuevo que NO se añade en este commit
  (la migración aditiva se programa en un follow-up dedicado).
- El wizard actual envía las 4 acciones como toggle ON/OFF granular, pero el
  endpoint `/archive` las trata de forma atómica. Para granularidad fina
  usar un endpoint `/archive/{action}` por recurso (futuro).

---

## 🎯 Step "Vertical" en partner-onboarding

Complemento directo del wizard de onboarding. El operator ahora puede elegir, en un step opcional después de "Empresa", la vertical del broker. Esto siembra el "starter pack" de módulos vía tenantFeature overrides para que el tenant arranque con los módulos relevantes ya habilitados y el broker pueda empezar a importar datos específicos del vertical (pólizas para insurance, inmuebles para real_estate, etc) sin entrar a `/admin/saas/tenants/{id}/modulos`.

### Definición de verticales (lib/plans.ts)

```
VERTICALS = ['insurance', 'real_estate', 'accounting', 'general']
VERTICAL_DEFINITIONS = {
  insurance:   { name:'Seguros (Brokers)', icon:'🛡️', modules:[leads,contactos,empresas,pipeline,tareas,mensajes,citas,catalogo,cotizaciones,contratos,insurance,automatizaciones,mi_tarjeta,equipo,configuracion] },
  real_estate: { name:'Inmobiliaria',      icon:'🏠', modules:[leads,contactos,empresas,pipeline,ordenes_venta,campanas,cms,builder_premium,integraciones,...] },
  accounting:  { name:'Contable',          icon:'📊', modules:[leads,cotizaciones,contratos,ordenes_venta,finanzas,conciliacion,conocimiento,chatbot_whatsapp,...] },
  general:     { name:'General Multi',     icon:'💼', modules:[core CRM: leads,contactos,empresas,pipeline,tareas,mensajes,citas,catalogo,mi_tarjeta,equipo,configuracion] },
}
```

### Implementación

1. `lib/plans.ts` — `VERTICALS`, `Vertical`, `VERTICAL_DEFINITIONS` (4 verticales con nombre+icon+description+modules).
2. `lib/provisioning/tenant-provisioner.ts` — `seedTenantModulesFromVertical({tenantId,vertical,modules,actor})`:
   helper que upserta tenantFeature(habilitado=true, habilitadoPor, razon='Vertical seed: ...')
   para cada módulo. Idempotente (skipped si ya estaba habilitado=true).
   Defensivo: si un upsert falla reporta `errors[]` pero continúa con el resto.
3. `provisionTenant` — bloque condicional tras crear tenant+user: si `vertical` vino
   en el input, llama al helper. Si no, no hace nada (broker arranca con módulos del plan).
4. `app/api/tenants/create/route.ts` — body acepta `vertical?: string`; 400 INVALID_VERTICAL
   si no está en VERTICALS; response incluye `vertical: Vertical | null`.
5. `app/admin/partner-onboarding/page.tsx` — nuevo step `'vertical'` entre `'empresa'` y `'subdominio'`.
   `<VerticalStep>` muestra 4 cards (icon + name + description + module count preview)
   + opción "Sin vertical" (null = no siembra, broker arranca con módulos default del plan).
   El DoneCard muestra "🛡️ Seguros (Brokers) — N módulos activados" o "🔹 Sin vertical".

### Tests (tests/vertical-seed.test.ts — 10 tests)

VERTICAL_DEFINITIONS exhaustividad (4 verticales con módulos) · signature ·
módulos únicos por vertical · signature del helper · idempotencia ·
defensivo contra errores parciales · actor=user y actor=system propagan
`habilitadoPor` y `razon` · todas las verticales incluyen el core CRM
(leads, contactos, tareas).

### Implicaciones prácticas

- Broker europeo (insurance) ya no necesita entrar a `/admin/saas/tenants/{id}/modulos`
  post-onboarding para activar el módulo insurance.
- Operator (superadmin) puede distinguir el flow por icono en el DoneCard.
- Helper `seedTenantModulesFromVertical` es reusable desde CLI scripts
  (`scripts/seed-partner-tenants.ts`) o cron (`/api/cron/seed-verticals`).

---

## 📦 Wizard de bulk onboarding (crear N tenants a la vez)

Para cargar N partners de un golpe, sin pasar por el wizard unitario N veces.
El operator sube un CSV con `empresa,subdomain,email,password,moneda,vertical`,
el sistema parsea (detección auto de `,` o `;`, BOM UTF-8, RFC-4180), valida
campo por campo, y crea N tenants con concurrencia=3 reusando
`/api/tenants/create` uno a uno (más resiliente que un endpoint bulk).

### Wizard UI (`/admin/partner-onboarding/bulk`)

4 pasos:
1. **Upload**  — input file o textarea.
2. **Preview** — tabla con filas parseadas, badge por delimiter,
   lista de errores de validación por fila (subdominio inválido, email
   mal formado, etc), lista de filas vacías ignoradas.
3. **Create**  — pool de 3 workers consumen el array de BulkRowState.
   Por cada fila: `POST /api/tenants/create` con `empresa,subdomain,email,
   password,moneda,vertical`. Estado `pending|running|created|error` visible
   por fila en una tabla con CSS color (azul running, verde created, rosa
   error). Botón "Cancelar" aborta los in-flight con AbortController.
4. **Done**    — `{created, failed, pending}` con SummaryRows + botón
   "Descargar CSV reporte". El reporte usa `buildBulkResultCsv` (RFC-4180
   con BOM UTF-8 para Excel).

### Librería compartida (`lib/insurance/csv-bulk.ts`)

- `detectDelimiter(text)` — auto-detecta `,` o `;` mirando las primeras
  5 filas CON CONTENIDO (ignora filas vacías `,,,` que mezcladas con
  filas válidas rompen la heurística).
- `parseCsvLine(line, delim)` — RFC-4180 simplificado con quote escaping.
- `parseBulkCsv(text)` — entry point. Devuelve `{ delimiter, headers,
  rows, errors, emptyRows }`.
- `buildBulkResultCsv(results)` — serializa el reporte con 13 columnas
  (row, empresa, subdominio, email, status, tenantId, chatwootAccountId,
  telegramStatus, telegramInboxId, moneda, monedaInferenciaSource,
  errorCode, errorMessage). Usa el mismo `escapeCsv` que
  `lib/insurance/csv-template.ts`.
- Headers reconocidos (case-insensitive, tolerant whitespace,
  con aliases ES/EN): `empresa`/`company`/`nombre`,
  `subdomain`/`subdominio`/`slug`, `email`/`correo`,
  `password`/`contrasena`/`contraseña`, `moneda`/`currency`,
  `vertical`, `telegramBotName`/`botName`, `telegramBotToken`/`botToken`.

### Tests (tests/csv-bulk.test.ts — 23 tests)

`detectDelimiter` con `,` y `;` + BOM + empate + filas vacías;
`parseBulkCsv` con CRLF, BOM, comillas RFC-4180, campos faltantes,
email inválido, subdominio inválido, filas vacías, etc; `buildBulkResultCsv`
con BOM + CRLF + escape de comas y comillas dobles.

### Implicaciones prácticas

- Operator que tiene una lista de 50 brokers en una spreadsheet puede
  copiar-pegar y crear 50 tenants en ~2 minutos (3 workers en paralelo,
  cada uno tarda ~3-5s con provisioning completo de Nexus + Email).
- El reporte CSV permite al equipo de onboarding triar lo que falló
  (subdominio inválido, email duplicado, etc) sin re-correr el wizard.
- Idempotencia: si un broker ya existía, recibirá `DUPLICATE_TENANT` y
  la fila se marca como error — el operator puede filtrar el reporte y
  reintentar sólo las válidas.

---

## 📡 Server-side bulk onboarding (`/api/admin/partner-bulk`)

Complemento server-side del wizard web (`/admin/partner-onboarding/bulk`).
Pensado para integraciones que no tienen browser: scripts CLI, cron jobs,
pipelines de sales-ops (HubSpot → Volkern), herramientas internas tipo
n8n, GitHub Actions. El endpoint reusa la misma lógica de provisioner +
parser CSV que el wizard, así que ambas vías producen resultados idénticos
y pueden mezclarse (un batch por web y otro por CLI en la misma sesión
operativa).

### Endpoint

```
POST /api/admin/partner-bulk
```

### Auth dual (cualquiera de las dos)

| Mech                          | Quién                                          | Notas                                                |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| **Bearer CRON_SECRET**        | Scripts CLI, cron, GitHub Actions, n8n, HubSpot| Header `Authorization: Bearer ${CRON_SECRET}`.       |
| **Session superadmin**        | Operator humano con `curl --cookie`            | Mismo patrón que `/api/admin/tenants/[id]/modules`.  |

El path Bearer es independiente de `NODE_ENV` (a diferencia de `/api/cron/*`,
que sólo activa CRON_SECRET en producción). Aquí queremos que los scripts
de staging/dev también funcionen.

### Content-Type sniffing

Acepta cualquiera de los tres siguientes:

| Content-Type        | Body esperado                                                  |
| ------------------- | -------------------------------------------------------------- |
| `text/csv`          | CSV crudo (línea 1 = header, resto = filas)                     |
| `text/plain`        | Idéntico al de arriba (path útil para `curl --data-binary @x`)  |
| `application/json`  | `{ csv: "...", dryRun?: bool, concurrency?: number }`          |

Cualquier otro → **415** `Content-Type ... no soportado`. Body > 5 MB →
**415** con cap `Content-Length`.

### Headers opcionales

| Header                    | Valores aceptados                                  | Default |
| ------------------------- | -------------------------------------------------- | ------- |
| `X-Dry-Run`               | `true` \| `1` (cualquier otro se ignora)            | `false` |

> El header tiene **prioridad** sobre `body.dryRun`. Si vienen ambos y
> se contradicen, el header gana.

### Respuesta (200 OK)

```jsonc
{
  "ok": true,                         // false si failed > 0
  "dryRun": false,
  "total": 12,
  "created": 11,
  "simulated": 0,                     // N (sólo si dryRun=true)
  "failed": 1,
  "hadUnexpectedErrors": false,       // true si algún error es 'UNEXPECTED'
  "report": [                         // mismo shape que el wizard web
    {
      "rowNum": 1,
      "empresa": "Brokers SL",
      "subdomain": "brokers",
      "email": "admin@brokers.com",
      "moneda": "EUR",
      "status": "created",            // 'created' | 'simulated' | 'error'
      "tenantId": "tenant_abc...",
      "chatwootAccountId": 142,
      "telegramInboxId": null,
      "telegramStatus": "n/a",        // 'connected' | 'skipped' | 'n/a' | 'simulated'
      "monedaInferenciaSource": "EXPLICIT"
    },
    // ...
  ],
  "reportCsv": "\uFEFFrow,empresa,...\r\n1,Brokers SL,...",   // RFC-4180 + BOM
  "parseErrors": [{ "rowNum": 5, "message": "Email inválido: ..." }],
  "emptyRows": [7, 8],
  "generatedPasswords": { "1": "MyCsvPwd12", "2": "AutoPwd1234Xyz", ... }
}
```

Headers informativos para que scripts lean totales sin parsear el body:

| Header                                  | Valor                  |
| --------------------------------------- | ---------------------- |
| `X-Bulk-Total`                          | `String(total)`        |
| `X-Bulk-Created`                        | `String(created)`      |
| `X-Bulk-Simulated`                      | `String(simulated)`    |
| `X-Bulk-Failed`                         | `String(failed)`       |
| `X-Bulk-Dry-Run`                        | `"true"` \| `"false"`  |
| `X-Bulk-Contains-Generated-Passwords`   | `"true"` si hay auto-pwd |

### Códigos de error

| HTTP | Cuándo                                                                 |
| ---- | ---------------------------------------------------------------------- |
| 401  | Sin auth (ni session ni Bearer) o Bearer inválido                       |
| 403  | Session pero rol ≠ `Superadmin`                                         |
| 415  | Content-Type inválido o Body > 5 MB                                     |
| 422  | `CSV_NO_VALID_ROWS` — el parser descartó TODAS las filas                |
| 500  | `UNEXPECTED` — algo explotó fuera del try/catch                         |

`ok=false` en el body NO significa 500: significa "creé N, fallaron M"
(partial success). El HTTP status sigue siendo 200 con el desglose.

### Implementación

- **`lib/provisioning/partner-bulk-runner.ts`** — orquestador reusable que
  recibe `{ rows, autoGeneratedPasswords, dryRun, concurrency, actor }`
  y devuelve `{ ok, total, created, simulated, failed, report, hadUnexpectedErrors }`.
  Pool de `concurrency` workers (default 3, cap 1..10) consume la cola y
  llama a `provisionTenant` directo (sin HTTP) por cada fila.
  Defensivo: mapea códigos de negocio del provisioner (SUBDOMAIN_TAKEN,
  INVALID_EMAIL, etc.) a `errorCode` por fila; cualquier excepción no
  esperada se etiqueta como `errorCode='UNEXPECTED'` y marca
  `hadUnexpectedErrors=true`.

- **`app/api/admin/partner-bulk/route.ts`** — endpoint POST con:
  1. Auth dual (Bearer CRON_SECRET o session superadmin).
  2. Body parsing con content-type sniffing (text/csv | text/plain | json).
  3. Cap de 5 MB por Content-Length para impedir DoS.
  4. Parse del CSV via `parseBulkCsv` (mismo que el wizard).
  5. Auto-generación de passwords via `generateBulkPassword` para filas
     sin password (CSPRNG via `crypto.getRandomValues` con fallback a
     `Math.random`).
  6. Llamada a `runBulkOnboarding` con concurrencia default 3.
  7. Response con `report` JSON + `reportCsv` RFC-4180 con BOM.

### Tests (29 tests)

- **`tests/partner-bulk-runner.test.ts`** — 18 tests del runner (lógica):
  dry-run no llama a provisionTenant · happy path N filas · pool con
  concurrencia=3 · cap concurrencia 1..10 · success=false del provisioner →
  errorCode específico · reject de red → UNEXPECTED + hadUnexpectedErrors
  · MISSING_PASSWORD fail-fast · idempotencia de errores de negocio ·
  bulkPassword cumple el criterio (mayúscula + minúscula + dígito, sin
  símbolos ambiguos) · 1000 passwords todas distintas.

- **`tests/partner-bulk-endpoint.test.ts`** — 11 tests del endpoint
  (HTTP-layer): 401 sin auth · 401 Bearer inválido · 401 Bearer sin
  CRON_SECRET · 403 session sin Superadmin · 415 sin content-type ·
  415 application/xml · 415 Body grande · 422 CSV 0 filas válidas ·
  422 CSV vacío · 422 CSV sin header reconocible · NO llama al runner
  cuando hay errores tempranos.

### Ejemplos de uso

#### 1. Cron job de sales-ops (HubSpot → Volkern)

```bash
#!/usr/bin/env bash
# /etc/cron.daily/sync-brokers-to-volkern
set -euo pipefail

SECRET=$(cat /run/secrets/volkern-cron-secret)
TODAY=$(date -u +%Y-%m-%d)
DRY_RUN="${DRY_RUN:-false}"

# Pull brokers nuevos de HubSpot, transforma a CSV...
curl -fsS -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "https://api.hubapi.com/.../brokers?createdate_gte=$TODAY" \
  | jq -r '.results[] | [.company, .slug, .email] | @csv' \
  > /tmp/new-brokers.csv

# Header + filas
{ echo "empresa,subdomain,email"; cat /tmp/new-brokers.csv; } > /tmp/payload.csv

# Llamar a la API con dry-run primero (no mutar nada)
curl -fsS -X POST \
  -H "Authorization: Bearer $SECRET" \
  -H "X-Dry-Run: $DRY_RUN" \
  -H "Content-Type: text/csv" \
  --data-binary @/tmp/payload.csv \
  "https://admin.volkern.app/api/admin/partner-bulk" \
  | tee "/var/log/volkern/bulk-${TODAY}.json"
```

#### 2. Onboarding masivo desde spreadsheet (operator)

```bash
# El operator tiene un .csv exportado de una spreadsheet.
# Lo sube con curl + sesión guardada en cookies.txt.
curl -fsS -X POST \
  -b /tmp/volkern-cookies.txt \
  -H "Content-Type: text/csv" \
  --data-binary @./brokers-batch-1.csv \
  "https://admin.volkern.app/api/admin/partner-bulk" \
  | jq -r '.report[] | "\(.rowNum) \(.subdomain) \(.status) \(.tenantId // .errorCode)"'
```

#### 3. Workflow n8n / Make / Zapier

La mayoría de estas plataformas tienen un módulo "HTTP Request" que
acepta:

1. **Method**: POST
2. **URL**: `https://admin.volkern.app/api/admin/partner-bulk`
3. **Auth**: Bearer Token → `{{ $env.CRON_SECRET }}`
4. **Headers**: `Content-Type: text/csv`
5. **Body**: Select "Send raw body" + pegar el CSV (bind a una variable
   que viene del paso anterior del workflow).

Salida del workflow: leer `body.report[*].tenantId` y disparar emails
de bienvenida via otro paso.

### Auditoría

Cada tenant creado via bulk queda auditado vía el `auditLog` que ya
crea `provisionTenant` (con `actor.system: 'cron-secret'` o
`actor.user.email`). Query SQL típica:

```sql
-- Tenants creados por bulk en las últimas 24h
SELECT t.id, t.slug, t.nombre, t."fechaCreacion",
       al.actor, al."fechaCreacion" AS audit_at
FROM   "Tenant" t
LEFT   JOIN "auditLog" al
       ON al."entidadId" = t.id AND al.accion = 'crear' AND al.entidad = 'tenant'
WHERE  t."fechaCreacion" >= now() - interval '24 hours'
ORDER  BY t."fechaCreacion" DESC;
```

### Implicaciones prácticas

- **CLI scripts** pueden llamar al endpoint sin browser, sin curl
  complicado: `fetch('/api/admin/partner-bulk', { method: 'POST',
  headers: { Authorization: 'Bearer ...' }, body: csv })`.
- **Cron jobs** que sincronizan brokers desde CRM externos se ejecutan
  sin intervención humana: la respuesta JSON incluye el `report[]` para
  notificar al team por email o Slack.
- **Idempotencia cliente**: si un subdominio ya existe, la fila se
  marca como `errorCode='SUBDOMAIN_TAKEN'` y el caller puede filtrar
  easy. El endpoint NO es bulk-create atómico: reintentarlo no duplica
  los creados previamente, sólo los pendientes.
- **Dry-run opcional**: herramientas de staging pueden previsualizar
  el resultado con `X-Dry-Run: true` antes de pedir mutable.

---

## 🌱 Bulk vertical seed en el paso Done del wizard (`/api/admin/partner-bulk/seed-vertical`)

Después de crear N tenants en `/admin/partner-onboarding/bulk`, el operator
antes tenía que entrar tenant por tenant a
`/admin/saas/tenants/{id}/modulos` para activar el starter pack de
módulos verticales (insurance / real_estate / accounting / general). Con
esta feature, el paso Done del wizard muestra un panel inline con 4
cards (uno por vertical) que llaman al endpoint server-side

```
POST /api/admin/partner-bulk/seed-vertical
```

para activar el starter pack en TODOS los tenants recién creados con un
solo click. Reusa `seedTenantModulesFromVertical()` del provisioner — sin
duplicar lógica de upsert de `tenantFeature`.

### Flujo UI (paso Done del wizard)

```
┌─ Done ──────────────────────────────────────────────────┐
│ ✅ {N} creados · {M} fallos · {k} pendientes           │
│   [Descargar CSV reporte]                              │
│ ────────────────────────────────────────────────────── │
│ 🌱 Seedear verticales en bulk                          │
│   activar starter pack de módulos para N tenants       │
│                                                       │
│   ┌──────────────┐  ┌──────────────┐                    │
│   │ 🛡️ Seguros   │  │ 🏠 Inmob...  │  ... × 2          │
│   │ Brokers      │  │ Real Estate  │                   │
│   │ 16 módulos   │  │ 19 módulos   │                   │
│   │ [Sembrar]    │  │ [Sembrar]    │                   │
│   │ [Dry-run]    │  │ [Dry-run]    │                   │
│   └──────────────┘  └──────────────┘                    │
│                                                       │
│   Acepta tenantIds de los rows status='created'.       │
└───────────────────────────────────────────────────────┘
```

Cada card muestra:
- Estado inicial (botón "Sembrar" / "Dry-run" enabled).
- Mientras corre: spinner + ring colored por vertical + "Sembrando…".
- Al terminar: `3/3 ok · 48 sembrados · 0 ya activos` (verde) o
  `3 ok · 1 tenant con error fatal` (mixto).
- Si el sembrado fue ok: el botón "Sembrar" se deshabilita y muestra
  "Aplicado" — previene double-seeding por error del operator.
- El botón "Dry-run" siempre está disponible antes del primer intento.

### Endpoint

```
POST /api/admin/partner-bulk/seed-vertical
```

### Auth dual (misma que `/api/admin/partner-bulk`)

| Mech                    | Quién                                |
| ----------------------- | ------------------------------------ |
| `Bearer ${CRON_SECRET}` | Scripts CLI, n8n, GitHub Actions     |
| Session superadmin      | Operator humano vía curl --cookie     |

### Body

```jsonc
{
  "tenantIds": ["t1", "t2", "t3"],            // requerido, max 200
  "vertical": "insurance",                     // requerido (insurance | real_estate | accounting | general)
  "modules": ["leads", "contactos"],          // opcional: override de VERTICAL_DEFINITIONS[vertical].modules
  "dryRun": false,                            // opcional, default false
  "concurrency": 3                            // opcional, default 3, cap 1..10
}
```

### Headers opcionales

| Header       | Valores                            | Default | Comportamiento                                        |
| ------------ | ---------------------------------- | ------- | ----------------------------------------------------- |
| `X-Dry-Run`  | `true` \| `1` \| `false` \| `0`    | body    | **Override explícito** — gana sobre body.dryRun.      |

> Cualquier valor truthy (`true`/`1`) o falsy (`false`/`0`) en el header
> gana sobre `body.dryRun`. Útil cuando un script mal-configurado trae
> `body.dryRun=true` y el operator lo cancela con `X-Dry-Run: false`.

### Respuesta (200)

```jsonc
{
  "ok": true,                                  // false si failed > 0 ó partial > 0
  "dryRun": false,
  "vertical": "insurance",
  "modulesPlanned": ["leads", "contactos", ..., "configuracion"],   // 16 ítems
  "total": 3,
  "succeeded": 3,                              // tenants sin errores fatales y sin errors partials
  "partial": 0,                                // tenants con errores partials (algunos módulos fallaron pero la mayoría se sembraron)
  "failed": 0,                                 // tenants con error fatal (excepción no controlada)
  "totalSeeded": 48,                           // suma de módulos nuevos activados
  "totalSkipped": 0,                           // suma de módulos que ya estaban activos (idempotencia)
  "tenants": [                                 // detalle por tenant
    {
      "tenantId": "t1",
      "seeded": ["leads", "contactos", "insurance"],
      "skipped": ["tareas"],
      "errors": [],
      "ok": true
    }
  ]
}
```

Headers informativos:

| Header                       | Valor                          |
| ---------------------------- | ------------------------------ |
| `X-Seed-Vertical`            | nombre de la vertical          |
| `X-Seed-Total`               | total                          |
| `X-Seed-Succeeded`           | succeeded                      |
| `X-Seed-Partial`             | partial                        |
| `X-Seed-Failed`              | failed                         |
| `X-Seed-Total-Seeded`        | totalSeeded                    |
| `X-Seed-Total-Skipped`       | totalSkipped                   |
| `X-Seed-Dry-Run`             | `"true"` \| `"false"`          |

### Códigos de error

| HTTP | Cuándo                                                                  |
| ---- | ----------------------------------------------------------------------- |
| 400  | `INVALID_VERTICAL` (vertical no está en VERTICALS)                       |
| 400  | `INVALID_TENANT_IDS` (array vacío o no-array ni strings)                |
| 400  | `TOO_MANY_TENANT_IDS` (> 200)                                           |
| 401  | Sin auth (ni session ni Bearer) o Bearer inválido                        |
| 403  | Session pero rol ≠ `Superadmin`                                          |
| 500  | `UNEXPECTED` — algo explotó fuera del try/catch                          |

### Implementación

- **`lib/provisioning/seed-vertical-bulk.ts`** — orquestador reusable
  que reusa `seedTenantModulesFromVertical()` del provisioner para crear
  `TenantFeature(habilitado=true, habilitadoPor, razon='Vertical seed: ${vertical}')`
  por cada módulo. Pool de N workers (default 3, cap 1..10)consume la
  cola de tenantIds. Defensivo contra errores fatales y parciales; las
  excepciones se reportan como `fatalError` por tenant sin abortar el
  batch.

- **`app/api/admin/partner-bulk/seed-vertical/route.ts`** (POST) — auth
  dual (mismo patrón que el endpoint partner-bulk), contenido JSON
  requerido, validación de vertical contra `VERTICALS`, cap de 200
  tenantIds por request, header `X-Dry-Run` con override explícito.
  Llama al runner y propaga el resultado + headers informativos.

- **`app/admin/partner-onboarding/bulk/page.tsx`** — paso Done extendido
  con panel `BulkVerticalSeedCTA` que muestra 4 cards por vertical. Cada
  card llama al endpoint con `tenantIds = rows.status=='created'`. UI
  muestra progreso por card (azul running → verde done / rose error).

### Tests (38 tests)

- **`tests/seed-vertical-bulk.test.ts`** — 20 tests del runner:
  dryRun no llama helper · happy path N tenants · módulos curados ·
  override custom · propagar actor user/system · tenant sin errores vs
  parcial vs fatal · suma de `totalSeeded` + `totalSkipped` · pool con
  concurrencia=3 medida con `inFlight` counter · cap 1..10 · tenantIds
  vacío · todas las 4 verticales curadas.

- **`tests/seed-vertical-endpoint.test.ts`** — 18 tests del endpoint:
  401 / 401 Bearer inválido / 403 no-Superadmin / 401 sin user ·
  400 vertical inválido (INVALID_VERTICAL) · 400 tenantIds array vacío
  / no-array (INVALID_TENANT_IDS) · 400 > 200 (TOO_MANY) · 400 no-JSON ·
  Bearer auth delegation · runner llamado con campos correctos ·
  `body.dryRun`/`X-Dry-Run`/priority · `modules` override · actor
  system · response shape 200 + headers `X-Seed-*` · NO llama al
  runner cuando hay errores tempranos.

### Ejemplo curl

```bash
# Dry-run primero para validar qué se va a activar
curl -fsS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -H "X-Dry-Run: true" \
  -d '{"tenantIds":["t1","t2","t3"], "vertical":"insurance"}' \
  "https://admin.volkern.app/api/admin/partner-bulk/seed-vertical" \
  | jq '. | {vertical, total, succeeded, totalSeeded, dryRun, tenants_count: (.tenants|length)}'

# Si dryRun output luce bien, aplicar
curl -fsS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tenantIds":["t1","t2","t3"], "vertical":"insurance"}' \
  "https://admin.volkern.app/api/admin/partner-bulk/seed-vertical"
```

### Auditoría

Cada `tenantFeature` sembrado lleva `razon='Vertical seed: ${vertical}'` y
`habilitadoPor = actor.email || actor.id` (para user) o
`system:${actor.source}` (para system). El superadmin puede listar todos
los seedings automáticos con:

```sql
SELECT tf."tenantId", tf.feature, tf.habilitadoPor, tf.razon, tf."fechaCreacion"
FROM   "tenant_features" tf
WHERE  tf.razon LIKE 'Vertical seed:%'
ORDER  BY tf."fechaCreacion" DESC
LIMIT  100;
```

### Implicaciones prácticas

- **Operator onboarding masivo**: tras correr el partner-bulk con N
  brokers de un CRM externo, el operator hace 1 click por vertical y
  los N brokers arrancan con sus módulos correspondientes. Antes eran N
  clicks × 4 dimensiones de filtro × 1 aprobación = 4N pasos manuales.
- **Idempotente**: re-correr con el mismo `tenantIds` + vertical no
  duplica audit entries; los módulos ya activos van a `skipped`, los
  nuevos a `seeded`. Útil para reintentar tras un error de red sin
  miedo.
- **Defensivo**: un módulo que falla individualmente NO aborta el
  batch. El provider persiste el error en `tenantResult.errors[]` y
  sigue con el resto. Esto permite distinguir en el UI "1 módulo falló
  en 1 tenant" vs "1 tenant entero falló" — métricas diferentes.
- **El módulo 'insurance' del vertical insurance queda sembrado**: si
  el broker importó pólizas antes de seedear el vertical, las páginas
  `/dashboard/seguros` ya están habilitadas por el plan pero las cards
  así quedan marcadas con `habilitadoPor='admin@volkern.app'` y
  `razon='Vertical seed: insurance'` — el auditLog tiene trazabilidad
  total.
