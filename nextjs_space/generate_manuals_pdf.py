from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import os

manuals = [
    ("/home/dexpert/Volkern/nextjs_space/manuales_operativos/06_Logistica.md", "/home/dexpert/Volkern/nextjs_space/manuales_operativos/06_Logistica.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/manuales_operativos/07_HR_Nomina.md", "/home/dexpert/Volkern/nextjs_space/manuales_operativos/07_HR_Nomina.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/manuales_operativos/08_Contracts.md", "/home/dexpert/Volkern/nextjs_space/manuales_operativos/08_Contracts.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/manuales_operativos/10_Finanzas.md", "/home/dexpert/Volkern/nextjs_space/manuales_operativos/10_Finanzas.pdf"),
]

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, spaceAfter=15, textColor='#2C3E50')
heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=12, spaceAfter=10, textColor='#2980B9')
normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=10, spaceAfter=8)
bold_style = ParagraphStyle('Bold', parent=styles['Normal'], fontSize=10, spaceAfter=8, fontName='Helvetica-Bold')
mono_style = ParagraphStyle('Mono', parent=styles['Normal'], fontSize=9, spaceAfter=8, fontName='Courier')

def parse_markdown_to_paragraphs(content):
    story = []
    lines = content.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            story.append(Spacer(1, 0.1*inch))
            continue
        
        if line.startswith('## '):
            story.append(Paragraph(line.replace('## ', ''), title_style))
        elif line.startswith('### '):
            story.append(Paragraph(line.replace('### ', ''), heading_style))
        elif line.startswith('- ') or line.startswith('* '):
            story.append(Paragraph(line, normal_style))
        elif line.startswith('|'):
            story.append(Paragraph(f"<font face='Courier' size='8'>{line}</font>", mono_style))
        elif line.startswith('**') and '**' in line[2:]:
            story.append(Paragraph(line.replace('**', ''), bold_style))
        else:
            story.append(Paragraph(line, normal_style))
    
    return story

for md_path, pdf_path in manuals:
    print(f"Generando: {pdf_path}")
    
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=0.75*inch, rightMargin=0.75*inch)
    story = parse_markdown_to_paragraphs(content)
    doc.build(story)
    print(f"  ✓ Generado")

print("\n✓ Todos los PDFs de manuales operativos generados")