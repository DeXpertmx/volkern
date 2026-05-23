import { describe, it, expect, beforeEach } from 'vitest';
import {
  styleCustomizationService,
  STYLE_CATEGORIES,
  DEFAULT_STYLE_PRESETS,
  type StylePreset,
  type CustomStyle,
} from '@/components/webcreator/styles/styleCustomizationService';

describe('WebCreator — StyleCustomizationService', () => {
  // El servicio es singleton; limpiamos customStyles entre tests
  beforeEach(() => {
    // Accedemos a customStyles privado para limpiar
    const customStyles = (styleCustomizationService as any).customStyles as CustomStyle[];
    customStyles.length = 0;
    // Restauramos los presets originales
    (styleCustomizationService as any).stylePresets = [...DEFAULT_STYLE_PRESETS];
  });

  describe('getAllStylePresets', () => {
    it('debe devolver al menos los presets predeterminados', () => {
      const all = styleCustomizationService.getAllStylePresets();
      expect(all.length).toBeGreaterThanOrEqual(DEFAULT_STYLE_PRESETS.length);
    });

    it('los presets deben tener id, name, category y styles', () => {
      for (const p of styleCustomizationService.getAllStylePresets()) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.category).toBeTruthy();
        expect(typeof p.styles).toBe('object');
      }
    });
  });

  describe('getStylePresetsByCategory', () => {
    it('debe filtrar por categoría correctamente', () => {
      const typography = styleCustomizationService.getStylePresetsByCategory('typography');
      expect(typography.length).toBeGreaterThanOrEqual(1);
      for (const p of typography) {
        expect(p.category).toBe('typography');
      }
    });

    it('debe devolver array vacío para categoría inexistente', () => {
      expect(styleCustomizationService.getStylePresetsByCategory('no-existe')).toEqual([]);
    });
  });

  describe('getStylePresetById', () => {
    it('debe encontrar un preset existente', () => {
      const p = styleCustomizationService.getStylePresetById('modern-typography');
      expect(p).toBeDefined();
      expect(p!.name).toBe('Tipografía Moderna');
    });

    it('debe devolver undefined para ID inexistente', () => {
      expect(styleCustomizationService.getStylePresetById('no-existe')).toBeUndefined();
    });
  });

  describe('createStylePreset', () => {
    it('debe crear un nuevo preset con ID autogenerado', () => {
      const preset = styleCustomizationService.createStylePreset({
        name: 'Test Preset',
        description: 'A test',
        category: 'typography',
        styles: { 'font-size': '16px' },
      });

      expect(preset.id).toMatch(/^preset-/);
      expect(preset.name).toBe('Test Preset');
      expect(preset.category).toBe('typography');
      expect(preset.styles).toEqual({ 'font-size': '16px' });
    });

    it('debe agregar el preset a la lista', () => {
      const before = styleCustomizationService.getAllStylePresets().length;
      styleCustomizationService.createStylePreset({
        name: 'Another',
        description: '',
        category: 'colors',
        styles: {},
      });
      expect(styleCustomizationService.getAllStylePresets().length).toBe(before + 1);
    });
  });

  describe('getAllCustomStyles / createCustomStyle', () => {
    it('debe empezar vacío', () => {
      expect(styleCustomizationService.getAllCustomStyles()).toEqual([]);
    });

    it('debe crear un custom style con ID autogenerado y fecha', () => {
      const cs = styleCustomizationService.createCustomStyle('My Style', '.my-class', {
        color: 'red',
        'font-size': '14px',
      });

      expect(cs.id).toMatch(/^custom-/);
      expect(cs.name).toBe('My Style');
      expect(cs.selector).toBe('.my-class');
      expect(cs.properties).toEqual({ color: 'red', 'font-size': '14px' });
      expect(cs.createdAt).toBeInstanceOf(Date);
    });

    it('debe acumular estilos personalizados', () => {
      styleCustomizationService.createCustomStyle('A', '.a', {});
      styleCustomizationService.createCustomStyle('B', '.b', {});
      expect(styleCustomizationService.getAllCustomStyles()).toHaveLength(2);
    });
  });

  describe('STYLE_CATEGORIES', () => {
    it('debe contener las 5 categorías esperadas', () => {
      expect(STYLE_CATEGORIES).toHaveLength(5);
      const ids = STYLE_CATEGORIES.map(c => c.id);
      expect(ids).toEqual(['typography', 'colors', 'spacing', 'effects', 'layout']);
    });

    it('cada categoría debe tener id, name e icon', () => {
      for (const cat of STYLE_CATEGORIES) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
      }
    });
  });
});
