#!/usr/bin/env python3
"""Genera PDF profesional del Análisis de Rentabilidad de Planes Volkern"""

import markdown
from weasyprint import HTML
from pathlib import Path

MD = Path('documentacion_tecnica/ANALISIS_RENTABILIDAD_PLANES.md')
PDF = Path('documentacion_tecnica/ANALISIS_RENTABILIDAD_PLANES.pdf')

with open(MD, 'r', encoding='utf-8') as f:
    md = f.read()

html_body = markdown.markdown(
    md,
    extensions=['tables', 'fenced_code', 'codehilite', 'toc', 'nl2br', 'sane_lists'],
    output_format='html5'
)

css = '''
@page {
    size: A4;
    margin: 2cm 1.8cm 2.2cm 1.8cm;
    @top-center {
        content: "Volkern — Análisis de Rentabilidad de Planes · CONFIDENCIAL";
        font-family: "DejaVu Sans", sans-serif;
        font-size: 7pt;
        color: #94a3b8;
    }
    @bottom-center {
        content: "Página " counter(page) " de " counter(pages);
        font-family: "DejaVu Sans", sans-serif;
        font-size: 8pt;
        color: #94a3b8;
    }
}
@page:first {
    @top-center { content: none; }
    margin-top: 2.5cm;
}

body {
    font-family: "DejaVu Sans", sans-serif;
    font-size: 9.5pt;
    line-height: 1.55;
    color: #1e293b;
}

h1 {
    font-size: 18pt;
    color: #1e40af;
    margin-top: 1.8cm;
    margin-bottom: 0.4cm;
    padding-bottom: 6px;
    border-bottom: 3px solid #3b82f6;
    page-break-before: always;
}
h1:first-of-type { page-break-before: avoid; }

h2 {
    font-size: 13pt;
    color: #1e3a5f;
    margin-top: 1cm;
    margin-bottom: 0.3cm;
    padding-bottom: 3px;
    border-bottom: 1px solid #cbd5e1;
}

h3 {
    font-size: 10.5pt;
    color: #334155;
    margin-top: 0.6cm;
    margin-bottom: 0.2cm;
}

p { margin-bottom: 0.4cm; text-align: justify; }

table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5cm 0;
    font-size: 8.5pt;
}
th {
    background: #1e40af;
    color: white;
    padding: 7px 9px;
    text-align: left;
    font-weight: 600;
}
td {
    padding: 6px 9px;
    border: 1px solid #e2e8f0;
}
tr:nth-child(even) { background: #f8fafc; }
tr:nth-child(odd) { background: white; }

/* Highlight cells with strong */
td strong {
    color: #1e40af;
}

code {
    background: #f1f5f9;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 8pt;
    font-family: "DejaVu Sans Mono", monospace;
    color: #0f172a;
}

pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 12px 14px;
    border-radius: 6px;
    font-size: 8pt;
    line-height: 1.5;
    margin: 0.3cm 0;
    overflow-x: auto;
}
pre code {
    background: none;
    color: inherit;
    padding: 0;
}

blockquote {
    border-left: 4px solid #3b82f6;
    background: #eff6ff;
    padding: 10px 14px;
    margin: 0.4cm 0;
    border-radius: 0 6px 6px 0;
    font-size: 9pt;
}

ul, ol { margin: 0.2cm 0 0.4cm 1.2em; }
li { margin-bottom: 2px; }

hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 1cm 0;
}

/* Cover-like first block */
body > h1:first-of-type {
    font-size: 22pt;
    text-align: center;
    border: none;
    padding-top: 3cm;
    color: #0f172a;
}
body > h1:first-of-type + blockquote {
    text-align: center;
    font-size: 9pt;
    border: none;
    background: none;
    padding: 0;
    margin-bottom: 2cm;
}
'''

html = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>{css}</style>
</head>
<body>
{html_body}
</body>
</html>'''

HTML(string=html).write_pdf(PDF)

size_kb = PDF.stat().st_size / 1024
print(f'✅ PDF generado: {PDF}')
print(f'📄 Tamaño: {size_kb:.1f} KB')
