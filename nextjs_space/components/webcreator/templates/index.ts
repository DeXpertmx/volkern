// Export types
export * from './types';

// Export template registry
export * from './metadata/template-registry';

// Export Template Gallery component
export { TemplateGallery } from './TemplateGallery';

// Export individual templates
export { blankTemplate } from './data/blank';
export { underscoreBlankTemplate } from './data/_blank';
export { landingTemplates } from './data/landing';
export { portfolioTemplates } from './data/portfolio';
export { tiendaTemplates } from './data/tienda';

// Re-export template registry as default
export { templateRegistry as default } from './metadata/template-registry';