import { Template } from '../types';

export const landingTemplates: Template[] = [
  {
    id: 'landing',
    name: 'Landing Page Base',
    description: 'Plantilla de aterrizaje base.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/autopilot.json').then(m => m.default)
    },
    tags: ['landing', 'base']
  },
  {
    id: 'landing-autopilot',
    name: 'Autopilot',
    description: 'Plantilla moderna para software y automatización.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/autopilot.json').then(m => m.default)
    },
    tags: ['landing', 'software', 'tech']
  },
  {
    id: 'landing-buildcraft',
    name: 'BuildCraft',
    description: 'Perfecta para empresas de construcción o arquitectura.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/buildcraft.json').then(m => m.default)
    },
    tags: ['landing', 'business', 'construction']
  },
  {
    id: 'landing-connectly',
    name: 'Connectly',
    description: 'Diseñada para agencias y servicios de comunicación.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/connectly.json').then(m => m.default)
    },
    tags: ['landing', 'agency', 'communication']
  },
  {
    id: 'landing-contentiq',
    name: 'ContentIQ',
    description: 'Ideal para creadores de contenido y portales de noticias.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/contentiq.json').then(m => m.default)
    },
    tags: ['landing', 'content', 'news']
  },
  {
    id: 'landing-wedding',
    name: 'Wedding',
    description: 'Plantilla elegante y minimalista para eventos especiales.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/wedding.json').then(m => m.default)
    },
    tags: ['landing', 'events', 'wedding']
  },
  {
    id: 'landing-zephyr',
    name: 'Zephyr',
    description: 'Innovadora y rápida para startups creativas.',
    category: 'landing',
    data: {
      loadProjectData: () => import('./landing-page/zephyr.json').then(m => m.default)
    },
    tags: ['landing', 'startup', 'creative']
  }
];
