from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

doc = SimpleDocTemplate("/home/dexpert/Volkern/nextjs_space/skills_por_modulos.pdf", pagesize=letter)

styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=18,
    spaceAfter=20,
    textColor='#2C3E50'
)
module_style = ParagraphStyle(
    'ModuleTitle',
    parent=styles['Heading2'],
    fontSize=14,
    spaceAfter=12,
    textColor='#2980B9',
    bold=True
)
skill_title_style = ParagraphStyle(
    'SkillTitle',
    parent=styles['Heading3'],
    fontSize=12,
    spaceAfter=6,
    textColor='#E74C3C',
    bold=True
)
desc_style = ParagraphStyle(
    'Description',
    parent=styles['Normal'],
    fontSize=10,
    spaceAfter=20,
    leftIndent=20
)

story = []

title = Paragraph("Inventario de Skills por Módulos", title_style)
story.append(title)
story.append(Spacer(1, 0.3*inch))

modules = [
    {
        "name": "Módulo: Configuración de OpenCode",
        "skills": [
            {
                "title": "customize-opencode",
                "description": "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself."
            }
        ]
    },
    {
        "name": "Módulo: Pinokio (Desarrollo de Launchers)",
        "skills": [
            {
                "title": "gepeto",
                "description": "Guide for building 1-click launchers and building apps with launchers built-in using Pinokio. Proporciona una guía completa para desarrollar proyectos de Pinokio con patrones de ejecución obligatorios, estructura de proyectos, flujos de trabajo de desarrollo, y mejores prácticas."
            },
            {
                "title": "pinokio",
                "description": "Discover, launch, and use apps and tools for the current task. Skill de runtime para control de apps de Pinokio. Incluye comandos de búsqueda, ejecución, gestión de estado y llamadas a APIs."
            }
        ]
    }
]

for module in modules:
    module_title = Paragraph(module["name"], module_style)
    story.append(module_title)
    
    for skill in module["skills"]:
        skill_title = Paragraph(f"• {skill['title']}", skill_title_style)
        story.append(skill_title)
        
        description = Paragraph(skill['description'], desc_style)
        story.append(description)
    
    story.append(Spacer(1, 0.2*inch))

doc.build(story)
print("PDF generado exitosamente: /home/dexpert/Volkern/nextjs_space/skills_por_modulos.pdf")