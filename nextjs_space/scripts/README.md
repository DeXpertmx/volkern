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

## Dossier comercial de CRM de Ventas (pantallas + PDF)

```bash
node scripts/generar-dossier-crm-ventas.cjs
```

Genera en una sola pasada las seis pantallas de producto
(`documentacion_comercial/img/crm-ventas/`) y el dossier A4 de 16 páginas
(`documentacion_comercial/Dossier_Comercial_CRM_Ventas.pdf`, más el HTML con las
imágenes incrustadas). Está pensado para el equipo comercial: diagnóstico,
propuesta, guion de demo, objeciones, precio y qué no prometer.

Por defecto dibuja **ilustraciones de la interfaz con datos de ejemplo**
(`scripts/dossier-crm-ventas/pantallas.cjs`). Para usar **capturas reales** del
tenant de demostración, primero siembra los datos y captura el panel, y luego
compón el documento con esas imágenes:

```bash
DEMO_CRM_PASSWORD='…' npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-demo-crm-ventas.ts
DEMO_CRM_PASSWORD='…' node scripts/capturar-pantallas-crm-ventas.cjs
DOSSIER_CAPTURAS_REALES=1 node scripts/generar-dossier-crm-ventas.cjs
```

`capturar-pantallas-crm-ventas.cjs` entra con el usuario demo y guarda una
imagen por sección; `CRM_SOLO=04` permite repetir una sola. Las dos variantes
llevan datos ficticios y el documento lo advierte en la última página.

### Variante para el cliente (sin precios)

```bash
DOSSIER_CLIENTE=1 node scripts/generar-dossier-crm-ventas.cjs
```

Escribe `documentacion_comercial/Dossier_Cliente_CRM_Ventas.pdf` (12 páginas) y
su HTML. Es el documento que se deja al cliente: mantiene el problema, las seis
pantallas, el coste de tener las piezas repartidas y la puesta en marcha, y
quita todo lo que solo sirve al comercial —tarifas y tramos, ocho objeciones,
guion de quince minutos y checklist de cierre—. Donde estaba el precio queda
una llamada a la acción con el contacto (`info@volkern.app`) y la prueba de
`TRIAL` días, que sigue leyendo de `lib/crm-pricing.ts`.

Las páginas de esta variante viven en `scripts/dossier-crm-ventas/cliente.cjs`
(sin puppeteer, para poder probarlas) y
`tests/dossier-cliente-sin-precios.test.ts` falla si alguien vuelve a meter una
tarifa o el material interno en el documento del cliente.

Las dos páginas de precio (niveles, tramos de volumen y prueba) y la tabla de
funciones por nivel salen de `lib/crm-pricing.ts`, la fuente única del cobro,
vía `scripts/dossier-crm-ventas/escalera.cjs`; aquí no se escribe ningún precio
a mano. `tests/dossier-crm-ventas-precios.test.ts` compara esa lectura con el
módulo y con `calcularPrecioCrm`, así que un cambio de tarifa sin regenerar el
dossier rompe la suite. Usa **`puppeteer`** (headless Chromium), con los mismos
requisitos que el resto.

---

## Nota sobre `lib/pdf-generator.ts` y `lib/finance/pdf-render.ts`

No son scripts, pero se ejecutan dentro de la app (rutas de API de
cotizaciones/contratos/certificados y escaneo de gastos). En producción el
contenedor corre Node 20.20.2, por lo que no requieren acción. Solo importan si
se ejecutan tests o herramientas locales con Node 18.
