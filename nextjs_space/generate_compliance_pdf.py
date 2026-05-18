import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

md_path = '/home/dexpert/Volkern/nextjs_space/docs/INFORME-CUMPLIMIENTO-VERIFACTU.md'
pdf_path = '/home/dexpert/Volkern/nextjs_space/docs/INFORME-CUMPLIMIENTO-VERIFACTU.pdf'

PAGE_WIDTH, PAGE_HEIGHT = letter

styles = getSampleStyleSheet()
title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, spaceAfter=12, textColor='#1a1a1a', alignment=1)
section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=11, spaceAfter=8, textColor='#2c3e50', borderPadding=5, backColor='#ecf0f1')
subsection_style = ParagraphStyle('SubSection', parent=styles['Heading3'], fontSize=10, spaceAfter=6, textColor='#2980b9')
normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=8, spaceAfter=4)
code_style = ParagraphStyle('Code', parent=styles['Normal'], fontSize=6, fontName='Courier', leftIndent=10, backColor='#f5f5f5')

def calculate_table_widths(num_cols):
    available_width = (PAGE_WIDTH - 1.2*inch)
    col_width = available_width / num_cols
    return [col_width for _ in range(num_cols)]

def parse_md(content):
    story = []
    lines = content.split('\n')
    in_code = False
    code_lines = []
    in_table = False
    table_data = []
    
    for line in lines:
        line = line.strip()
        
        if line.startswith('```'):
            if in_code:
                code_text = '<br/>'.join(code_lines).replace('<', '&lt;').replace('>', '&gt;')
                story.append(Paragraph(code_text, code_style))
                code_lines = []
                in_code = False
            else:
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        
        if line.startswith('|') and '---' not in line:
            if not in_table:
                in_table = True
                table_data = []
            cells = [c.strip() for c in line.split('|')[1:-1]]
            table_data.append(cells)
            continue
        elif in_table:
            if table_data:
                cols = len(table_data[0])
                col_widths = calculate_table_widths(cols)
                t = Table(table_data, colWidths=col_widths)
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), '#3498db'),
                    ('TEXTCOLOR', (0, 0), (-1, 0), '#ffffff'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, '#f8f9fa']),
                    ('TOPADDING', (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ]))
                story.append(t)
                story.append(Spacer(1, 0.08*inch))
            in_table = False
            continue
        
        if not line:
            story.append(Spacer(1, 0.05*inch))
            continue
        
        if line.startswith('# INFORME'):
            story.append(Paragraph(line.replace('# ', '').replace('  ', ' '), title_style))
        elif line.startswith('## '):
            story.append(Spacer(1, 0.1*inch))
            story.append(Paragraph(line.replace('## ', ''), section_style))
        elif line.startswith('### '):
            story.append(Paragraph(line.replace('### ', ''), subsection_style))
        elif line.startswith('> '):
            story.append(Paragraph(line.replace('> ', ''), normal_style))
        elif line.startswith('- '):
            story.append(Paragraph('• ' + line[2:], normal_style))
        else:
            clean_line = line.replace('**', '').replace('`', '')
            if len(clean_line) > 100:
                words = clean_line.split()
                lines_wrap = []
                current = ''
                for word in words:
                    if len(current + ' ' + word) < 100:
                        current += ' ' + word if current else word
                    else:
                        lines_wrap.append(current)
                        current = word
                if current:
                    lines_wrap.append(current)
                for l in lines_wrap:
                    story.append(Paragraph(l, normal_style))
            else:
                story.append(Paragraph(clean_line, normal_style))
    
    return story

with open(md_path, 'r', encoding='utf-8') as f:
    content = f.read()

doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=0.6*inch, rightMargin=0.6*inch, topMargin=0.5*inch, bottomMargin=0.5*inch)
doc.build(parse_md(content))
print(f'PDF actualizado con márgenes corregidos: {pdf_path}')