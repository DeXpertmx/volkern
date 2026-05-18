import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors

md_path = "/home/dexpert/Volkern/nextjs_space/docs/PLAN_CONTINUIDAD_VOLKERN.md"
pdf_path = "/home/dexpert/Volkern/nextjs_space/docs/PLAN_CONTINUIDAD_VOLKERN.pdf"

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, spaceAfter=20, textColor='#1a1a1a', alignment=1)
section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=14, spaceAfter=15, textColor='#2c3e50', borderPadding=10, backColor='#ecf0f1')
subsection_style = ParagraphStyle('SubSection', parent=styles['Heading3'], fontSize=11, spaceAfter=10, textColor='#2980b9')
normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=10, spaceAfter=8, alignment=0)
warning_style = ParagraphStyle('Warning', parent=styles['Normal'], fontSize=10, spaceAfter=10, textColor='#c0392b', fontName='Helvetica-Bold')
note_style = ParagraphStyle('Note', parent=styles['Normal'], fontSize=9, spaceAfter=10, textColor='#7f8c8d', leftIndent=20)
table_style = ParagraphStyle('Table', parent=styles['Normal'], fontSize=8, spaceAfter=8)
code_style = ParagraphStyle('Code', parent=styles['Normal'], fontSize=8, fontName='Courier', spaceAfter=8, leftIndent=20, backColor='#f8f9fa')

def parse_md(content):
    story = []
    lines = content.split('\n')
    in_table = False
    table_data = []
    in_code = False
    code_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line.startswith('```'):
            if in_code:
                code_text = '<br/>'.join(code_lines)
                story.append(Paragraph(f"<font face='Courier' size='8'>{code_text}</font>", code_style))
                code_lines = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        
        if in_code:
            code_lines.append(line.replace('<', '&lt;').replace('>', '&gt;'))
            i += 1
            continue
        
        if line.startswith('|') and '|' in line[1:]:
            if not in_table:
                in_table = True
                table_data = []
            cells = [cell.strip() for cell in line.split('|')[1:-1]]
            table_data.append(cells)
            i += 1
            continue
        elif in_table:
            col_widths = [2*inch for _ in range(len(table_data[0]))]
            t = Table(table_data, colWidths=col_widths)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), '#bdc3c7'),
                ('TEXTCOLOR', (0, 0), (-1, 0), '#2c3e50'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, '#f8f9fa']),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.15*inch))
            in_table = False
            continue
        
        if not line:
            story.append(Spacer(1, 0.1*inch))
            i += 1
            continue
        
        if line.startswith('# PLAN'):
            story.append(Paragraph(line.replace('# ', ''), title_style))
        elif line.startswith('## '):
            story.append(Spacer(1, 0.2*inch))
            story.append(Paragraph(line.replace('## ', '').replace('**', '').replace('**', ''), section_style))
        elif line.startswith('### '):
            story.append(Paragraph(line.replace('### ', '').replace('**', ''), subsection_style))
        elif line.startswith('> '):
            story.append(Paragraph(line.replace('> ', ''), warning_style))
        elif line.startswith('- [ ]'):
            story.append(Paragraph('☐ ' + line.replace('- [ ] ', ''), normal_style))
        elif line.startswith('- [x]'):
            story.append(Paragraph('☑ ' + line.replace('- [x] ', ''), normal_style))
        elif line.startswith('- ') or line.startswith('* '):
            clean_line = line.replace('- ', '').replace('* ', '')
            if clean_line.startswith('**') and '**' in clean_line[2:]:
                story.append(Paragraph(clean_line.replace('**', '').replace('**', ''), normal_style))
            else:
                story.append(Paragraph('• ' + clean_line, normal_style))
        elif line.startswith('|'):
            i += 1
            continue
        else:
            clean_line = line.replace('**', '').replace('`', '')
            story.append(Paragraph(clean_line, normal_style))
        
        i += 1
    
    return story

print("Generando PDF de Continuidad...")
with open(md_path, 'r', encoding='utf-8') as f:
    content = f.read()

doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=0.75*inch, rightMargin=0.75*inch, topMargin=0.75*inch, bottomMargin=0.75*inch)
story = parse_md(content)
doc.build(story)

print(f"✓ PDF generado: {pdf_path}")