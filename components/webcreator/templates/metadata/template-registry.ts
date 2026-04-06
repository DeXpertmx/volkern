import { Template } from '../types';
import { blankTemplate } from '../data/blank';
import { underscoreBlankTemplate } from '../data/_blank';
import { landingTemplates } from '../data/landing';
import { portfolioTemplates } from '../data/portfolio';
import { tiendaTemplates } from '../data/tienda';
import { documentTemplates } from '../data/documents';
import { emailTemplates } from '../data/emails';

// Registry of all available templates
export const templateRegistry: Template[] = [
  underscoreBlankTemplate,
  blankTemplate,
  ...documentTemplates,
  ...emailTemplates,
  ...landingTemplates,
  ...portfolioTemplates,
  ...tiendaTemplates,
];

// Get all templates
export function getAllTemplates(): Template[] {
  return templateRegistry;
}

// Get template by ID
export function getTemplateById(id: string): Template | undefined {
  return templateRegistry.find(template => template.id === id);
}

// Get templates by category
export function getTemplatesByCategory(category: string): Template[] {
  return templateRegistry.filter(template => template.category === category);
}

// Get default template
export function getDefaultTemplate(): Template {
  return templateRegistry.find(template => template.isDefault) || blankTemplate;
}

// Get template data for GrapesJS
export function getTemplateData(templateId: string): { html?: string; css?: string; assets?: string[]; projectData?: any; loadProjectData?: () => Promise<any> } | null {
  const template = getTemplateById(templateId);
  if (!template) return null;
  
  return {
    html: template.data.html,
    css: template.data.css,
    assets: template.data.assets,
    projectData: template.data.projectData,
    loadProjectData: template.data.loadProjectData,
  };
}