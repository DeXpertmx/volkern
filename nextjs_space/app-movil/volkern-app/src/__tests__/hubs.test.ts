import { hubsService } from '../services/hubs';

describe('hubsService.getCategories', () => {
  it('returns all categories with required fields', () => {
    const categories = hubsService.getCategories();
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat.id).toBeDefined();
      expect(cat.name).toBeDefined();
      expect(cat.icon).toBeDefined();
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(cat.moduleCount).toBeGreaterThan(0);
    }
  });

  it('has expected categories', () => {
    const cats = hubsService.getCategories();
    const names = cats.map(c => c.name);
    expect(names).toContain('Ventas');
    expect(names).toContain('Finanzas');
    expect(names).toContain('Perfil');
  });
});

describe('hubsService.getModules', () => {
  it('returns all modules with required fields', () => {
    const modules = hubsService.getModules();
    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) {
      expect(mod.id).toBeDefined();
      expect(mod.name).toBeDefined();
      expect(mod.hubHref).toMatch(/^\//);
      expect(mod.categoryId).toBeDefined();
      expect(mod.categoryName).toBeDefined();
    }
  });

  it('VENTAS category has 13 modules', () => {
    const modules = hubsService.getModulesByCategory('ventas');
    expect(modules.length).toBe(13);
  });

  it('CONFIGURACION has 13 modules', () => {
    const modules = hubsService.getModulesByCategory('configuracion');
    expect(modules.length).toBe(13);
  });
});

describe('hubsService.getModulesByCategory', () => {
  it('returns filtered modules for a category', () => {
    const modules = hubsService.getModulesByCategory('marketing');
    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) {
      expect(mod.categoryId).toBe('marketing');
    }
  });

  it('returns empty array for non-existent category', () => {
    const result = hubsService.getModulesByCategory('nonexistent');
    expect(result).toEqual([]);
  });
});

describe('hubsService.getCategory', () => {
  it('returns category by id', () => {
    const cat = hubsService.getCategory('ventas');
    expect(cat).toBeDefined();
    expect(cat!.name).toBe('Ventas');
  });

  it('returns undefined for non-existent id', () => {
    const cat = hubsService.getCategory('nonexistent');
    expect(cat).toBeUndefined();
  });
});

describe('hubsService.getModule', () => {
  it('returns module by id', () => {
    const mod = hubsService.getModule('hub-analytics');
    expect(mod).toBeDefined();
    expect(mod!.name).toBe('Analytics');
    expect(mod!.categoryId).toBe('ventas');
  });

  it('returns undefined for non-existent id', () => {
    const mod = hubsService.getModule('nonexistent');
    expect(mod).toBeUndefined();
  });
});

describe('hubsService.searchModules', () => {
  it('finds by name', () => {
    const result = hubsService.searchModules('Analytics');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].id).toBe('hub-analytics');
  });

  it('finds by category name', () => {
    const result = hubsService.searchModules('Producción');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('finds by description', () => {
    const result = hubsService.searchModules('embudo');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toContain('Pipeline');
  });

  it('is case insensitive', () => {
    const upper = hubsService.searchModules('TAREAS');
    const lower = hubsService.searchModules('tareas');
    expect(upper).toEqual(lower);
  });

  it('returns empty array when no match', () => {
    const result = hubsService.searchModules('xyznonexistent123');
    expect(result).toEqual([]);
  });
});

describe('hubsService getters', () => {
  it('returns totalModules count', () => {
    const count = hubsService.totalModules;
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(hubsService.getModules().length);
  });

  it('returns totalCategories count', () => {
    const count = hubsService.totalCategories;
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(hubsService.getCategories().length);
  });
});
