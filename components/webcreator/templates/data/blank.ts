import { Template } from '../types';
import blankData from './blank-data-formatted.json';

export const blankTemplate: Template = {
  id: 'blank',
  name: 'En Blanco',
  description: 'Comienza con una página completamente vacía y construye desde cero.',
  category: 'blank',
  thumbnail: '/templates/thumbnails/blank.jpg',
  isDefault: true,
  data: {
    projectData: blankData,
  },
  tags: ['blank', 'empty', 'start', 'new'],
};