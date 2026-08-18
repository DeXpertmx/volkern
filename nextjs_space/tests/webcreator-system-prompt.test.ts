import { WEBCREATOR_SYSTEM_PROMPT } from '../lib/assistant/webcreator-system-prompt';

describe('WEBCREATOR_SYSTEM_PROMPT (prompt espectacular del Web Creator)', () => {
  it('es un string largo y sustantivo', () => {
    expect(typeof WEBCREATOR_SYSTEM_PROMPT).toBe('string');
    expect(WEBCREATOR_SYSTEM_PROMPT.length).toBeGreaterThan(5000);
  });

  it('documenta el catálogo COMPLETO de bloques premium (20 bloques)', () => {
    const bloques = [
      'hero-premium',
      'features-premium',
      'stats-premium',
      'team-premium',
      'testimonials-premium',
      'testimonials-carousel-premium',
      'pricing-premium',
      'cta-premium',
      'faq-premium',
      'gallery-premium',
      'carousel-premium',
      'contact-premium',
      'volkern-lead-form',
      'footer-premium',
      'icon-list-premium',
      'image-box-premium',
      'tabs-premium',
      'divider-premium',
      'progress-premium',
      'star-rating-premium',
      'toc-premium',
    ];
    for (const b of bloques) {
      expect(WEBCREATOR_SYSTEM_PROMPT).toContain(b);
    }
  });

  it('incluye la librería de imágenes reales (Unsplash) para evitar páginas sin fotos', () => {
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('images.unsplash.com');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('LIBRERÍA DE IMÁGENES');
    // Al menos varios IDs de fotos curados
    const ids = ['photo-1522071820081-009f0129c71c', 'photo-1556761175-5973dc0f32e7', 'photo-1573496359142-b8d87734a5a2'];
    for (const id of ids) {
      expect(WEBCREATOR_SYSTEM_PROMPT).toContain(id);
    }
  });

  it('reglas de diseño de alto impacto (imágenes, ritmo, profundidad, animación, mobile)', () => {
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('IMÁGENES REALES OBLIGATORIAS');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('RITMO DE SECCIONES');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('PROFUNDIDAD');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('ANIMACIÓN');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('MOBILE-FIRST');
  });

  it('no tiene el sesgo inmobiliario genérico de la plantilla vieja', () => {
    expect(WEBCREATOR_SYSTEM_PROMPT).not.toContain('Tulum');
    expect(WEBCREATOR_SYSTEM_PROMPT).not.toContain('PROYECTO DE LUJO');
    expect(WEBCREATOR_SYSTEM_PROMPT).not.toContain('Infinity Pool');
  });

  it('prohíbe placeholders genéricos y cifras inventadas', () => {
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('Tu Empresa');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('Lorem ipsum');
    expect(WEBCREATOR_SYSTEM_PROMPT).toContain('ANTI-PATRONES');
  });
});
