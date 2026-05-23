import { describe, it, expect } from 'vitest';
import {
  FISCAL_ID_CONFIGS,
  getFiscalIdConfigsByCountry,
  getFiscalIdConfig,
  validateFiscalId,
  getSupportedCountries,
  TASAS_IVA_PREDETERMINADAS,
  REGIMENES_FISCALES,
  getRegimenesFiscales,
  MONEDAS_POR_PAIS,
  PAISES_UE,
  aplicaInversionSujetoPasivo,
} from '@/lib/fiscal-validation';

// ==================== FISCAL_ID_CONFIGS ====================
describe('FISCAL_ID_CONFIGS', () => {
  it('debe tener configs para al menos 10 países', () => {
    const paises = new Set(FISCAL_ID_CONFIGS.map(c => c.pais));
    expect(paises.size).toBeGreaterThanOrEqual(10);
  });

  it('cada config debe tener pais, tipoId, regex, mascara, ejemplo, descripcion', () => {
    for (const config of FISCAL_ID_CONFIGS) {
      expect(config.pais).toBeTruthy();
      expect(config.tipoId).toBeTruthy();
      expect(config.regex).toBeInstanceOf(RegExp);
      expect(config.mascara).toBeTruthy();
      expect(config.ejemplo).toBeTruthy();
      expect(config.descripcion).toBeTruthy();
    }
  });

  it('no debe haber duplicados de pais+tipoId', () => {
    const keys = FISCAL_ID_CONFIGS.map(c => `${c.pais}:${c.tipoId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('España debe tener NIF, CIF y NIE', () => {
    const esTypes = FISCAL_ID_CONFIGS.filter(c => c.pais === 'ES').map(c => c.tipoId);
    expect(esTypes).toContain('NIF');
    expect(esTypes).toContain('CIF');
    expect(esTypes).toContain('NIE');
  });

  it('las validaciones adicionales deben ser funciones o undefined', () => {
    for (const config of FISCAL_ID_CONFIGS) {
      if (config.validacion) {
        expect(typeof config.validacion).toBe('function');
      }
    }
  });
});

// ==================== getFiscalIdConfigsByCountry ====================
describe('getFiscalIdConfigsByCountry', () => {
  it('debe devolver configs para ES', () => {
    const configs = getFiscalIdConfigsByCountry('ES');
    expect(configs.length).toBeGreaterThanOrEqual(3);
    expect(configs.every(c => c.pais === 'ES')).toBe(true);
  });

  it('debe devolver array vacío para país no soportado', () => {
    expect(getFiscalIdConfigsByCountry('XX')).toEqual([]);
  });
});

// ==================== getFiscalIdConfig ====================
describe('getFiscalIdConfig', () => {
  it('debe devolver config para ES NIF', () => {
    const config = getFiscalIdConfig('ES', 'NIF');
    expect(config).toBeDefined();
    expect(config!.pais).toBe('ES');
    expect(config!.tipoId).toBe('NIF');
  });

  it('debe devolver undefined para combinación no existente', () => {
    expect(getFiscalIdConfig('ES', 'INVENTADO')).toBeUndefined();
    expect(getFiscalIdConfig('XX', 'NIF')).toBeUndefined();
  });
});

// ==================== validateFiscalId ====================
describe('validateFiscalId', () => {
  // NIF español
  it('debe validar NIF español correcto', () => {
    const result = validateFiscalId('ES', 'NIF', '12345678Z');
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe('12345678Z');
  });

  it('debe rechazar NIF español con letra incorrecta', () => {
    const result = validateFiscalId('ES', 'NIF', '12345678A');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dígito de control');
  });

  // CIF español
  it('debe validar CIF español correcto', () => {
    const result = validateFiscalId('ES', 'CIF', 'A28017895');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar CIF español con formato inválido', () => {
    const result = validateFiscalId('ES', 'CIF', '12345');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Formato inválido');
  });

  // NIE español
  it('debe validar NIE español correcto (X → 0, 01234567 % 23 = 19 → L)', () => {
    const result = validateFiscalId('ES', 'NIE', 'X1234567L');
    expect(result.valid).toBe(true);
  });

  // EIN USA
  it('debe validar EIN americano con prefijo válido', () => {
    const result = validateFiscalId('US', 'EIN', '12-3456789');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar EIN con prefijo inválido', () => {
    const result = validateFiscalId('US', 'EIN', '07-3456789');
    expect(result.valid).toBe(false);
  });

  // RUT Chile
  it('debe validar RUT chileno correcto', () => {
    // 12.345.678 → dígito verificador: 12.345.678 mod 11 → 5
    const result = validateFiscalId('CL', 'RUT', '12.345.678-5');
    expect(result.valid).toBe(true);
  });

  it('debe rechazar RUT chileno con DV incorrecto', () => {
    const result = validateFiscalId('CL', 'RUT', '12.345.678-0');
    expect(result.valid).toBe(false);
  });

  // CUIT Argentina
  it('debe validar CUIT argentino correcto', () => {
    // 20-12345678-9: verificación con pesos [5,4,3,2,7,6,5,4,3,2]
    // 2*5+0*4+1*3+2*2+3*7+4*6+5*5+6*4+7*3+8*2 = 10+0+3+4+21+24+25+24+21+16=148
    // 148 % 11 = 5, 11-5 = 6. Pero wait, 20-12345678-6... let me recalculate
    // The example says 20-12345678-9. Let me verify: 2*5+0*4+1*3+2*2+3*7+4*6+5*5+6*4+7*3+8*2 = 10+0+3+4+21+24+25+24+21+16 = 148. 148%11=5. If remainder is 0→0, 1→9, else 11-remainder. 5→11-5=6. So DV should be 6, not 9.
    // Use a known valid: 20-12345678-6
    const result = validateFiscalId('AR', 'CUIT', '20-12345678-6');
    expect(result.valid).toBe(true);
  });

  // CNPJ Brasil
  it('debe validar CNPJ brasileño correcto', () => {
    const result = validateFiscalId('BR', 'CNPJ', '11.444.777/0001-61');
    expect(result.valid).toBe(true);
  });

  // NIT Colombia
  it('debe validar NIT colombiano correcto', () => {
    const result = validateFiscalId('CO', 'NIT', '900123456-8');
    expect(result.valid).toBe(true);
  });

  // País no configurado
  it('debe aceptar cualquier valor para país no configurado', () => {
    const result = validateFiscalId('XX', 'UNKNOWN', 'anything');
    expect(result.valid).toBe(true);
  });

  // Trim y uppercase
  it('debe normalizar con trim y uppercase', () => {
    const result = validateFiscalId('ES', 'NIF', '  12345678z  ');
    expect(result.valid).toBe(true);
    expect(result.formatted).toBe('12345678Z');
  });

  // Portugal NIF
  it('debe validar NIF portugués correcto', () => {
    // 9 digits, weights [9,8,7,6,5,4,3,2,1], total % 11 == 0
    const result = validateFiscalId('PT', 'NIF', '123456789');
    // Let's verify: 1*9+2*8+3*7+4*6+5*5+6*4+7*3+8*2+9*1 = 9+16+21+24+25+24+21+16+9 = 165. 165%11 = 0. Yes!
    expect(result.valid).toBe(true);
  });
});

// ==================== getSupportedCountries ====================
describe('getSupportedCountries', () => {
  it('debe devolver al menos 10 países', () => {
    const paises = getSupportedCountries();
    expect(paises.length).toBeGreaterThanOrEqual(10);
  });

  it('cada país debe tener codigo y nombre', () => {
    const paises = getSupportedCountries();
    for (const p of paises) {
      expect(p.codigo).toBeTruthy();
      expect(p.nombre).toBeTruthy();
    }
  });

  it('debe incluir ES, MX, US, AR, CL, CO', () => {
    const paises = getSupportedCountries();
    const codigos = paises.map(p => p.codigo);
    expect(codigos).toContain('ES');
    expect(codigos).toContain('MX');
    expect(codigos).toContain('US');
    expect(codigos).toContain('AR');
    expect(codigos).toContain('CL');
    expect(codigos).toContain('CO');
  });
});

// ==================== TASAS_IVA_PREDETERMINADAS ====================
describe('TASAS_IVA_PREDETERMINADAS', () => {
  it('debe tener tasas para al menos 10 países', () => {
    expect(Object.keys(TASAS_IVA_PREDETERMINADAS).length).toBeGreaterThanOrEqual(10);
  });

  it('ES debe tener general=21, reducida=10, superReducida=4', () => {
    expect(TASAS_IVA_PREDETERMINADAS.ES.general).toBe(21);
    expect(TASAS_IVA_PREDETERMINADAS.ES.reducida).toBe(10);
    expect(TASAS_IVA_PREDETERMINADAS.ES.superReducida).toBe(4);
  });

  it('cada país debe tener tasa general definida', () => {
    for (const [, tasas] of Object.entries(TASAS_IVA_PREDETERMINADAS)) {
      expect(typeof tasas.general).toBe('number');
      expect(tasas.general).toBeGreaterThanOrEqual(0);
    }
  });
});

// ==================== REGIMENES_FISCALES ====================
describe('REGIMENES_FISCALES + getRegimenesFiscales', () => {
  it('debe tener regímenes para MX, ES, US', () => {
    expect(REGIMENES_FISCALES.MX).toBeDefined();
    expect(REGIMENES_FISCALES.ES).toBeDefined();
    expect(REGIMENES_FISCALES.US).toBeDefined();
  });

  it('MX debe tener al menos 15 regímenes', () => {
    expect(REGIMENES_FISCALES.MX.length).toBeGreaterThanOrEqual(15);
  });

  it('cada régimen debe tener codigo y nombre', () => {
    for (const [, regimenes] of Object.entries(REGIMENES_FISCALES)) {
      for (const r of regimenes) {
        expect(r.codigo).toBeTruthy();
        expect(r.nombre).toBeTruthy();
      }
    }
  });

  it('getRegimenesFiscales debe devolver array vacío para país no soportado', () => {
    expect(getRegimenesFiscales('XX')).toEqual([]);
  });

  it('getRegimenesFiscales debe devolver regímenes para MX', () => {
    const regimenes = getRegimenesFiscales('MX');
    expect(regimenes.length).toBeGreaterThan(0);
    expect(regimenes[0].codigo).toBeTruthy();
  });
});

// ==================== MONEDAS_POR_PAIS ====================
describe('MONEDAS_POR_PAIS', () => {
  it('debe tener monedas para al menos 10 países', () => {
    expect(Object.keys(MONEDAS_POR_PAIS).length).toBeGreaterThanOrEqual(10);
  });

  it('ES debe ser EUR €', () => {
    expect(MONEDAS_POR_PAIS.ES.codigo).toBe('EUR');
    expect(MONEDAS_POR_PAIS.ES.simbolo).toBe('€');
  });

  it('MX debe ser MXN $', () => {
    expect(MONEDAS_POR_PAIS.MX.codigo).toBe('MXN');
    expect(MONEDAS_POR_PAIS.MX.simbolo).toBe('$');
  });

  it('US debe ser USD $', () => {
    expect(MONEDAS_POR_PAIS.US.codigo).toBe('USD');
    expect(MONEDAS_POR_PAIS.US.simbolo).toBe('$');
  });

  it('cada moneda debe tener codigo de 3 letras', () => {
    for (const [, moneda] of Object.entries(MONEDAS_POR_PAIS)) {
      expect(moneda.codigo).toMatch(/^[A-Z]{3}$/);
    }
  });
});

// ==================== PAISES_UE ====================
describe('PAISES_UE', () => {
  it('debe tener 27 países', () => {
    expect(PAISES_UE).toHaveLength(27);
  });

  it('debe incluir ES, DE, FR, IT, PT', () => {
    expect(PAISES_UE).toContain('ES');
    expect(PAISES_UE).toContain('DE');
    expect(PAISES_UE).toContain('FR');
    expect(PAISES_UE).toContain('IT');
    expect(PAISES_UE).toContain('PT');
  });

  it('no debe tener duplicados', () => {
    expect(new Set(PAISES_UE).size).toBe(PAISES_UE.length);
  });

  it('todos deben ser códigos ISO de 2 letras', () => {
    for (const pais of PAISES_UE) {
      expect(pais).toMatch(/^[A-Z]{2}$/);
    }
  });
});

// ==================== aplicaInversionSujetoPasivo ====================
describe('aplicaInversionSujetoPasivo', () => {
  it('debe aplicar si ambos en UE, distintos países, y cliente tiene ID intracomunitario', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'DE', true)).toBe(true);
  });

  it('no debe aplicar si mismo país', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'ES', true)).toBe(false);
  });

  it('no debe aplicar si emisor no está en UE', () => {
    expect(aplicaInversionSujetoPasivo('MX', 'DE', true)).toBe(false);
  });

  it('no debe aplicar si cliente no está en UE', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'MX', true)).toBe(false);
  });

  it('no debe aplicar si cliente no tiene ID intracomunitario', () => {
    expect(aplicaInversionSujetoPasivo('ES', 'DE', false)).toBe(false);
  });

  it('no debe aplicar si ambos fuera de UE', () => {
    expect(aplicaInversionSujetoPasivo('MX', 'US', true)).toBe(false);
  });
});
