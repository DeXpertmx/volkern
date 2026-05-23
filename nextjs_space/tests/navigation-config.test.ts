import { describe, it, expect } from 'vitest';
import { HUBS, type HubConfig, type NavigationItem } from '@/lib/navigation-config';

// ─── Helpers ──────────────────────────────────────────────────────────────

function validateHubConfig(hub: HubConfig) {
  expect(hub).toHaveProperty('id');
  expect(typeof hub.id).toBe('string');
  expect(hub).toHaveProperty('name');
  expect(typeof hub.name).toBe('string');
  expect(hub).toHaveProperty('icon');
  expect(hub).toHaveProperty('href');
  expect(typeof hub.href).toBe('string');
  expect(hub).toHaveProperty('items');
  expect(Array.isArray(hub.items)).toBe(true);
  expect(hub).toHaveProperty('description');
  expect(typeof hub.description).toBe('string');
}

function validateNavigationItem(item: NavigationItem) {
  expect(item).toHaveProperty('name');
  expect(typeof item.name).toBe('string');
  expect(item).toHaveProperty('href');
  expect(typeof item.href).toBe('string');
  expect(item).toHaveProperty('icon');
  expect(item).toHaveProperty('description');
  expect(typeof item.description).toBe('string');
}

// ─── HUBS Structure ───────────────────────────────────────────────────────

describe('HUBS', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(HUBS)).toBe(true);
  });

  it('debe tener al menos 15 hubs', () => {
    expect(HUBS.length).toBeGreaterThanOrEqual(15);
  });

  it('todos los hubs deben cumplir el schema HubConfig', () => {
    HUBS.forEach(hub => validateHubConfig(hub));
  });

  it('todos los items de cada hub deben cumplir el schema NavigationItem', () => {
    HUBS.forEach(hub => {
      hub.items.forEach(item => validateNavigationItem(item));
    });
  });

  it('IDs de hubs únicos', () => {
    const ids = HUBS.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nombres de hubs únicos', () => {
    const names = HUBS.map(h => h.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('todos los hrefs empiezan con /dashboard/', () => {
    HUBS.forEach(hub => {
      expect(hub.href).toMatch(/^\/dashboard\//);
    });
  });

  it('todos los items tienen hrefs que empiezan con /dashboard/', () => {
    HUBS.forEach(hub => {
      hub.items.forEach(item => {
        expect(item.href).toMatch(/^\/dashboard\//);
      });
    });
  });

  it('cada hub debe tener al menos 1 item', () => {
    HUBS.forEach(hub => {
      expect(hub.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('items dentro de cada hub deben tener nombres únicos', () => {
    HUBS.forEach(hub => {
      const itemNames = hub.items.map(i => i.name);
      expect(new Set(itemNames).size).toBe(itemNames.length);
    });
  });

  // ── Hubs específicos ──

  it('debe incluir el hub de Ventas', () => {
    const hub = HUBS.find(h => h.id === 'ventas')!;
    expect(hub.name).toBe('Ventas');
    expect(hub.items.length).toBeGreaterThanOrEqual(10);
  });

  it('debe incluir el hub de Comunicaciones', () => {
    const hub = HUBS.find(h => h.id === 'comunicaciones')!;
    expect(hub.name).toBe('Comunicaciones');
    expect(hub.items.some(i => i.name === 'Volkern Connect')).toBe(true);
    expect(hub.items.some(i => i.name === 'Chatbot')).toBe(true);
  });

  it('debe incluir el hub de Marketing', () => {
    const hub = HUBS.find(h => h.id === 'marketing')!;
    expect(hub.items.some(i => i.name === 'Campañas')).toBe(true);
    expect(hub.items.some(i => i.name === 'Constructor Web')).toBe(true);
  });

  it('debe incluir el hub de Academia', () => {
    const hub = HUBS.find(h => h.id === 'academia')!;
    expect(hub.items.some(i => i.name === 'Cursos')).toBe(true);
    expect(hub.items.some(i => i.name === 'Estudiantes')).toBe(true);
  });

  it('debe incluir el hub de Finanzas', () => {
    const hub = HUBS.find(h => h.id === 'finanzas')!;
    expect(hub.requiredAccountType).toBe('BUSINESS');
    expect(hub.items.some(i => i.name === 'Hub Contable')).toBe(true);
  });

  it('debe incluir el hub de Producción', () => {
    const hub = HUBS.find(h => h.id === 'produccion')!;
    expect(hub.requiredAccountType).toBe('BUSINESS');
    expect(hub.requiredModule).toBe('produccion');
  });

  it('debe incluir el hub de Configuración', () => {
    const hub = HUBS.find(h => h.id === 'configuracion')!;
    expect(hub.items.length).toBeGreaterThanOrEqual(10);
    expect(hub.items.some(i => i.name === 'Integraciones')).toBe(true);
  });

  it('debe incluir el hub de Agencia con requiredAccountType AGENCY', () => {
    const hub = HUBS.find(h => h.id === 'agencia')!;
    expect(hub.requiredAccountType).toBe('AGENCY');
  });

  it('debe incluir el hub de Perfil', () => {
    const hub = HUBS.find(h => h.id === 'perfil')!;
    expect(hub.items.some(i => i.name === 'Mi Perfil')).toBe(true);
    expect(hub.items.some(i => i.name === 'Seguridad')).toBe(true);
  });

  // ── requiredAccountType ──

  it('hubs sin requiredAccountType deben ser accesibles por todos', () => {
    const openHubs = HUBS.filter(h => !h.requiredAccountType);
    expect(openHubs.length).toBeGreaterThanOrEqual(5);
  });

  it('hubs con requiredAccountType BUSINESS deben tener requiredModule', () => {
    const businessHubs = HUBS.filter(h => h.requiredAccountType === 'BUSINESS');
    businessHubs.forEach(hub => {
      expect(hub.requiredModule).toBeDefined();
      expect(typeof hub.requiredModule).toBe('string');
    });
  });

  // ── Regiones ──

  it('items con requiredRegion MX deben incluir \"MX\" en el nombre', () => {
    HUBS.forEach(hub => {
      hub.items.forEach(item => {
        if (item.requiredRegion === 'MX') {
          expect(item.name).toMatch(/MX/);
        }
      });
    });
  });

  it('items con requiredRegion ES deben ser relativos a facturación/impuestos españoles', () => {
    const esItems = HUBS.flatMap(h => h.items).filter(i => i.requiredRegion === 'ES');
    const esNames = esItems.map(i => i.name);
    expect(esNames.some(n => n.includes('Facturación') || n.includes('Impuestos') || n.includes('IVA'))).toBe(true);
  });

  // ── basePaths ──

  it('hubs con basePaths deben tener arrays no vacíos', () => {
    HUBS.forEach(hub => {
      if (hub.basePaths) {
        expect(hub.basePaths.length).toBeGreaterThan(0);
        hub.basePaths.forEach(bp => expect(bp).toMatch(/^\/dashboard\//));
      }
    });
  });
});
