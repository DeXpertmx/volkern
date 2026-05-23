import { describe, it, expect } from 'vitest';
import { PAISES, TIMEZONES } from '@/lib/constants/geo';

// ─── PAISES ────────────────────────────────────────────────────────────
describe('PAISES', () => {
  it('debe tener más de 150 países', () => {
    expect(PAISES.length).toBeGreaterThan(150);
  });

  it('cada país debe tener value (ISO 3166-1 alpha-2) y label', () => {
    for (const pais of PAISES) {
      expect(pais.value).toBeTruthy();
      expect(pais.value).toHaveLength(2);
      expect(pais.value).toMatch(/^[A-Z]{2}$/);
      expect(pais.label).toBeTruthy();
      expect(typeof pais.label).toBe('string');
    }
  });

  it('no debe haber códigos ISO duplicados', () => {
    const codes = PAISES.map(p => p.value);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('no debe haber labels duplicados', () => {
    const labels = PAISES.map(p => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('debe incluir los países hispanohablantes principales', () => {
    const codes = PAISES.map(p => p.value);
    expect(codes).toContain('ES'); // España
    expect(codes).toContain('MX'); // México
    expect(codes).toContain('AR'); // Argentina
    expect(codes).toContain('CO'); // Colombia
    expect(codes).toContain('CL'); // Chile
    expect(codes).toContain('PE'); // Perú
    expect(codes).toContain('VE'); // Venezuela
    expect(codes).toContain('EC'); // Ecuador
    expect(codes).toContain('UY'); // Uruguay
    expect(codes).toContain('PY'); // Paraguay
    expect(codes).toContain('BO'); // Bolivia
  });

  it('debe incluir los países del G7', () => {
    const codes = PAISES.map(p => p.value);
    expect(codes).toContain('US'); // Estados Unidos
    expect(codes).toContain('CA'); // Canadá
    expect(codes).toContain('GB'); // Reino Unido
    expect(codes).toContain('DE'); // Alemania
    expect(codes).toContain('FR'); // Francia
    expect(codes).toContain('IT'); // Italia
    expect(codes).toContain('JP'); // Japón
  });

  it('los códigos deben ser solo letras mayúsculas', () => {
    for (const pais of PAISES) {
      expect(pais.value).toMatch(/^[A-Z]+$/);
    }
  });

  it('debe incluir países de todos los continentes', () => {
    const codes = PAISES.map(p => p.value);
    // América
    expect(codes).toContain('BR');
    // Europa
    expect(codes).toContain('PT');
    // África
    expect(codes).toContain('ZA');
    // Asia
    expect(codes).toContain('CN');
    // Oceanía
    expect(codes).toContain('AU');
  });

  it('los primeros y últimos países deben estar en orden correcto', () => {
    // Verificar que el array comienza y termina con los países esperados
    // (ordenamiento alfabético aproximado, puede haber variaciones por locale)
    expect(PAISES[0].label).toBe('Afganistán');
    expect(PAISES[PAISES.length - 1].label).toBe('Zimbabue');
  });
});

// ─── TIMEZONES ─────────────────────────────────────────────────────────
describe('TIMEZONES', () => {
  it('debe tener más de 30 zonas horarias', () => {
    expect(TIMEZONES.length).toBeGreaterThan(30);
  });

  it('cada zona debe tener value y label', () => {
    for (const tz of TIMEZONES) {
      expect(tz.value).toBeTruthy();
      expect(typeof tz.value).toBe('string');
      expect(tz.label).toBeTruthy();
      expect(typeof tz.label).toBe('string');
    }
  });

  it('no debe haber valores duplicados', () => {
    const values = TIMEZONES.map(t => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('cada label debe contener GMT offset', () => {
    for (const tz of TIMEZONES) {
      expect(tz.label).toMatch(/GMT[+-]\d{2}:\d{2}/);
    }
  });

  it('cada value debe seguir el patrón IANA (Area/City)', () => {
    for (const tz of TIMEZONES) {
      // Allow Etc/GMT±X format too
      expect(tz.value).toMatch(/^(Africa|America|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/.+/);
    }
  });

  it('debe incluir zonas horarias principales', () => {
    const values = TIMEZONES.map(t => t.value);
    expect(values).toContain('America/New_York');    // EST
    expect(values).toContain('America/Chicago');      // CST
    expect(values).toContain('America/Denver');       // MST
    expect(values).toContain('America/Los_Angeles');  // PST
    expect(values).toContain('Europe/London');        // GMT
    expect(values).toContain('Europe/Brussels');      // CET (Madrid)
    expect(values).toContain('Asia/Tokyo');           // JST
    expect(values).toContain('Australia/Canberra');   // AEST (Sydney)
  });

  it('debe incluir zonas latinoamericanas', () => {
    const values = TIMEZONES.map(t => t.value);
    expect(values).toContain('America/Cancun');  // Mexico City
    expect(values).toContain('America/Bogota');
    expect(values).toContain('America/Argentina/Buenos_Aires');
    expect(values).toContain('America/Santiago');
    expect(values).toContain('America/Sao_Paulo');
  });

  it('debe incluir Etc/GMT±X para islas del Pacífico', () => {
    const values = TIMEZONES.map(t => t.value);
    expect(values).toContain('Etc/GMT+10');
    expect(values).toContain('Etc/GMT+8');
    expect(values).toContain('Etc/GMT-12');
  });

  it('debe cubrir desde GMT-11 hasta GMT+13', () => {
    const offsets = TIMEZONES.map(t => {
      const m = t.label.match(/GMT([+-]\d{2}):(\d{2})/);
      return m ? parseInt(m[1]) : 0;
    });
    expect(Math.min(...offsets)).toBeLessThanOrEqual(-11);
    expect(Math.max(...offsets)).toBeGreaterThanOrEqual(13);
  });
});
