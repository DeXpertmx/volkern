import markdown
from weasyprint import HTML
from pathlib import Path

MD = Path('documentacion_tecnica/REPORTE_VERIFACTU_TECNICO.md')
PDF = Path('documentacion_tecnica/REPORTE_VERIFACTU_TECNICO.pdf')

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
  margin: 2cm 1.6cm 2cm 1.6cm;
  @top-center {
    content: "Volkern — Reporte Técnico Veri*Factu";
    font-family: "DejaVu Sans", sans-serif;
    font-size: 8pt;
    color: #7f8c8d;
  }
  @bottom-center {
    content: "Página " counter(page) " de " counter(pages);
    font-family: "DejaVu Sans", sans-serif;
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
  font-family: "DejaVu Sans", sans-serif;
  font-size: 9.5pt;
  line-height: 1.55;
  color: #2c3e50;
}
h1 {
  font-size: 15pt;
  color: #1a3a5c;
  margin-top: 1cm;
  padding-bottom: 0.12cm;
  border-bottom: 2px solid #2563eb;
  page-break-before: always;
}
h1:first-of-type {
  page-break-before: avoid;
  font-size: 18pt;
  text-align: center;
  border-bottom: 3px solid #2563eb;
  padding-bottom: 0.3cm;
  margin-bottom: 0.5cm;
}
h2 {
  font-size: 12pt;
  color: #1e40af;
  margin-top: 0.7cm;
  padding-bottom: 0.08cm;
  border-bottom: 1px solid #d1d5db;
}
h3 {
  font-size: 10.5pt;
  color: #374151;
  margin-top: 0.4cm;
}
h4 {
  font-size: 10pt;
  color: #4b5563;
  margin-top: 0.3cm;
}
p {
  margin-bottom: 0.25cm;
  text-align: justify;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.35cm 0;
  font-size: 8.5pt;
}
th {
  background-color: #1e3a5f;
  color: white;
  padding: 6px 8px;
  text-align: left;
  font-weight: bold;
}
td {
  padding: 5px 8px;
  border-bottom: 1px solid #e5e7eb;
}
tr:nth-child(even) td {
  background-color: #f8fafc;
}
code {
  font-family: "DejaVu Sans Mono", monospace;
  font-size: 8pt;
  background-color: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
}
pre {
  background-color: #1e293b;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 7.5pt;
  line-height: 1.35;
  margin: 0.25cm 0;
  white-space: pre-wrap;
  word-break: break-word;
}
pre code {
  background: none;
  color: inherit;
  padding: 0;
}
strong {
  color: #1a3a5c;
}
ul, ol {
  margin: 0.15cm 0;
  padding-left: 1.2em;
}
li {
  margin-bottom: 0.06cm;
}
blockquote {
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
  margin: 0.3cm 0;
  padding: 8px 14px;
  font-style: italic;
}
hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.5cm 0;
}
'''

full_html = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>{css}</style>
</head>
<body>
{html_body}
</body>
</html>
'''

HTML(string=full_html).write_pdf(PDF)

print(f'✅ PDF generado: {PDF}')
print(f'📄 Tamaño: {PDF.stat().st_size / 1024:.1f} KB')
