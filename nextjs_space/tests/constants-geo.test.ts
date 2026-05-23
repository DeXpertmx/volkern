import { describe, it, expect } from 'vitest';
import { PAISES, TIMEZONES } from '@/lib/constants/geo';

describe('PAISES', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(PAISES)).toBe(true);
  });

  it('debe contener al menos 190 países', () => {
    expect(PAISES.length).toBeGreaterThanOrEqual(190);
  });

  it('cada país debe tener value y label de tipo string', () => {
    for (const pais of PAISES) {
      expect(typeof pais.value).toBe('string');
      expect(typeof pais.label).toBe('string');
      expect(pais.value.length).toBe(2); // ISO 3166-1 alpha-2
    }
  });

  it('los values deben ser únicos', () => {
    const values = PAISES.map(p => p.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('los labels deben ser únicos', () => {
    const labels = PAISES.map(p => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('debe incluir España (ES)', () => {
    const esp = PAISES.find(p => p.value === 'ES');
    expect(esp).toBeDefined();
    expect(esp!.label).toBe('España');
  });

  it('debe incluir México (MX)', () => {
    const mx = PAISES.find(p => p.value === 'MX');
    expect(mx).toBeDefined();
    expect(mx!.label).toBe('México');
  });

  it('debe incluir Estados Unidos (US)', () => {
    const us = PAISES.find(p => p.value === 'US');
    expect(us).toBeDefined();
    expect(us!.label).toBe('Estados Unidos');
  });

  it('debe incluir países de la UE', () => {
    const euCodes = ['ES', 'DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'PL', 'SE', 'DK', 'FI', 'GR', 'CZ', 'RO', 'HU', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU'];
    for (const code of euCodes) {
      expect(PAISES.find(p => p.value === code)).toBeDefined();
    }
  });

  it('debe estar mayormente ordenado (los primeros y últimos países son correctos)', () => {
    expect(PAISES[0].label).toBe('Afganistán');
    expect(PAISES[PAISES.length - 1].label).toBe('Zimbabue');
  });

  it('todos los values deben ser códigos ISO 3166-1 alpha-2 válidos', () => {
    for (const pais of PAISES) {
      expect(pais.value).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe('TIMEZONES', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(TIMEZONES)).toBe(true);
  });

  it('debe contener múltiples zonas horarias', () => {
    expect(TIMEZONES.length).toBeGreaterThan(50);
  });

  it('cada timezone debe tener value y label de tipo string', () => {
    for (const tz of TIMEZONES) {
      expect(typeof tz.value).toBe('string');
      expect(typeof tz.label).toBe('string');
    }
  });

  it('los values deben ser únicos', () => {
    const values = TIMEZONES.map(t => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('debe incluir Europe/Brussels (que cubre Madrid)', () => {
    const brussels = TIMEZONES.find(t => t.value === 'Europe/Brussels');
    expect(brussels).toBeDefined();
    expect(brussels!.label).toContain('Madrid');
  });

  it('debe incluir America/New_York', () => {
    const ny = TIMEZONES.find(t => t.value === 'America/New_York');
    expect(ny).toBeDefined();
    expect(ny!.label).toContain('Eastern');
  });

  it('debe incluir America/Mexico_City (Cancun)', () => {
    const mx = TIMEZONES.find(t => t.value === 'America/Cancun');
    expect(mx).toBeDefined();
    expect(mx!.label).toContain('Mexico City');
  });

  it('los labels deben contener el offset GMT', () => {
    for (const tz of TIMEZONES) {
      expect(tz.label).toMatch(/\(GMT[+-]\d{2}:\d{2}\)/);
    }
  });

  it('debe cubrir offsets desde GMT-11 hasta GMT+13', () => {
    const offsets = TIMEZONES.map(t => {
      const match = t.label.match(/\(GMT([+-]\d{2}):\d{2}\)/);
      return match ? parseInt(match[1]) : null;
    }).filter(Boolean) as number[];
    
    expect(Math.min(...offsets)).toBeLessThanOrEqual(-11);
    expect(Math.max(...offsets)).toBeGreaterThanOrEqual(12);
  });

  it('los values deben tener formato de identificador IANA (Area/Location)', () => {
    for (const tz of TIMEZONES) {
      expect(tz.value).toMatch(/^(Etc\/)?[A-Z][a-zA-Z]+\/[A-Za-z_+\-0-9]+/);
    }
  });
});
