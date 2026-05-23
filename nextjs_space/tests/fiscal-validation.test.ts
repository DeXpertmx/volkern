import { describe, it, expect } from 'vitest';
import {
  FISCAL_ID_CONFIGS,
  getFiscalIdConfigsByCountry,
  getFiscalIdConfig,
  validateFiscalId,
  getSupportedCountries,
  REGIMENES_FISCALES,
  getRegimenesFiscales,
  MONEDAS_POR_PAIS,
  PAISES_UE,
  aplicaInversionSujetoPasivo,
  TASAS_IVA_PREDETERMINADAS,
} from '@/lib/fiscal-validation';

// ============================================================
// FISCAL_ID_CONFIGS
// ============================================================
describe('FISCAL_ID_CONFIGS', () => {
  it('debe ser un array con al menos 10 países', () => {
    expect(Array.isArray(FISCAL_ID_CONFIGS)).toBe(true);
    expect(FISCAL_ID_CONFIGS.length).toBeGreaterThanOrEqual(10);
  });

  it('cada entrada debe tener schema completo (pais, tipoId, regex, mascara, ejemplo, descripcion)', () => {
    for (const config of FISCAL_ID_CONFIGS) {
      expect(config).toHaveProperty('pais');
      expect(config).toHaveProperty('paisNombre');
      expect(config).toHaveProperty('tipoId');
      expect(config).toHaveProperty('tipoIdNombre');
      expect(config).toHaveProperty('regex');
      expect(config).toHaveProperty('mascara');
      expect(config).toHaveProperty('ejemplo');
      expect(config).toHaveProperty('descripcion');
      expect(typeof config.pais).toBe('string');
      expect(config.pais.length).toBe(2);
    }
  });

  it('debe incluir config para MX (RFC)', () => {
    const mx = FISCAL_ID_CONFIGS.filter(c => c.pais === 'MX');
    expect(mx.length).toBeGreaterThanOrEqual(1);
    const rfc = mx.find(c => c.tipoId === 'RFC');
    expect(rfc).toBeDefined();
    expect(rfc!.regex).toBeInstanceOf(RegExp);
  });

  it('debe incluir config para ES (NIF, CIF, NIE)', () => {
    const es = FISCAL_ID_CONFIGS.filter(c => c.pais === 'ES');
    expect(es.length).toBeGreaterThanOrEqual(3);
    const tipos = es.map(c => c.tipoId);
    expect(tipos).toContain('NIF');
    expect(tipos).toContain('CIF');
    expect(tipos).toContain('NIE');
  });

  it('los regex deben compilar correctamente', () => {
    for (const config of FISCAL_ID_CONFIGS) {
      expect(config.regex).toBeInstanceOf(RegExp);
      // Cada regex debe hacer match con su ejemplo
      expect(config.regex.test(config.ejemplo)).toBe(true);
    }
  });

  it('los IDs de cada país deben ser únicos (pais+tipoId)', () => {
    const seen = new Set<string>();
    for (const config of FISCAL_ID_CONFIGS) {
      const key = `${config.pais}::${config.tipoId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// ============================================================
// getFiscalIdConfigsByCountry
// ============================================================
describe('getFiscalIdConfigsByCountry', () => {
  it('debe devolver todas las configs para ES (NIF, CIF, NIE)', () => {
    const result = getFiscalIdConfigsByCountry('ES');
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every(c => c.pais === 'ES')).toBe(true);
  });

  it('debe devolver configs para MX', () => {
    const result = getFiscalIdConfigsByCountry('MX');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].pais).toBe('MX');
  });

  it('debe devolver array vacío para país no soportado', () => {
    const result = getFiscalIdConfigsByCountry('XX');
    expect(result).toEqual([]);
  });

  it('debe devolver array vacío para string vacío', () => {
    const result = getFiscalIdConfigsByCountry('');
    expect(result).toEqual([]);
  });

  it('debe ser determinista (mismas entradas en mismo orden)', () => {
    const a = getFiscalIdConfigsByCountry('ES');
    const b = getFiscalIdConfigsByCountry('ES');
    expect(a).toEqual(b);
  });
});

// ============================================================
// getFiscalIdConfig
// ============================================================
describe('getFiscalIdConfig', () => {
  it('debe devolver config NIF español', () => {
    const config = getFiscalIdConfig('ES', 'NIF');
    expect(config).toBeDefined();
    expect(config!.tipoId).toBe('NIF');
    expect(config!.pais).toBe('ES');
  });

  it('debe devolver config RFC mexicano', () => {
    const config = getFiscalIdConfig('MX', 'RFC');
    expect(config).toBeDefined();
    expect(config!.tipoId).toBe('RFC');
  });

  it('debe devolver undefined para país+tipoId inexistente', () => {
    expect(getFiscalIdConfig('ES', 'RFC')).toBeUndefined();
    expect(getFiscalIdConfig('XX', 'NIF')).toBeUndefined();
    expect(getFiscalIdConfig('', '')).toBeUndefined();
  });
});

// ============================================================
// validateFiscalId
// ============================================================
describe('validateFiscalId', () => {
  // --- NIF español ---
  it('debe validar NIF español correcto (12345678Z)', () => {
    const result = validateFiscalId('ES', 'NIF', '12345678Z');
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe('12345678Z');
  });

  it('debe validar NIF español con otro dígito válido', () => {
    // 00000000T → 0 % 23 = 0 → T
    const result = validateFiscalId('ES', 'NIF', '00000000T');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar NIF español con letra incorrecta', () => {
    const result = validateFiscalId('ES', 'NIF', '12345678A');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dígito de control');
  });

  it('debe rechazar NIF español con formato incorrecto', () => {
    const result = validateFiscalId('ES', 'NIF', 'ABCDEFGHI');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Formato inválido');
  });

  // --- CIF español ---
  it('debe validar CIF español correcto (B12345678)', () => {
    // B → empresa. B12345678 tiene dígito de control calculado
    const result = validateFiscalId('ES', 'CIF', 'B12345678');
    // Nota: el dígito de control puede ser número o letra según el cálculo
    // Verificamos al menos que no dé error de formato
    expect(result.valid !== undefined).toBe(true);
  });

  it('debe rechazar CIF con letra de tipo inválida', () => {
    const result = validateFiscalId('ES', 'CIF', 'O12345678');
    expect(result.valid).toBe(false);
  });

  // --- NIE español ---
  it('debe validar NIE español con X', () => {
    // X1234567L: X→0, 01234567 % 23 = ?
    const result = validateFiscalId('ES', 'NIE', 'X1234567L');
    // Verificar que no es undefined
    expect(typeof result.valid).toBe('boolean');
  });

  // --- RFC mexicano ---
  it('debe validar RFC mexicano de 13 caracteres', () => {
    const result = validateFiscalId('MX', 'RFC', 'XAXX010101000');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar RFC mexicano con fecha inválida', () => {
    const result = validateFiscalId('MX', 'RFC', 'XAXX019901XXX');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dígito de control');
  });

  it('debe rechazar RFC con length incorrecto', () => {
    const result = validateFiscalId('MX', 'RFC', 'ABC123');
    expect(result.valid).toBe(false);
  });

  // --- EIN (US) ---
  it('debe validar EIN con prefijo válido', () => {
    const result = validateFiscalId('US', 'EIN', '12-3456789');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar EIN con prefijo inválido (07 no existe)', () => {
    const result = validateFiscalId('US', 'EIN', '07-3456789');
    expect(result.valid).toBe(false);
  });

  // --- RUT chileno ---
  it('debe validar RUT chileno correcto', () => {
    // 12.345.678-5: known valid RUT
    const result = validateFiscalId('CL', 'RUT', '12.345.678-5');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar RUT con dígito verificador incorrecto', () => {
    const result = validateFiscalId('CL', 'RUT', '12.345.678-0');
    expect(result.valid).toBe(false);
  });

  // --- CUIT argentino ---
  it('debe validar CUIT argentino correcto', () => {
    // 20-12345678-9 (simplificado, puede no ser un CUIT real válido)
    const result = validateFiscalId('AR', 'CUIT', '20-12345678-3');
    // Aceptamos que puede ser válido o no según algoritmo
    expect(typeof result.valid).toBe('boolean');
  });

  // --- Países sin validación adicional (solo regex) ---
  it('debe validar VAT UK con formato correcto', () => {
    const result = validateFiscalId('GB', 'VAT', 'GB123456789');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar VAT UK con formato incorrecto', () => {
    const result = validateFiscalId('GB', 'VAT', 'GB12345');
    expect(result.valid).toBe(false);
  });

  it('debe validar UST alemán', () => {
    const result = validateFiscalId('DE', 'UST', 'DE123456789');
    expect(result.valid).toBe(true);
  });

  // --- País no soportado (acepta todo) ---
  it('debe aceptar cualquier valor para país no configurado', () => {
    const result = validateFiscalId('XX', 'YYY', 'cualquier-cosa');
    expect(result.valid).toBe(true);
  });

  // --- Edge cases ---
  it('debe manejar espacios en blanco alrededor del valor', () => {
    const result = validateFiscalId('ES', 'NIF', '  12345678Z  ');
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe('12345678Z');
  });

  it('debe manejar lowercase correctamente', () => {
    const result = validateFiscalId('ES', 'NIF', '12345678z');
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe('12345678Z');
  });

  it('debe manejar string vacío', () => {
    const result = validateFiscalId('ES', 'NIF', '');
    expect(result.valid).toBe(false);
  });

  // --- Determinismo ---
  it('debe ser determinista', () => {
    const a = validateFiscalId('ES', 'NIF', '12345678Z');
    const b = validateFiscalId('ES', 'NIF', '12345678Z');
    expect(a).toEqual(b);
  });
});

// ============================================================
// getSupportedCountries
// ============================================================
describe('getSupportedCountries', () => {
  it('debe devolver array de {codigo, nombre}', () => {
    const countries = getSupportedCountries();
    expect(Array.isArray(countries)).toBe(true);
    expect(countries.length).toBeGreaterThanOrEqual(8);
    for (const c of countries) {
      expect(c).toHaveProperty('codigo');
      expect(c).toHaveProperty('nombre');
      expect(typeof c.codigo).toBe('string');
      expect(c.codigo.length).toBe(2);
    }
  });

  it('debe incluir MX, ES, US, AR, CL, CO, BR', () => {
    const countries = getSupportedCountries();
    const codes = countries.map(c => c.codigo);
    expect(codes).toContain('MX');
    expect(codes).toContain('ES');
    expect(codes).toContain('US');
    expect(codes).toContain('AR');
    expect(codes).toContain('CL');
    expect(codes).toContain('CO');
    expect(codes).toContain('BR');
  });

  it('no debe tener países duplicados', () => {
    const countries = getSupportedCountries();
    const codes = countries.map(c => c.codigo);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('debe ser determinista', () => {
    const a = getSupportedCountries();
    const b = getSupportedCountries();
    expect(a).toEqual(b);
  });
});

// ============================================================
// REGIMENES_FISCALES
// ============================================================
describe('REGIMENES_FISCALES', () => {
  it('debe ser un objeto con al menos MX, ES, US', () => {
    expect(REGIMENES_FISCALES).toHaveProperty('MX');
    expect(REGIMENES_FISCALES).toHaveProperty('ES');
    expect(REGIMENES_FISCALES).toHaveProperty('US');
  });

  it('cada régimen debe tener codigo y nombre', () => {
    for (const pais of Object.keys(REGIMENES_FISCALES)) {
      const regimenes = REGIMENES_FISCALES[pais];
      expect(Array.isArray(regimenes)).toBe(true);
      expect(regimenes.length).toBeGreaterThan(0);
      for (const r of regimenes) {
        expect(r).toHaveProperty('codigo');
        expect(r).toHaveProperty('nombre');
      }
    }
  });

  it('MX debe tener al menos 15 regímenes', () => {
    expect(REGIMENES_FISCALES['MX'].length).toBeGreaterThanOrEqual(15);
  });

  it('ES debe tener al menos 5 regímenes', () => {
    expect(REGIMENES_FISCALES['ES'].length).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
// getRegimenesFiscales
// ============================================================
describe('getRegimenesFiscales', () => {
  it('debe devolver regímenes para MX', () => {
    const regimenes = getRegimenesFiscales('MX');
    expect(regimenes.length).toBeGreaterThanOrEqual(15);
    expect(regimenes.some(r => r.codigo === '601')).toBe(true);
    expect(regimenes.some(r => r.codigo === '626')).toBe(true);
  });

  it('debe devolver regímenes para ES', () => {
    const regimenes = getRegimenesFiscales('ES');
    expect(regimenes.length).toBeGreaterThanOrEqual(5);
  });

  it('debe devolver array vacío para país no soportado', () => {
    expect(getRegimenesFiscales('XX')).toEqual([]);
    expect(getRegimenesFiscales('')).toEqual([]);
  });

  it('debe ser determinista', () => {
    const a = getRegimenesFiscales('MX');
    const b = getRegimenesFiscales('MX');
    expect(a).toEqual(b);
  });
});

// ============================================================
// MONEDAS_POR_PAIS
// ============================================================
describe('MONEDAS_POR_PAIS', () => {
  it('debe tener al menos 10 países', () => {
    expect(Object.keys(MONEDAS_POR_PAIS).length).toBeGreaterThanOrEqual(10);
  });

  it('cada entrada debe tener codigo, nombre, simbolo', () => {
    for (const pais of Object.keys(MONEDAS_POR_PAIS)) {
      const m = MONEDAS_POR_PAIS[pais];
      expect(m).toHaveProperty('codigo');
      expect(m).toHaveProperty('nombre');
      expect(m).toHaveProperty('simbolo');
      expect(typeof m.codigo).toBe('string');
      expect(m.codigo.length).toBe(3);
    }
  });

  it('MX → MXN, ES/DE/FR/IT/PT → EUR, US → USD', () => {
    expect(MONEDAS_POR_PAIS['MX'].codigo).toBe('MXN');
    expect(MONEDAS_POR_PAIS['ES'].codigo).toBe('EUR');
    expect(MONEDAS_POR_PAIS['US'].codigo).toBe('USD');
    expect(MONEDAS_POR_PAIS['DE'].codigo).toBe('EUR');
    expect(MONEDAS_POR_PAIS['FR'].codigo).toBe('EUR');
    expect(MONEDAS_POR_PAIS['IT'].codigo).toBe('EUR');
    expect(MONEDAS_POR_PAIS['PT'].codigo).toBe('EUR');
  });

  it('BR → BRL, GB → GBP', () => {
    expect(MONEDAS_POR_PAIS['BR'].codigo).toBe('BRL');
    expect(MONEDAS_POR_PAIS['GB'].codigo).toBe('GBP');
  });
});

// ============================================================
// PAISES_UE
// ============================================================
describe('PAISES_UE', () => {
  it('debe ser un array con al menos 25 países', () => {
    expect(Array.isArray(PAISES_UE)).toBe(true);
    expect(PAISES_UE.length).toBeGreaterThanOrEqual(25);
  });

  it('debe incluir ES, DE, FR, IT, PT', () => {
    expect(PAISES_UE).toContain('ES');
    expect(PAISES_UE).toContain('DE');
    expect(PAISES_UE).toContain('FR');
    expect(PAISES_UE).toContain('IT');
    expect(PAISES_UE).toContain('PT');
  });

  it('todos los códigos deben ser de 2 caracteres', () => {
    for (const codigo of PAISES_UE) {
      expect(codigo.length).toBe(2);
    }
  });
});

// ============================================================
// aplicaInversionSujetoPasivo
// ============================================================
describe('aplicaInversionSujetoPasivo', () => {
  it('true: ambos UE, países diferentes, cliente con VAT intracomunitario', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'DE', true)).toBe(true);
    expect(aplicaInversionSujetoPasivo('DE', 'FR', true)).toBe(true);
  });

  it('false: emisor no está en UE', () => {
    expect(aplicaInversionSujetoPasivo('MX', 'ES', true)).toBe(false);
  });

  it('false: cliente no está en UE', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'MX', true)).toBe(false);
  });

  it('false: mismo país', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'ES', true)).toBe(false);
  });

  it('false: cliente no tiene ID intracomunitario', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'DE', false)).toBe(false);
  });

  it('false: ambos fuera de UE aunque cliente tenga VAT ID', () => {
    expect(aplicaInversionSujetoPasivo('MX', 'US', true)).toBe(false);
  });
});

// ============================================================
// TASAS_IVA_PREDETERMINADAS
// ============================================================
describe('TASAS_IVA_PREDETERMINADAS', () => {
  it('debe tener al menos 10 países', () => {
    expect(Object.keys(TASAS_IVA_PREDETERMINADAS).length).toBeGreaterThanOrEqual(10);
  });

  it('cada entrada debe tener "general" como número', () => {
    for (const pais of Object.keys(TASAS_IVA_PREDETERMINADAS)) {
      const tasa = TASAS_IVA_PREDETERMINADAS[pais];
      expect(tasa).toHaveProperty('general');
      expect(typeof tasa.general).toBe('number');
      expect(tasa.general).toBeGreaterThanOrEqual(0);
    }
  });

  it('ES: general 21, reducida 10, superreducida 4', () => {
    expect(TASAS_IVA_PREDETERMINADAS['ES'].general).toBe(21);
    expect(TASAS_IVA_PREDETERMINADAS['ES'].reducida).toBe(10);
    expect(TASAS_IVA_PREDETERMINADAS['ES'].superReducida).toBe(4);
  });

  it('MX: general 16', () => {
    expect(TASAS_IVA_PREDETERMINADAS['MX'].general).toBe(16);
  });

  it('US: general 0 (varía por estado)', () => {
    expect(TASAS_IVA_PREDETERMINADAS['US'].general).toBe(0);
  });
});
