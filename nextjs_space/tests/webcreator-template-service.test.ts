import { describe, it, expect, beforeEach } from 'vitest';
import { templateService, TEMPLATE_CATEGORIES, DEFAULT_TEMPLATES } from '@/components/webcreator/templates/templateService';

// templateService es un singleton — cada test puede ver los efectos de tests anteriores.
// Para aislar, restauramos los defaults en cada beforeEach.

describe('WebCreator — TemplateService', () => {
  beforeEach(() => {
    // Restaurar DEFAULT_TEMPLATES a su estado original para evitar fuga de estado
    (templateService as any).templates = DEFAULT_TEMPLATES.map(t => ({ ...t }));
  });

  describe('getAllTemplates', () => {
    it('debe devolver al menos las plantillas predeterminadas', () => {
      const all = templateService.getAllTemplates();
      expect(all.length).toBeGreaterThanOrEqual(DEFAULT_TEMPLATES.length);
      for (const dt of DEFAULT_TEMPLATES) {
        expect(all.find(t => t.id === dt.id)).toBeDefined();
      }
    });
  });

  describe('getTemplatesByCategory', () => {
    it('debe filtrar por categoría correctamente', () => {
      const landing = templateService.getTemplatesByCategory('landing');
      expect(landing.length).toBeGreaterThanOrEqual(1);
      for (const t of landing) {
        expect(t.category).toBe('landing');
      }
    });

    it('debe devolver array vacío para categoría inexistente', () => {
      expect(templateService.getTemplatesByCategory('no-existe')).toEqual([]);
    });
  });

  describe('getTemplateById', () => {
    it('debe encontrar una plantilla existente', () => {
      const t = templateService.getTemplateById('landing-basic');
      expect(t).toBeDefined();
      expect(t!.name).toBe('Landing Básica');
    });

    it('debe devolver undefined para ID inexistente', () => {
      expect(templateService.getTemplateById('no-existe')).toBeUndefined();
    });
  });

  describe('saveTemplate', () => {
    it('debe guardar una nueva plantilla y asignar createdAt/updatedAt', () => {
      const saved = templateService.saveTemplate({
        id: 'test-new',
        name: 'Test Template',
        description: 'Desc',
        category: 'landing',
        thumbnail: '/thumb.png',
        data: { blocks: [] },
      });

      expect(saved.id).toBe('test-new');
      expect(saved.name).toBe('Test Template');
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });

    it('debe incrementar el total de plantillas', () => {
      const before = templateService.getAllTemplates().length;
      templateService.saveTemplate({
        id: 'test-count',
        name: 'Count Test',
        description: '',
        category: 'blog',
        thumbnail: '',
        data: {},
      });
      expect(templateService.getAllTemplates().length).toBe(before + 1);
    });
  });

  describe('updateTemplate', () => {
    it('debe actualizar campos de una plantilla existente', () => {
      const updated = templateService.updateTemplate('landing-basic', {
        name: 'Landing Renombrada',
        description: 'Nueva desc',
      });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Landing Renombrada');
      expect(updated!.description).toBe('Nueva desc');
      // category no debería cambiar
      expect(updated!.category).toBe('landing');
    });

    it('debe actualizar updatedAt', () => {
      const before = templateService.getTemplateById('landing-basic')!.updatedAt.getTime();
      // Pequeña pausa para garantizar diferencia de timestamp
      const updated = templateService.updateTemplate('landing-basic', { name: 'X' });
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('debe devolver undefined para ID inexistente', () => {
      expect(templateService.updateTemplate('no-existe', { name: 'X' })).toBeUndefined();
    });
  });

  describe('deleteTemplate', () => {
    it('debe eliminar una plantilla y devolver true', () => {
      templateService.saveTemplate({
        id: 'to-delete',
        name: 'Delete me',
        description: '',
        category: 'blog',
        thumbnail: '',
        data: {},
      });
      expect(templateService.deleteTemplate('to-delete')).toBe(true);
      expect(templateService.getTemplateById('to-delete')).toBeUndefined();
    });

    it('debe devolver false si la plantilla no existe', () => {
      expect(templateService.deleteTemplate('no-existe')).toBe(false);
    });
  });

  describe('TEMPLATE_CATEGORIES', () => {
    it('debe contener las 6 categorías esperadas', () => {
      expect(TEMPLATE_CATEGORIES).toHaveLength(6);
      const ids = TEMPLATE_CATEGORIES.map(c => c.id);
      expect(ids).toContain('business');
      expect(ids).toContain('portfolio');
      expect(ids).toContain('ecommerce');
      expect(ids).toContain('blog');
      expect(ids).toContain('landing');
      expect(ids).toContain('agency');
    });

    it('cada categoría debe tener id, name e icon', () => {
      for (const cat of TEMPLATE_CATEGORIES) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
      }
    });
  });
});
