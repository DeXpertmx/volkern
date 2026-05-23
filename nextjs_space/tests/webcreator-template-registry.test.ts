import { describe, it, expect } from 'vitest';
import {
  getAllTemplates,
  getTemplateById,
  getTemplatesByCategory,
  getDefaultTemplate,
  getTemplateData,
} from '@/components/webcreator/templates/metadata/template-registry';
describe('WebCreator — Template Registry', () => {
  describe('getAllTemplates', () => {
    it('debe devolver un array de plantillas', () => {
      const all = getAllTemplates();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });

    it('todas las plantillas deben tener id, name, category y data', () => {
      for (const t of getAllTemplates()) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(t.data).toBeDefined();
      }
    });

    it('debe incluir plantillas de múltiples categorías', () => {
      const categories = new Set(getAllTemplates().map(t => t.category));
      expect(categories.size).toBeGreaterThan(1);
    });
  });

  describe('getTemplateById', () => {
    it('debe encontrar una plantilla por ID', () => {
      const all = getAllTemplates();
      if (all.length > 0) {
        const firstId = all[0].id;
        const found = getTemplateById(firstId);
        expect(found).toBeDefined();
        expect(found!.id).toBe(firstId);
      }
    });

    it('debe devolver undefined para ID inexistente', () => {
      expect(getTemplateById('template-que-no-existe-99999')).toBeUndefined();
    });

    it('debe devolver undefined para ID vacío', () => {
      expect(getTemplateById('')).toBeUndefined();
    });
  });

  describe('getTemplatesByCategory', () => {
    it('debe filtrar por categoría válida', () => {
      const all = getAllTemplates();
      const cats = [...new Set(all.map(t => t.category))];
      if (cats.length > 0) {
        const result = getTemplatesByCategory(cats[0]);
        for (const t of result) {
          expect(t.category).toBe(cats[0]);
        }
      }
    });

    it('debe devolver array vacío para categoría inexistente', () => {
      expect(getTemplatesByCategory('categoria-fantasma')).toEqual([]);
    });
  });

  describe('getDefaultTemplate', () => {
    it('debe devolver una plantilla (nunca null/undefined)', () => {
      const def = getDefaultTemplate();
      expect(def).toBeDefined();
      expect(def.id).toBeTruthy();
      expect(def.name).toBeTruthy();
    });

    it('debe devolver la plantilla marcada como isDefault o el blankTemplate', () => {
      const def = getDefaultTemplate();
      const all = getAllTemplates();
      const markedDefault = all.find(t => t.isDefault);

      if (markedDefault) {
        expect(def.id).toBe(markedDefault.id);
      } else {
        // Fallback al blank template
        expect(def.category).toBe('blank');
      }
    });
  });

  describe('getTemplateData', () => {
    it('debe devolver null para ID inexistente', () => {
      expect(getTemplateData('no-existe')).toBeNull();
    });

    it('debe devolver datos para una plantilla existente', () => {
      const all = getAllTemplates();
      if (all.length > 0) {
        const data = getTemplateData(all[0].id);
        expect(data).not.toBeNull();
        expect(typeof data).toBe('object');
      }
    });

    it('los datos devueltos deben tener las claves esperadas', () => {
      const all = getAllTemplates();
      if (all.length > 0) {
        const data = getTemplateData(all[0].id);
        if (data) {
          expect(data).toHaveProperty('html');
          expect(data).toHaveProperty('css');
          expect(data).toHaveProperty('assets');
          expect(data).toHaveProperty('projectData');
          expect(data).toHaveProperty('loadProjectData');
        }
      }
    });
  });
});
