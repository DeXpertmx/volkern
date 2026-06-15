import markdown
from weasyprint import HTML
from pathlib import Path

MD = Path('documentacion_tecnica/GUIA_VERIFACTU_CONTABLE.md')
PDF = Path('documentacion_tecnica/GUIA_VERIFACTU_CONTABLE.pdf')

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
  margin: 2.2cm 1.8cm 2.2cm 1.8cm;
  @top-center {
    content: "Volkern — Guía Veri*Factu para la Asesoría Contable";
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
  font-size: 10pt;
  line-height: 1.6;
  color: #2c3e50;
}
h1 {
  font-size: 16pt;
  color: #1a3a5c;
  margin-top: 1.2cm;
  padding-bottom: 0.15cm;
  border-bottom: 2px solid #2563eb;
  page-break-before: always;
}
h1:first-of-type {
  page-break-before: avoid;
  font-size: 20pt;
  text-align: center;
  border-bottom: 3px solid #2563eb;
  padding-bottom: 0.3cm;
  margin-bottom: 0.6cm;
}
h2 {
  font-size: 13pt;
  color: #1e40af;
  margin-top: 0.8cm;
  padding-bottom: 0.1cm;
  border-bottom: 1px solid #d1d5db;
}
h3 {
  font-size: 11pt;
  color: #374151;
  margin-top: 0.5cm;
}
p {
  margin-bottom: 0.3cm;
  text-align: justify;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.4cm 0;
  font-size: 9pt;
}
th {
  background-color: #1e3a5f;
  color: white;
  padding: 8px 10px;
  text-align: left;
  font-weight: bold;
}
td {
  padding: 6px 10px;
  border-bottom: 1px solid #e5e7eb;
}
tr:nth-child(even) td {
  background-color: #f8fafc;
}
code {
  font-family: "DejaVu Sans Mono", monospace;
  font-size: 8.5pt;
  background-color: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
}
pre {
  background-color: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 8pt;
  line-height: 1.4;
  margin: 0.3cm 0;
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
  margin: 0.2cm 0;
  padding-left: 1.2em;
}
li {
  margin-bottom: 0.1cm;
}
blockquote {
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
  margin: 0.4cm 0;
  padding: 10px 16px;
  font-style: italic;
}
hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.6cm 0;
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
