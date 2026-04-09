import { Template } from '../types';

export const portfolioTemplates: Template[] = [
  {
    id: 'portfolio',
    name: 'Portafolio Base',
    description: 'Plantilla base para portafolios.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/artify.json').then(m => m.default)
    },
    tags: ['portfolio', 'base']
  },
  {
    id: 'portfolio-artify',
    name: 'Artify',
    description: 'Un portafolio perfecto para artistas y creativos.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/artify.json').then(m => m.default)
    },
    tags: ['portfolio', 'art', 'creative']
  },
  {
    id: 'portfolio-dreamspace',
    name: 'Dreamspace',
    description: 'Muestra tus proyectos en un espacio de ensueño.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/dreamspace.json').then(m => m.default)
    },
    tags: ['portfolio', 'design', 'modern']
  },
  {
    id: 'portfolio-flowdash',
    name: 'Flowdash',
    description: 'Portafolio orientado a resultados y flujo de trabajo.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/flowdash.json').then(m => m.default)
    },
    tags: ['portfolio', 'workflow', 'professional']
  },
  {
    id: 'portfolio-olivia',
    name: 'Olivia',
    description: 'Estilo elegante y personal para destacar tu perfil.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/olivia.json').then(m => m.default)
    },
    tags: ['portfolio', 'personal', 'elegant']
  },
  {
    id: 'portfolio-open-garden',
    name: 'Open Garden',
    description: 'Diseño abierto y fresco para mostrar tu crecimiento.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/open-garden.json').then(m => m.default)
    },
    tags: ['portfolio', 'fresh', 'open']
  },
  {
    id: 'portfolio-prism',
    name: 'Prism',
    description: 'Agrega un toque de color y luz a tu portafolio.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/prism.json').then(m => m.default)
    },
    tags: ['portfolio', 'colorful', 'light']
  },
  {
    id: 'portfolio-propfinder',
    name: 'Propfinder',
    description: 'Ideal para mostrar propiedades y bienes raíces.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/propfinder.json').then(m => m.default)
    },
    tags: ['portfolio', 'real-estate', 'property']
  },
  {
    id: 'portfolio-synapseai',
    name: 'Synapse AI',
    description: 'Portafolio hipermoderno e inteligente.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/synapseai.json').then(m => m.default)
    },
    tags: ['portfolio', 'ai', 'modern']
  },
  {
    id: 'portfolio-ux-portfolio',
    name: 'UX Portfolio',
    description: 'Especialmente diseñado para diseñadores UX/UI.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/ux-portfolio.json').then(m => m.default)
    },
    tags: ['portfolio', 'ux', 'ui']
  },
  {
    id: 'portfolio-zenstudio',
    name: 'Zen Studio',
    description: 'Minimalismo e impacto asegurados.',
    category: 'portfolio',
    data: {
      loadProjectData: () => import('./portfolio/zenstudio.json').then(m => m.default)
    },
    tags: ['portfolio', 'minimal', 'studio']
  }
];
