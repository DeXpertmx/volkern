import { Template } from '../types';

export const tiendaTemplates: Template[] = [
  {
    id: 'tienda',
    name: 'Tienda Base',
    description: 'Plantilla base para tiendas online.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/freshbite.json').then(m => m.default)
    },
    tags: ['ecommerce', 'base']
  },
  {
    id: 'tienda-freshbite',
    name: 'Freshbite',
    description: 'La opción perfecta para sitios de comida o restaurantes.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/freshbite.json').then(m => m.default)
    },
    tags: ['ecommerce', 'food', 'restaurant']
  },
  {
    id: 'tienda-healthcare-plus',
    name: 'Healthcare Plus',
    description: 'Especializada en servicios de salud integral.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/healthcare-plus.json').then(m => m.default)
    },
    tags: ['ecommerce', 'health', 'medical']
  },
  {
    id: 'tienda-jupiter',
    name: 'Jupiter',
    description: 'Una tienda versátil para cualquier tipo de producto.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/jupiter.json').then(m => m.default)
    },
    tags: ['ecommerce', 'shop', 'versatile']
  },
  {
    id: 'tienda-medicare',
    name: 'Medicare',
    description: 'Diseñada para clínicas y venta de material médico.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/medicare.json').then(m => m.default)
    },
    tags: ['ecommerce', 'clinic', 'medical']
  },
  {
    id: 'tienda-solestyle',
    name: 'Solestyle',
    description: 'Lo mejor para ropa, zapatos y marcas de moda.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/solestyle.json').then(m => m.default)
    },
    tags: ['ecommerce', 'fashion', 'clothing']
  },
  {
    id: 'tienda-sound-device',
    name: 'Sound Device',
    description: 'Tienda de electrónica, audio o tecnología.',
    category: 'ecommerce',
    data: {
      loadProjectData: () => import('./tienda/sound-device.json').then(m => m.default)
    },
    tags: ['ecommerce', 'electronics', 'tech']
  }
];
