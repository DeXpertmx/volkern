import { describe, it, expect } from 'vitest';
import { MODERN_ICONS, getIconSvg } from '@/components/webcreator/icons/BlockIcons';

describe('WebCreator — BlockIcons', () => {
  describe('MODERN_ICONS registry', () => {
    it('debe contener todas las categorías de iconos esperadas', () => {
      const expectedIcons = [
        'hero', 'features', 'testimonials', 'cta', 'pricing', 'faq',
        'stats', 'footer', 'contact', 'services', 'booking', 'leads',
        'team', 'blog', 'catalog', 'divider', 'check', 'arrow', 'star',
      ];
      for (const name of expectedIcons) {
        expect(MODERN_ICONS[name]).toBeDefined();
      }
    });

    it('cada icono debe tener path, viewBox y strokeWidth', () => {
      for (const [name, icon] of Object.entries(MODERN_ICONS)) {
        expect(icon.path, `${name}: path`).toBeTruthy();
        expect(icon.viewBox, `${name}: viewBox`).toBeTruthy();
        expect(icon.strokeWidth, `${name}: strokeWidth`).toBeTruthy();
      }
    });

    it('los viewBox deben ser strings con formato válido', () => {
      const viewBoxRegex = /^\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/;
      for (const [name, icon] of Object.entries(MODERN_ICONS)) {
        expect(icon.viewBox).toMatch(viewBoxRegex);
      }
    });
  });

  describe('getIconSvg', () => {
    it('debe devolver un string SVG', () => {
      const svg = getIconSvg('hero');
      expect(typeof svg).toBe('string');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('debe usar el tamaño especificado', () => {
      const svg16 = getIconSvg('hero', 16);
      expect(svg16).toContain('width="16"');
      expect(svg16).toContain('height="16"');

      const svg48 = getIconSvg('hero', 48);
      expect(svg48).toContain('width="48"');
      expect(svg48).toContain('height="48"');
    });

    it('debe usar tamaño 24 por defecto', () => {
      const svg = getIconSvg('hero');
      expect(svg).toContain('width="24"');
      expect(svg).toContain('height="24"');
    });

    it('debe incluir el viewBox del icono', () => {
      const svg = getIconSvg('pricing');
      const icon = MODERN_ICONS['pricing'];
      expect(svg).toContain(`viewBox="${icon.viewBox}"`);
    });

    it('debe incluir el contenido del path del icono', () => {
      const svg = getIconSvg('check');
      expect(svg).toContain('M20 6L9 17l-5-5');
    });

    it('debe hacer fallback al icono hero para nombres inexistentes', () => {
      const svg = getIconSvg('icono_que_no_existe');
      const heroSvg = getIconSvg('hero', 24);
      // El fallback debe ser idéntico al icono hero
      expect(svg).toBe(heroSvg);
    });

    it('debe usar stroke-width del icono', () => {
      const svg = getIconSvg('check');
      // check tiene strokeWidth "3"
      expect(svg).toContain('stroke-width="3"');
    });

    it('debe usar el stroke-width definido en el icono', () => {
      const svg = getIconSvg('divider');
      // divider tiene strokeWidth "0.5" definido explícitamente
      expect(svg).toContain('stroke-width="0.5"');
    });

    it('todos los iconos deben generar SVG válido', () => {
      for (const name of Object.keys(MODERN_ICONS)) {
        const svg = getIconSvg(name);
        expect(svg, `Icono ${name}`).toContain('<svg');
        expect(svg, `Icono ${name}`).toContain('</svg>');
        expect(svg, `Icono ${name}`).toContain('stroke="currentColor"');
      }
    });
  });
});
