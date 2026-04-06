import { Editor } from "grapesjs";

// Tipos para las plantillas
export interface WebCreatorTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Categorías de plantillas
export const TEMPLATE_CATEGORIES = [
  { id: 'business', name: 'Negocios', icon: '🏢' },
  { id: 'portfolio', name: 'Portafolio', icon: '🎨' },
  { id: 'ecommerce', name: 'E-commerce', icon: '🛒' },
  { id: 'blog', name: 'Blog', icon: '📝' },
  { id: 'landing', name: 'Landing Page', icon: '🎯' },
  { id: 'agency', name: 'Agencia', icon: '💼' },
];

// Plantillas predeterminadas
export const DEFAULT_TEMPLATES: WebCreatorTemplate[] = [
  {
    id: 'landing-basic',
    name: 'Landing Básica',
    description: 'Una página de destino limpia y profesional',
    category: 'landing',
    thumbnail: '/templates/landing-basic.png',
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'portfolio-modern',
    name: 'Portafolio Moderno',
    description: 'Diseño contemporáneo para mostrar tu trabajo',
    category: 'portfolio',
    thumbnail: '/templates/portfolio-modern.png',
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'business-corporate',
    name: 'Empresa Corporativa',
    description: 'Plantilla profesional para negocios corporativos',
    category: 'business',
    thumbnail: '/templates/business-corporate.png',
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Servicio para manejar las plantillas
class TemplateService {
  private templates: WebCreatorTemplate[] = [...DEFAULT_TEMPLATES];

  // Obtener todas las plantillas
  getAllTemplates(): WebCreatorTemplate[] {
    return this.templates;
  }

  // Obtener plantillas por categoría
  getTemplatesByCategory(category: string): WebCreatorTemplate[] {
    return this.templates.filter(template => template.category === category);
  }

  // Obtener una plantilla por ID
  getTemplateById(id: string): WebCreatorTemplate | undefined {
    return this.templates.find(template => template.id === id);
  }

  // Guardar una nueva plantilla
  saveTemplate(template: Omit<WebCreatorTemplate, 'createdAt' | 'updatedAt'>): WebCreatorTemplate {
    const newTemplate: WebCreatorTemplate = {
      ...template,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.templates.push(newTemplate);
    return newTemplate;
  }

  // Actualizar una plantilla existente
  updateTemplate(id: string, updates: Partial<WebCreatorTemplate>): WebCreatorTemplate | undefined {
    const index = this.templates.findIndex(template => template.id === id);
    if (index === -1) return undefined;
    
    this.templates[index] = {
      ...this.templates[index],
      ...updates,
      updatedAt: new Date(),
    };
    
    return this.templates[index];
  }

  // Eliminar una plantilla
  deleteTemplate(id: string): boolean {
    const initialLength = this.templates.length;
    this.templates = this.templates.filter(template => template.id !== id);
    return this.templates.length !== initialLength;
  }

  // Aplicar una plantilla al editor
  async applyTemplateToEditor(editor: Editor, templateId: string): Promise<boolean> {
    const template = this.getTemplateById(templateId);
    if (!template) return false;
    
    try {
      editor.loadProjectData(template.data);
      return true;
    } catch (error) {
      console.error('Error al aplicar la plantilla:', error);
      return false;
    }
  }

  // Crear una plantilla desde el estado actual del editor
  async createTemplateFromEditor(editor: Editor, name: string, description: string, category: string): Promise<WebCreatorTemplate> {
    const data = editor.getProjectData() as Record<string, unknown>;
    
    const template: Omit<WebCreatorTemplate, 'createdAt' | 'updatedAt'> = {
      id: `template-${Date.now()}`,
      name,
      description,
      category,
      thumbnail: '/templates/default.png',
      data,
    };
    
    return this.saveTemplate(template);
  }
}

// Instancia singleton del servicio
export const templateService = new TemplateService();