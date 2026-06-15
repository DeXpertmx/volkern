#!/usr/bin/env python3
"""
Genera un PDF profesional del Reporte del Sistema Contable de Volkern.
Usa WeasyPrint para conversión HTML → PDF con diseño corporativo.
"""

import markdown
import re
from weasyprint import HTML
from pathlib import Path

# ─── Rutas ─────────────────────────────────────────────────────────────
MD_PATH = Path("/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/REPORTE_SISTEMA_CONTABLE.md")
PDF_PATH = Path("/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/REPORTE_SISTEMA_CONTABLE.pdf")

# ─── Leer el Markdown ──────────────────────────────────────────────────
with open(MD_PATH, "r", encoding="utf-8") as f:
    md_content = f.read()

# ─── Convertir Markdown a HTML ─────────────────────────────────────────
md_extensions = [
    "tables",
    "fenced_code",
    "codehilite",
    "toc",
    "nl2br",
    "sane_lists",
]

html_body = markdown.markdown(md_content, extensions=md_extensions, output_format="html5")

# ─── Post-procesar HTML para mejorar la estructura ─────────────────────
# Convertir h1 + emoji al formato correcto
html_body = html_body.replace("<h1>📊", "<h1>")
html_body = html_body.replace("<h1>", '<h1 class="main-title">')
html_body = re.sub(r"</h1>", "</h1>", html_body)

# ─── CSS Profesional ───────────────────────────────────────────────────
css = """
@page {
  size: A4;
  margin: 2.2cm 1.8cm 2.2cm 1.8cm;
  @top-center {
    content: "Volkern — Reporte del Sistema Contable";
    font-family: 'DejaVu Sans', sans-serif;
    font-size: 8pt;
    color: #7f8c8d;
  }
  @bottom-center {
    content: "Página " counter(page) " de " counter(pages);
    font-family: 'DejaVu Sans', sans-serif;
    font-size: 8pt;
    color: #7f8c8d;
  }
}

@page :first {
  @top-center {
    content: none;
  }
}

body {
  font-family: 'DejaVu Sans', sans-serif;
  font-size: 10pt;
  line-height: 1.6;
  color: #2c3e50;
  margin: 0;
  padding: 0;
}

/* ─── Portada ──────────────────────────────────────── */
h1.main-title {
  font-size: 22pt;
  color: #1a3a5c;
  text-align: center;
  margin-top: 3cm;
  margin-bottom: 0.3cm;
  padding-bottom: 0.4cm;
  border-bottom: 3px solid #2980b9;
  page-break-before: avoid;
}

h1.main-title + p, h1.main-title ~ p:first-of-type {
  text-align: center;
  font-size: 11pt;
  color: #5d6d7e;
  margin-bottom: 1.5cm;
}

h1.main-title ~ p:nth-of-type(2) {
  text-align: center;
  font-size: 9pt;
  color: #95a5a6;
  margin-bottom: 2.5cm;
}

/* ─── Encabezados ──────────────────────────────────── */
h1 {
  font-size: 16pt;
  color: #1a3a5c;
  margin-top: 1.2cm;
  margin-bottom: 0.4cm;
  padding-bottom: 0.15cm;
  border-bottom: 2px solid #2980b9;
  page-break-after: avoid;
}

h1:not(.main-title) {
  font-size: 14pt;
  margin-top: 1cm;
}

h2 {
  font-size: 12pt;
  color: #2471a3;
  margin-top: 0.7cm;
  margin-bottom: 0.25cm;
  page-break-after: avoid;
}

h3 {
  font-size: 10.5pt;
  color: #2c3e50;
  margin-top: 0.5cm;
  margin-bottom: 0.2cm;
  page-break-after: avoid;
}

h4 {
  font-size: 10pt;
  color: #34495e;
  margin-top: 0.4cm;
  margin-bottom: 0.15cm;
}

/* ─── Párrafos ─────────────────────────────────────── */
p {
  margin: 0.15cm 0;
  text-align: justify;
}

strong {
  color: #1a3a5c;
}

/* ─── Tablas ───────────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.35cm 0;
  font-size: 9pt;
  page-break-inside: avoid;
}

thead {
  background-color: #1a3a5c;
  color: #ffffff;
}

th {
  padding: 7px 8px;
  text-align: left;
  font-weight: 600;
  font-size: 8.5pt;
  border: 1px solid #1a3a5c;
}

td {
  padding: 5px 8px;
  border: 1px solid #d5dbdb;
  vertical-align: top;
}

tbody tr:nth-child(even) {
  background-color: #eaf2f8;
}

tbody tr:nth-child(odd) {
  background-color: #ffffff;
}

/* ─── Código ───────────────────────────────────────── */
code {
  font-family: 'DejaVu Sans Mono', monospace;
  font-size: 8pt;
  background-color: #f4f6f6;
  padding: 1px 4px;
  border-radius: 3px;
  color: #c0392b;
  white-space: nowrap;
}

pre {
  background-color: #1e1e2e;
  color: #cdd6f4;
  font-family: 'DejaVu Sans Mono', monospace;
  font-size: 7.5pt;
  line-height: 1.35;
  padding: 10px 12px;
  border-radius: 5px;
  overflow-x: auto;
  margin: 0.3cm 0;
  page-break-inside: avoid;
}

pre code {
  background-color: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
  white-space: pre;
}

/* ─── Listas ───────────────────────────────────────── */
ul, ol {
  margin: 0.15cm 0;
  padding-left: 1.2cm;
}

li {
  margin-bottom: 3px;
}

ul ul, ol ol, ul ol, ol ul {
  margin: 3px 0;
}

/* ─── Bloques destacados ───────────────────────────── */
blockquote {
  border-left: 4px solid #2980b9;
  margin: 0.3cm 0;
  padding: 0.2cm 0.5cm;
  background-color: #eaf2f8;
  font-style: italic;
  color: #2c3e50;
  page-break-inside: avoid;
}

/* ─── Separador visual ─────────────────────────────── */
hr {
  border: none;
  border-top: 1px solid #bdc3c7;
  margin: 0.5cm 0;
}

/* ─── Tabla de contenido ────────────────────────────── */
.toc {
  background-color: #f8f9fa;
  border: 1px solid #d5dbdb;
  border-radius: 5px;
  padding: 0.4cm 0.6cm;
  margin: 0.5cm 0;
  page-break-inside: avoid;
}

.toc ul {
  list-style: none;
  padding-left: 0.3cm;
}

.toc a {
  color: #2471a3;
  text-decoration: none;
}

.toc a::after {
  content: none !important;
}

/* ─── Saltos de página ─────────────────────────────── */
h1:not(.main-title) {
  page-break-before: always;
}

h1.main-title {
  page-break-before: avoid;
}

/* No saltar después de la portada si es el primer heading después de h1 */
body > h1:nth-of-type(2) {
  page-break-before: avoid;
}

/* ─── Estilo de la caja ASCII ──────────────────────── */
pre code {
  white-space: pre;
  font-size: 6.5pt;
}

/* ─── Links ────────────────────────────────────────── */
a {
  color: #2471a3;
  text-decoration: none;
}

/* ─── Nota al pie / metadata ───────────────────────── */
em:last-child {
  font-size: 8pt;
  color: #95a5a6;
}
"""

# ─── HTML completo ─────────────────────────────────────────────────────
html_template = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Volkern — Reporte del Sistema Contable</title>
  <style>{css}</style>
</head>
<body>
  {html_body}
</body>
</html>"""

# ─── Generar PDF ───────────────────────────────────────────────────────
print(f"📄 Generando PDF desde: {MD_PATH.name}")
print(f"   Tamaño del Markdown: {len(md_content):,} caracteres")
print(f"   Tamaño del HTML:     {len(html_template):,} caracteres")

HTML(string=html_template).write_pdf(str(PDF_PATH))

file_size_kb = PDF_PATH.stat().st_size / 1024
print(f"\n✅ PDF generado exitosamente:")
print(f"   📁 Ruta:  {PDF_PATH}")
print(f"   📏 Tamaño: {file_size_kb:.1f} KB")
