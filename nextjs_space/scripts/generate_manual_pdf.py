#!/usr/bin/env python3
"""Convert markdown to PDF for Manual de Facturación"""

import markdown
from weasyprint import HTML, CSS
import sys

input_file = sys.argv[1] if len(sys.argv) > 1 else "docs/manuales/Manual-Facturacion.md"
output_file = sys.argv[2] if len(sys.argv) > 2 else "docs/manuales/Manual-Facturacion.pdf"

with open(input_file, 'r', encoding='utf-8') as f:
    md_content = f.read()

css_string = """
@page {
    size: A4;
    margin: 2cm;
    @bottom-center {
        content: "Página " counter(page) " de " counter(pages);
        font-size: 9pt;
        color: #666;
    }
}
body {
    font-family: "Liberation Sans", "DejaVu Sans", sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #333;
}
h1 { font-size: 20pt; color: #1a3a5c; border-bottom: 2px solid #1a3a5c; padding-bottom: 8px; margin-top: 0; }
h2 { font-size: 16pt; color: #205cb0; margin-top: 24pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
h3 { font-size: 13pt; color: #333; margin-top: 16pt; }
h4 { font-size: 11pt; color: #555; margin-top: 12pt; }
table { border-collapse: collapse; width: 100%; margin: 12pt 0; font-size: 9pt; }
th, td { border: 1px solid #999; padding: 6pt 8pt; text-align: left; }
th { background-color: #1a3a5c; color: white; font-weight: bold; }
tr:nth-child(even) { background-color: #f5f5f5; }
code, pre { background-color: #f8f8f8; border: 1px solid #ddd; padding: 2pt 4pt; font-size: 8pt; }
pre { padding: 8pt; overflow-x: auto; }
blockquote { border-left: 4px solid #205cb0; margin-left: 0; padding-left: 12pt; color: #666; }
hr { border: none; border-top: 1px solid #ccc; margin: 16pt 0; }
img { max-width: 100%; }
strong { color: #1a3a5c; }
"""

html_content = markdown.markdown(
    md_content,
    extensions=['tables', 'fenced_code', 'toc']
)

full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Manual de Facturación - Volkern CRM</title>
</head>
<body>
{html_content}
</body>
</html>"""

HTML(string=full_html).write_pdf(output_file)
print(f"PDF generated: {output_file}")