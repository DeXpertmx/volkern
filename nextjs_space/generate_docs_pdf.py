import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

# Documentation technique files
tech_docs = [
    ("/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/05_Tech_Logistics_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/05_Tech_Logistics_Hub.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/06_Tech_HR_Payroll_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/06_Tech_HR_Payroll_Hub.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/07_Tech_Contracts_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/07_Tech_Contracts_Hub.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/09_Tech_Finance_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_tecnica/09_Tech_Finance_Hub.pdf"),
]

# Commercial documentation files
comm_docs = [
    ("/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/03_Comercial_Logistics_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/03_Comercial_Logistics_Hub.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/04_Comercial_Finance_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/04_Comercial_Finance_Hub.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/05_Comercial_HR_Payroll_Vault.md", "/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/05_Comercial_HR_Payroll_Vault.pdf"),
    ("/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/07_Comercial_Contracts_Hub.md", "/home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/07_Comercial_Contracts_Hub.pdf"),
]

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, spaceAfter=12, textColor='#2C3E50')
heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=11, spaceAfter=8, textColor='#2980B9')
subhead_style = ParagraphStyle('SubHead', parent=styles['Heading3'], fontSize=10, spaceAfter=6, textColor='#E74C3C')
normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=9, spaceAfter=6)
bold_style = ParagraphStyle('Bold', parent=styles['Normal'], fontSize=9, spaceAfter=6, fontName='Helvetica-Bold')
mono_style = ParagraphStyle('Mono', parent=styles['Normal'], fontSize=8, spaceAfter=6, fontName='Courier')
code_style = ParagraphStyle('Code', parent=styles['Normal'], fontSize=8, spaceAfter=6, fontName='Courier', leftIndent=20)

def parse_md_to_paragraphs(content):
    story = []
    lines = content.split('\n')
    in_code_block = False
    code_content = []
    
    for line in lines:
        line = line.strip()
        
        if line.startswith('```'):
            if in_code_block:
                code_text = '\n'.join(code_content)
                story.append(Paragraph(f"<font face='Courier' size='7'>{code_text.replace('<', '&lt;').replace('>', '&gt;')}</font>", code_style))
                code_content = []
                in_code_block = False
            else:
                in_code_block = True
            continue
            
        if in_code_block:
            code_content.append(line)
            continue
        
        if not line:
            story.append(Spacer(1, 0.08*inch))
            continue
        
        if line.startswith('# '):
            story.append(Paragraph(line.replace('# ', ''), title_style))
        elif line.startswith('## '):
            story.append(Paragraph(line.replace('## ', ''), heading_style))
        elif line.startswith('### '):
            story.append(Paragraph(line.replace('### ', ''), subhead_style))
        elif line.startswith('- ') or line.startswith('* '):
            story.append(Paragraph(line, normal_style))
        elif line.startswith('|'):
            story.append(Paragraph(f"<font face='Courier' size='7'>{line}</font>", mono_style))
        elif '```' in line:
            continue
        elif line.startswith('```'):
            continue
        elif line.startswith('**') and line.endswith('**'):
            story.append(Paragraph(line.replace('**', ''), bold_style))
        else:
            story.append(Paragraph(line, normal_style))
    
    return story

print("Generando PDFs de Documentación Técnica...")
for md_path, pdf_path in tech_docs:
    print(f"  Generando: {os.path.basename(pdf_path)}")
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=0.6*inch, rightMargin=0.6*inch, topMargin=0.6*inch, bottomMargin=0.6*inch)
    story = parse_md_to_paragraphs(content)
    doc.build(story)

print("\nGenerando PDFs de Documentación Comercial...")
for md_path, pdf_path in comm_docs:
    print(f"  Generando: {os.path.basename(pdf_path)}")
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=0.6*inch, rightMargin=0.6*inch, topMargin=0.6*inch, bottomMargin=0.6*inch)
    story = parse_md_to_paragraphs(content)
    doc.build(story)

print("\n✓ Todos los PDFs generados correctamente")