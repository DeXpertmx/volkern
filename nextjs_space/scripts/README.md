# Scripts de desarrollo

## ⚠️ Requisito: Node 20+

Todos los scripts se ejecutan con **`tsx`** y requieren **Node ≥20.19** (fijado en
`.nvmrc` y en `engines.node` de `package.json`).

Algunas dependencias que usan estos scripts declaran engines más estrictos y **no
funcionan en Node 18**:

| Dependencia | Engines | Scripts afectados |
|---|---|---|
| `sharp` | ≥20.9 | `generate-og-images.ts` |
| `puppeteer` / `puppeteer-core` | ≥22.12 | `generate-pricing-pdf.ts`, `generate-vps-report.ts` |
| `pdfjs-dist` | ≥22.13 | `lib/finance/pdf-render.ts` (módulo de escaneo de gastos — no script) |

> Si usas `nvm`, ejecuta `nvm use` en la raíz del repo antes de correr cualquier script.

---

## Generar imágenes Open Graph (OG)

```bash
npx tsx scripts/generate-og-images.ts
```

Genera las 11 imágenes Open Graph (1200×630 PNG) para las landing pages verticales.
Usa **`sharp`** para rasterizar los SVGs.

## Generar PDF de precios

```bash
npx tsx scripts/generate-pricing-pdf.ts
```

Genera el PDF de precios. Usa **`puppeteer`** (headless Chromium), por lo que
además de Node 20+ necesita que el binario de Chromium esté instalado
(`npx puppeteer browsers install chrome` si falla el lanzamiento).

## Generar reporte de VPS

```bash
npx tsx scripts/generate-vps-report.ts
```

Genera un reporte del VPS. Usa **`puppeteer`** (headless Chromium) — mismos
requisitos que el script anterior.

---

## Nota sobre `lib/pdf-generator.ts` y `lib/finance/pdf-render.ts`

No son scripts, pero se ejecutan dentro de la app (rutas de API de
cotizaciones/contratos/certificados y escaneo de gastos). En producción el
contenedor corre Node 20.20.2, por lo que no requieren acción. Solo importan si
se ejecutan tests o herramientas locales con Node 18.
