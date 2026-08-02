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
- Todos los tests del vertical Seguros (`tests/forecast-*.test.ts`,
  `tests/multi-ramo-forecast.test.ts`, `tests/seasonal-forecast.test.ts`)
  usan `tenantMoneda='EUR'` o `'MXN'` para fijar el comportamiento.

## Cómo prevenir regresiones futuras

1. **Default del schema**: NO cambiar `Tenant.moneda @default("MXN")` —
   la migración sería invasiva. En su lugar, el seed de partner tenants
   debe llamar al endpoint PATCH para cada nuevo tenant.
2. **Onboarding**: al crear un nuevo tenant, pedir moneda preferida y
   setearla (work-in-progress; ver follow-ups).
3. **Linter**: añadir regla ESLint que bloquee el hardcode de `?? 'MXN'` en
   la lógica de portfolio (debe usar siempre `tenant.moneda` o `snapshot.tenantMoneda`).

## Archivos relevantes

- `prisma/schema.prisma:173` — campo `Tenant.moneda`.
- `lib/insurance/currency.ts` — tabla FX, helpers, `SUPPORTED_CURRENCIES`.
- `app/api/insurance/portfolio/route.ts` — usa `tenant.moneda` para agregados.
- `app/api/tenant/moneda/route.ts` — PATCH + GET self-service.
- `app/dashboard/seguros/portfolio/page.tsx:303` — chip junto a Refrescar.
- `components/hubs/ConfiguracionDashboard.tsx` — `MonedaReporteCard`.
- `scripts/diagnose-tenant-currency.ts`, `scripts/update-tenant-currency.ts` — admin tools.
