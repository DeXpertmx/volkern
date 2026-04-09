
/**
 * Configuración de templates de Canva para Volkern CRM
 * 
 * Los IDs de templates deben ser obtenidos de tu cuenta de Canva.
 * Para obtenerlos:
 * 1. Ve a Canva y crea/selecciona un template
 * 2. Copia el ID del template desde la URL o mediante la API de Canva
 * 3. Agrégalo aquí con un nombre descriptivo
 */

export const CANVA_TEMPLATES = {
  facebook_ad: {
    id: 'DAFHEsUA2dk',
    name: 'Anuncio de Facebook',
    description: 'Template optimizado para anuncios de Facebook (1080x1080px)',
    aspectRatio: '1:1',
  },
  instagram_story: {
    id: 'DAFHEoL96Fs',
    name: 'Historia de Instagram',
    description: 'Template para historias de Instagram (1080x1920px)',
    aspectRatio: '9:16',
  },
  instagram_post: {
    id: 'DAFHDVWl8FQ',
    name: 'Publicación de Instagram',
    description: 'Template para publicaciones cuadradas de Instagram (1080x1080px)',
    aspectRatio: '1:1',
  },
  email_header: {
    id: 'DAFHESYiD5A',
    name: 'Encabezado de Email',
    description: 'Template para encabezados de email marketing (600x300px)',
    aspectRatio: '2:1',
  },
  social_media_post: {
    id: 'DAFHDVWl8FQ',
    name: 'Publicación en Redes Sociales',
    description: 'Template versátil para cualquier red social (1080x1080px)',
    aspectRatio: '1:1',
  },
  twitter_post: {
    id: 'DAFHDVWl8FQ',
    name: 'Publicación de Twitter',
    description: 'Template optimizado para Twitter/X (1200x675px)',
    aspectRatio: '16:9',
  },
} as const;

export type TemplateKey = keyof typeof CANVA_TEMPLATES;

/**
 * Obtiene la configuración de un template por su clave
 */
export function getTemplateConfig(key: TemplateKey) {
  return CANVA_TEMPLATES[key];
}

/**
 * Obtiene todos los templates disponibles
 */
export function getAllTemplates() {
  return Object.entries(CANVA_TEMPLATES).map(([key, config]) => ({
    key: key as TemplateKey,
    ...config,
  }));
}

/**
 * Valida si el Client ID de Canva está configurado
 */
export function isCanvaConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_CANVA_CLIENT_ID;
}

/**
 * Obtiene el Client ID de Canva desde las variables de entorno
 */
export function getCanvaClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_CANVA_CLIENT_ID;
}
