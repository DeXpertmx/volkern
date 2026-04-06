export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'landing' | 'portfolio' | 'blog' | 'ecommerce' | 'business' | 'blank' | 'email' | 'document';
  thumbnail?: string;
  data: {
    html?: string;
    css?: string;
    components?: any[];
    styles?: any[];
    assets?: string[];
    projectData?: any; // To support directly from static imports
    loadProjectData?: () => Promise<any>; // For dynamic imports of large JSONs
  };
  tags: string[];
  isDefault?: boolean;
}

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: 'landing', name: 'Landing Page', icon: 'rocket' },
  { id: 'portfolio', name: 'Portfolio', icon: 'briefcase' },
  { id: 'blog', name: 'Blog', icon: 'book-open' },
  { id: 'ecommerce', name: 'E-commerce', icon: 'shopping-cart' },
  { id: 'business', name: 'Negocios', icon: 'building' },
  { id: 'email', name: 'Email Marketing', icon: 'mail' },
  { id: 'document', name: 'Documentos', icon: 'file-text' },
  { id: 'blank', name: 'En Blanco', icon: 'square' },
];
