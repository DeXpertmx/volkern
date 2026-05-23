import { describe, it, expect } from 'vitest';
import { TEMPLATE_CATEGORIES, type Template } from '@/components/webcreator/templates/types';
import { landingTemplates } from '@/components/webcreator/templates/data/landing';
import { tiendaTemplates } from '@/components/webcreator/templates/data/tienda';
import { portfolioTemplates } from '@/components/webcreator/templates/data/portfolio';
import { documentTemplates } from '@/components/webcreator/templates/data/documents';
import { emailTemplates } from '@/components/webcreator/templates/data/emails';
import { blankTemplate } from '@/components/webcreator/templates/data/blank';
import { underscoreBlankTemplate } from '@/components/webcreator/templates/data/_blank';

const VALID_CATEGORIES = TEMPLATE_CATEGORIES.map(c => c.id);

/** Extrae todos los templates de un array + los standalone, mapeando a {template, collectionName} */
function collectAllTemplates(): Array<{ template: Template; collection: string }> {
  const result: Array<{ template: Template; collection: string }> = [];

  for (const t of landingTemplates) result.push({ template: t, collection: 'landing' });
  for (const t of tiendaTemplates) result.push({ template: t, collection: 'tienda' });
  for (const t of portfolioTemplates) result.push({ template: t, collection: 'portfolio' });
  for (const t of documentTemplates) result.push({ template: t, collection: 'documents' });
  for (const t of emailTemplates) result.push({ template: t, collection: 'emails' });
  result.push({ template: blankTemplate, collection: 'blank' });
  result.push({ template: underscoreBlankTemplate, collection: '_blank' });

  return result;
}

describe('WebCreator — Template Data Integrity', () => {
  describe('TEMPLATE_CATEGORIES', () => {
    it('debe tener las 8 categorías esperadas', () => {
      const expectedIds = ['landing', 'portfolio', 'blog', 'ecommerce', 'business', 'email', 'document', 'blank'];
      const actualIds = TEMPLATE_CATEGORIES.map(c => c.id);
      expect(actualIds.sort()).toEqual(expectedIds.sort());
    });

    it('cada categoría debe tener id, name e icon', () => {
      for (const cat of TEMPLATE_CATEGORIES) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
      }
    });

    it('los IDs de categoría deben ser únicos', () => {
      const ids = TEMPLATE_CATEGORIES.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Colecciones de templates', () => {
    it('landingTemplates debe ser un array no vacío', () => {
      expect(Array.isArray(landingTemplates)).toBe(true);
      expect(landingTemplates.length).toBeGreaterThan(0);
    });

    it('tiendaTemplates debe ser un array no vacío', () => {
      expect(Array.isArray(tiendaTemplates)).toBe(true);
      expect(tiendaTemplates.length).toBeGreaterThan(0);
    });

    it('portfolioTemplates debe ser un array no vacío', () => {
      expect(Array.isArray(portfolioTemplates)).toBe(true);
      expect(portfolioTemplates.length).toBeGreaterThan(0);
    });

    it('documentTemplates debe ser un array no vacío', () => {
      expect(Array.isArray(documentTemplates)).toBe(true);
      expect(documentTemplates.length).toBeGreaterThan(0);
    });

    it('emailTemplates debe ser un array no vacío', () => {
      expect(Array.isArray(emailTemplates)).toBe(true);
      expect(emailTemplates.length).toBeGreaterThan(0);
    });

    it('blankTemplate debe ser un objeto con id "blank"', () => {
      expect(blankTemplate.id).toBe('blank');
    });

    it('underscoreBlankTemplate debe ser un objeto con id "_blank"', () => {
      expect(underscoreBlankTemplate.id).toBe('_blank');
    });
  });

  describe('Campos obligatorios en todos los templates', () => {
    const all = collectAllTemplates();

    it('todos los templates deben tener id (string no vacío)', () => {
      for (const { template: t, collection } of all) {
        expect(t.id, `${collection}: id`).toBeTruthy();
        expect(typeof t.id, `${collection}: id type`).toBe('string');
        expect(t.id.length, `${collection}: id length`).toBeGreaterThan(0);
      }
    });

    it('todos los templates deben tener name (string no vacío)', () => {
      for (const { template: t, collection } of all) {
        expect(t.name, `${collection}: name`).toBeTruthy();
        expect(typeof t.name, `${collection}: name type`).toBe('string');
        expect(t.name.length, `${collection}: name length`).toBeGreaterThan(0);
      }
    });

    it('todos los templates deben tener description (string no vacío)', () => {
      for (const { template: t, collection } of all) {
        expect(t.description, `${collection}: description`).toBeTruthy();
        expect(typeof t.description, `${collection}: description type`).toBe('string');
        expect(t.description.length, `${collection}: description length`).toBeGreaterThan(0);
      }
    });

    it('todos los templates deben tener una categoría válida', () => {
      for (const { template: t, collection } of all) {
        expect(t.category, `${collection}: category`).toBeTruthy();
        expect(VALID_CATEGORIES, `${collection}: ${t.category} debe ser válida`).toContain(t.category);
      }
    });

    it('todos los templates deben tener tags (array no vacío de strings)', () => {
      for (const { template: t, collection } of all) {
        expect(Array.isArray(t.tags), `${collection}: tags`).toBe(true);
        expect(t.tags.length, `${collection}: tags length`).toBeGreaterThan(0);
        for (let i = 0; i < t.tags.length; i++) {
          expect(typeof t.tags[i], `${collection}: tag[${i}]`).toBe('string');
          expect(t.tags[i].length, `${collection}: tag[${i}] length`).toBeGreaterThan(0);
        }
      }
    });

    it('todos los templates deben tener data (objeto no nulo)', () => {
      for (const { template: t, collection } of all) {
        expect(t.data, `${collection}: data`).toBeDefined();
        expect(typeof t.data, `${collection}: data type`).toBe('object');
        expect(t.data, `${collection}: data null`).not.toBeNull();
      }
    });
  });

  describe('Datos (data) de cada template', () => {
    const all = collectAllTemplates();

    it('cada template debe tener al menos una fuente de datos (html, css, projectData o loadProjectData)', () => {
      for (const { template: t, collection } of all) {
        const hasHtml = typeof t.data.html === 'string' && t.data.html.length > 0;
        const hasCss = typeof t.data.css === 'string' && t.data.css.length > 0;
        const hasProjectData = t.data.projectData !== undefined && t.data.projectData !== null;
        const hasLoadProjectData = typeof t.data.loadProjectData === 'function';

        expect(
          hasHtml || hasCss || hasProjectData || hasLoadProjectData,
          `${collection}/${t.id}: debe tener html, css, projectData o loadProjectData`
        ).toBe(true);
      }
    });

    it('los templates con html deben tener html como string no vacío', () => {
      for (const { template: t, collection } of all) {
        if (t.data.html !== undefined) {
          expect(typeof t.data.html, `${collection}/${t.id}: html type`).toBe('string');
          expect(t.data.html.length, `${collection}/${t.id}: html length`).toBeGreaterThan(0);
        }
      }
    });

    it('los loadProjectData deben ser funciones', () => {
      for (const { template: t, collection } of all) {
        if (t.data.loadProjectData !== undefined) {
          expect(typeof t.data.loadProjectData, `${collection}/${t.id}: loadProjectData`).toBe('function');
        }
      }
    });
  });

  describe('IDs únicos entre colecciones', () => {
    it('no debe haber IDs duplicados entre todas las colecciones', () => {
      const all = collectAllTemplates();
      const ids = all.map(({ template: t }) => t.id as string);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Categorías específicas por colección', () => {
    it('landingTemplates deben tener category "landing"', () => {
      for (const t of landingTemplates) {
        expect(t.category).toBe('landing');
      }
    });

    it('tiendaTemplates deben tener category "ecommerce"', () => {
      for (const t of tiendaTemplates) {
        expect(t.category).toBe('ecommerce');
      }
    });

    it('portfolioTemplates deben tener category "portfolio"', () => {
      for (const t of portfolioTemplates) {
        expect(t.category).toBe('portfolio');
      }
    });

    it('documentTemplates deben tener category "document"', () => {
      for (const t of documentTemplates) {
        expect(t.category).toBe('document');
      }
    });

    it('emailTemplates deben tener category "email"', () => {
      for (const t of emailTemplates) {
        expect(t.category).toBe('email');
      }
    });

    it('blankTemplate debe tener category "blank"', () => {
      expect(blankTemplate.category).toBe('blank');
      expect(underscoreBlankTemplate.category).toBe('blank');
    });
  });

  describe('isDefault flag', () => {
    it('debe haber exactamente un template por defecto en emailTemplates', () => {
      const defaults = emailTemplates.filter(t => t.isDefault);
      expect(defaults.length).toBe(1);
      expect(defaults[0].id).toBe('email-modern-newsletter');
    });

    it('debe haber exactamente un template por defecto en documentTemplates', () => {
      const defaults = documentTemplates.filter(t => t.isDefault);
      expect(defaults.length).toBe(1);
      expect(defaults[0].id).toBe('orden-venta-modern');
    });

    it('blankTemplate debe ser isDefault', () => {
      expect(blankTemplate.isDefault).toBe(true);
    });

    it('underscoreBlankTemplate NO debe ser isDefault', () => {
      // Hay al menos 2 plantillas blank, solo una puede ser default
      expect(underscoreBlankTemplate.isDefault).toBe(false);
    });
  });
});
