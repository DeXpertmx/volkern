import { describe, it, expect } from 'vitest';
import { HUBS } from '@/lib/navigation-config';

// ==================== HUBS ====================
describe('HUBS', () => {
  it('debe tener al menos 17 hubs definidos', () => {
    expect(HUBS.length).toBeGreaterThanOrEqual(17);
  });

  it('todos los hubs deben tener id, name, icon, href, description y items', () => {
    for (const hub of HUBS) {
      expect(hub.id).toBeTruthy();
      expect(typeof hub.id).toBe('string');
      expect(hub.name).toBeTruthy();
      expect(hub.icon).toBeDefined();
      expect(hub.href).toBeTruthy();
      expect(hub.href.startsWith('/')).toBe(true);
      expect(hub.description).toBeTruthy();
      expect(Array.isArray(hub.items)).toBe(true);
      expect(hub.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('todos los hubs deben tener IDs únicos', () => {
    const ids = HUBS.map(h => h.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('todos los items deben tener name, href, icon, description', () => {
    for (const hub of HUBS) {
      for (const item of hub.items) {
        expect(item.name).toBeTruthy();
        expect(item.href).toBeTruthy();
        expect(item.href.startsWith('/')).toBe(true);
        expect(item.icon).toBeDefined();
        expect(item.description).toBeTruthy();
      }
    }
  });

  it('todos los items de un hub deben tener names únicos', () => {
    for (const hub of HUBS) {
      const names = hub.items.map(i => i.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    }
  });

  it('todos los hubs deben tener basePaths o items', () => {
    for (const hub of HUBS) {
      expect(hub.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('hubs con requiredAccountType deben ser AGENCY, BUSINESS o SUPERADMIN', () => {
    const validTypes = ['AGENCY', 'BUSINESS', 'SUPERADMIN'];
    for (const hub of HUBS) {
      if (hub.requiredAccountType) {
        expect(validTypes).toContain(hub.requiredAccountType);
      }
    }
  });

  it('hubs con requiredModule deben tenerlo en string', () => {
    for (const hub of HUBS) {
      if (hub.requiredModule) {
        expect(typeof hub.requiredModule).toBe('string');
        expect(hub.requiredModule.length).toBeGreaterThan(0);
      }
    }
  });

  it('items con planModule deben tener valor truthy', () => {
    for (const hub of HUBS) {
      for (const item of hub.items) {
        if (item.planModule) {
          expect(typeof item.planModule).toBe('string');
          expect(item.planModule.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('items con requiredRegion deben ser MX, ES, CO o US', () => {
    const validRegions = ['MX', 'ES', 'CO', 'US'];
    for (const hub of HUBS) {
      for (const item of hub.items) {
        if (item.requiredRegion) {
          expect(validRegions).toContain(item.requiredRegion);
        }
      }
    }
  });

  it('el hub agencia debe tener 4 items', () => {
    const hub = HUBS.find(h => h.id === 'agencia');
    expect(hub?.items).toHaveLength(4);
  });

  it('el hub ventas debe tener al menos 12 items', () => {
    const hub = HUBS.find(h => h.id === 'ventas');
    expect(hub?.items.length).toBeGreaterThanOrEqual(12);
  });

  it('el hub configuracion debe tener al menos 10 items', () => {
    const hub = HUBS.find(h => h.id === 'configuracion');
    expect(hub?.items.length).toBeGreaterThanOrEqual(10);
  });

  it('el hub perfil debe tener al menos 6 items', () => {
    const hub = HUBS.find(h => h.id === 'perfil');
    expect(hub?.items.length).toBeGreaterThanOrEqual(6);
  });

  it('el hub finanzas debe tener al menos 8 items', () => {
    const hub = HUBS.find(h => h.id === 'finanzas');
    expect(hub?.items.length).toBeGreaterThanOrEqual(8);
  });
});
