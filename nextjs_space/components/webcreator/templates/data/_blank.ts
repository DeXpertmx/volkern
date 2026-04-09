import { Template } from '../types';

export const underscoreBlankTemplate: Template = {
  id: '_blank',
  name: 'Desde Cero',
  description: 'Plantilla base completamente limpia para comenzar desde cero.',
  category: 'blank',
  thumbnail: '/templates/thumbnails/blank.jpg',
  isDefault: false,
  data: {
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>{{PAGE_TITLE}}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="index,follow" />
    <meta name="generator" content="GrapesJS Studio" />
  </head>
  <body id="ibody" class="gjs-t-body" data-gjs-droppable="true"><!-- Header --><!-- Hero Section --><!-- Features Section --><!-- About Section --><!-- Brand Section --><!-- Team Section --><!-- Gallery/Showcase Section --><!-- Testimonials Section --><!-- Pricing Section --><!-- Blog Section --><!-- CTA Section --><!-- Footer --></body>
</html>`,
    css: '',
    assets: [],
  },
  tags: ['blank', 'empty', 'start', 'new', 'clean'],
};