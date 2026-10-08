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

## Documento técnico de Hospitality (capturas + PDF)

```bash
# 1) Capturas del módulo, desde un entorno real
DEMO_RE_PASSWORD='…' node scripts/capturar-pantallas-hospitality.cjs

# 2) PDF
node scripts/generar-pdf-tecnico-hospitality.cjs
```

El primero entra con una cuenta real (`HOSPITALITY_BASE_URL`, `HOSPITALITY_EMAIL`) y
deja una imagen por sección en `docs/img/hospitality-tecnico/` junto a su
`manifest.json` (con `HOSPITALITY_SOLO` se recapturan solo los ids indicados). El
segundo lee ese manifest y escribe `docs/hospitality-tecnico.pdf` y un HTML
intermedio en `/tmp`. La contraseña se lee del entorno (`DEMO_RE_PASSWORD`), **nunca**
del repositorio. Ambos usan **`puppeteer`** (headless Chromium), con los mismos
requisitos que los anteriores.

---

## Documento técnico de Real Estate (capturas + PDF)

```bash
# 1) Capturas del módulo, desde un entorno real
DEMO_RE_PASSWORD='…' node scripts/capturar-pantallas-real-estate.cjs

# 2) PDF
node scripts/generar-pdf-tecnico-real-estate.cjs
```

Mismo esquema que el de Hospitality: el primero entra con una cuenta real
(`REAL_ESTATE_BASE_URL`, `REAL_ESTATE_EMAIL`, `REAL_ESTATE_PORTAL`) y deja 15
imágenes en `docs/img/real-estate-tecnico/` junto a su `manifest.json` —más los
feeds reales de exportación (`idealista.xml`, `fotocasa.csv`) que el documento
cita—, con `REAL_ESTATE_SOLO` para recapturar solo algunos ids. El segundo lee
ese manifest y escribe `docs/real-estate-tecnico.pdf` y un HTML intermedio en
`/tmp`. La contraseña se lee del entorno (`DEMO_RE_PASSWORD`), **nunca** del
repositorio.

El módulo tiene su ficha de origen en `docs/real-estate-ficha-tecnica.md` (el
inventario que da contenido al PDF) y una galería de las capturas para revisarlas
de un vistazo en `docs/img/real-estate-tecnico/galeria.html`.

---

## Nota sobre `lib/pdf-generator.ts` y `lib/finance/pdf-render.ts`

No son scripts, pero se ejecutan dentro de la app (rutas de API de
cotizaciones/contratos/certificados y escaneo de gastos). En producción el
contenedor corre Node 20.20.2, por lo que no requieren acción. Solo importan si
se ejecutan tests o herramientas locales con Node 18.
