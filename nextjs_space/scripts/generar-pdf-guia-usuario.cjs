#!/usr/bin/env node
/**
 * Genera el HTML de la guía de usuario de hospitality para imprimir a PDF
 * con Chrome headless (--print-to-pdf).
 *
 * Uso: node scripts/generar-pdf-guia-usuario.cjs
 * Entrada: docs/hospitality-guia-usuario.md
 * Salida:  /tmp/hospitality-guia-usuario.html
 *
 * Es un script de entrega de documentación, no del producto: no toca la BD
 * ni el build. marked ya es dependencia del repo.
 */
const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');

const RAIZ = path.join(__dirname, '..');
const ENTRADA = path.join(RAIZ, 'docs', 'hospitality-guia-usuario.md');
const SALIDA = process.argv[2] || '/tmp/hospitality-guia-usuario.html';

const md = fs.readFileSync(ENTRADA, 'utf8');

// Las capturas de la guía viven junto al .md (docs/img/...): sus rutas relativas
// no resuelven desde /tmp, así que las incrustamos como data-URI.
function incrustarImagenes(markdown) {
  const base = path.dirname(ENTRADA);
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (completa, alt, ruta) => {
    if (/^https?:\/\//.test(ruta)) return completa;
    const fichero = path.join(base, ruta);
    try {
      const datos = fs.readFileSync(fichero);
      const tipo = ruta.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `![${alt}](data:${tipo};base64,${datos.toString('base64')})`;
    } catch {
      console.warn(`[pdf] imagen no encontrada: ${fichero}`);
      return completa;
    }
  });
}
const cuerpo = marked.parse(incrustarImagenes(md), { gfm: true, breaks: false });

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern Hospitality — Guía del usuario</title>
<style>
  @page {
    size: A4;
    margin: 20mm 16mm 18mm 16mm;
  }
  @media print {
    .portada { break-after: page; }
    h2 { break-before: page; }
    h2.continua { break-before: auto; }
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Segoe UI', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #1e293b;
    margin: 0;
  }
  /* Portada */
  .portada {
    height: 245mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    padding: 0 12mm;
  }
  .portada .marca {
    font-size: 13pt;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 18mm;
  }
  .portada h1 { border: none; font-size: 30pt; line-height: 1.2; margin: 0 0 8mm; }
  .portada .modulo {
    font-size: 20pt;
    color: #4f46e5;
    font-weight: 700;
    margin-bottom: 14mm;
  }
  .portada p { color: #475569; max-width: 130mm; margin: 0 auto 3mm; }
  .portada .fecha { margin-top: 22mm; font-size: 9pt; color: #94a3b8; }

  h1, h2, h3, h4 { color: #0f172a; line-height: 1.3; }
  h1 { font-size: 19pt; margin: 0 0 10pt; }
  h2 {
    font-size: 15pt;
    margin: 22pt 0 8pt;
    padding-bottom: 4pt;
    border-bottom: 2px solid #e2e8f0;
  }
  h3 { font-size: 12pt; margin: 14pt 0 5pt; }
  h4 { font-size: 10.5pt; margin: 10pt 0 4pt; }
  p { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 2.5pt; }
  a { color: #4f46e5; text-decoration: none; }
  strong { color: #0f172a; }

  code {
    font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace;
    font-size: 8.5pt;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 0.5pt 3pt;
    color: #334155;
  }
  pre {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 8pt 10pt;
    white-space: pre-wrap;      /* nada se recorta en el borde de página */
    overflow-wrap: break-word;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  pre code { background: none; border: none; padding: 0; font-size: 8pt; }

  blockquote {
    margin: 8pt 0;
    padding: 6pt 10pt;
    border-left: 3px solid #a5b4fc;
    background: #eef2ff;
    border-radius: 0 5px 5px 0;
    color: #3730a3;
  }
  blockquote p { margin: 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 12pt;
    font-size: 8.8pt;
  }
  th {
    background: #1e293b;
    color: #fff;
    text-align: left;
    padding: 4.5pt 6pt;
    font-weight: 600;
  }
  td { padding: 4pt 6pt; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  hr { border: none; border-top: 1px solid #e2e8f0; margin: 14pt 0; }

  /* Capturas del flujo del huésped */
  img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 5px; margin: 4pt 0 2pt; }
  p:has(> img:only-child) { text-align: center; break-inside: avoid; page-break-inside: avoid; }
  figcaption, em { color: #64748b; }
</style>
</head>
<body>
<div class="portada">
  <div class="marca">Volkern</div>
  <h1>Guía del usuario</h1>
  <div class="modulo">Módulo de Hospitality</div>
  <p>De la primera propiedad a la reseña del huésped: uso paso a paso del
  módulo — propiedades, tarifas, reservas, Booking Engine, registro de
  viajeros, operaciones, finanzas y automatizaciones.</p>
  <p class="fecha">Volkern · Documentación de producto · Septiembre 2026</p>
</div>
${cuerpo}
</body>
</html>`;

fs.writeFileSync(SALIDA, html, 'utf8');
console.log('HTML generado:', SALIDA, `(${(html.length / 1024).toFixed(0)} KB)`);
