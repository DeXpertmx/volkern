// Guardia de los catálogos y selectores de país/municipio/teléfono.
//
// Lo que se vigila es el DATO que viaja al Ministerio y a las integraciones:
// países con su ISO alfa-3 y prefijo, municipios con el código INE de 5
// dígitos exacto, y teléfonos normalizados a «+prefijo+número» cuando el país
// es conocido. Un catálogo roto aquí es un parte rechazado por el INE o un
// WhatsApp que no sale.

import { describe, it, expect } from 'vitest';
import { PAISES, paisPorCodigo, prefijoDePais, normalizarTelefono, nombrePais } from '@/lib/paises-municipios/paises';
import { provinciasINE, municipiosDeProvincia, nombreMunicipioINE } from '@/lib/paises-municipios/municipios-ine';

describe('Catálogo de países', () => {
  it('trae los esenciales con su ISO alfa-3 y prefijo E.164', () => {
    const codigos = PAISES.map((p) => p.codigo);
    for (const esperado of ['ESP', 'FRA', 'DEU', 'GBR', 'USA', 'MEX', 'MAR', 'ARG', 'BRA']) {
      expect(codigos, `falta ${esperado}`).toContain(esperado);
    }
    expect(prefijoDePais('ESP')).toBe('+34');
    expect(prefijoDePais('fra')).toBe('+33'); // tolerante a mayúsculas
    expect(prefijoDePais('XXQ')).toBe('');
  });

  it('sin códigos repetidos y con bandera en todos', () => {
    const codigos = PAISES.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const p of PAISES) {
      expect(p.nombre.length, p.codigo).toBeGreaterThan(0);
      expect(p.prefijo.startsWith('+'), p.codigo).toBe(true);
      expect([...p.bandera].length, p.codigo).toBeGreaterThan(0);
    }
  });

  it('busca por código y nombra en español', () => {
    expect(paisPorCodigo('esp')?.nombre).toBe('España');
    expect(nombrePais('FRA')).toBe('Francia');
    expect(nombrePais('ZZZ')).toBe('ZZZ'); // desconocido: el código tal cual
  });
});

describe('Normalización de teléfonos', () => {
  it('añade el prefijo del país cuando el humano no lo escribió', () => {
    expect(normalizarTelefono('612 345 678', 'ESP')).toBe('+34612345678');
    expect(normalizarTelefono('06 12 34 56 78', 'FRA')).toBe('+330612345678');
    expect(normalizarTelefono('(55) 1234 5678', 'MEX')).toBe('+525512345678');
  });

  it('respeta lo que ya trae su prefijo (+ o 00)', () => {
    expect(normalizarTelefono('+34 612 345 678', 'ESP')).toBe('+34612345678');
    expect(normalizarTelefono('0034 612 345 678', 'ESP')).toBe('0034612345678');
    expect(normalizarTelefono('+1-415-555-2671', 'USA')).toBe('+14155552671');
  });

  it('sin país conocido deja el número limpio, sin inventar prefijo', () => {
    expect(normalizarTelefono('612 345 678', '')).toBe('612345678');
    expect(normalizarTelefono('612 345 678', 'XXQ')).toBe('612345678');
    expect(normalizarTelefono('', 'ESP')).toBe('');
  });
});

describe('Catálogo de municipios INE', () => {
  it('cubre las 52 provincias y Madrid está entre ellas', () => {
    const provs = provinciasINE();
    expect(provs.length).toBe(52);
    expect(provs.find((p) => p.codigo === '28')?.nombre).toBe('Madrid');
    expect(provs.find((p) => p.codigo === '08')?.nombre).toBe('Barcelona');
  });

  it('los códigos son EXACTAMENTE 5 dígitos y el par provincia+municipio es coherente', () => {
    for (const prov of ['01', '08', '28', '41', '52']) {
      for (const m of municipiosDeProvincia(prov)) {
        expect(m.codigo).toMatch(/^\d{5}$/);
        expect(m.codigo.startsWith(prov), `${m.codigo} no empieza por ${prov}`).toBe(true);
        expect(m.nombre.length).toBeGreaterThan(0);
      }
    }
  });

  it('Madrid capital es 28079 y Barcelona 08019 (catálogo INE real)', () => {
    expect(nombreMunicipioINE('28079')).toBe('Madrid');
    expect(nombreMunicipioINE('08019')).toBe('Barcelona');
    expect(nombreMunicipioINE('99999')).toBeNull();
  });

  it('una provincia desconocida devuelve lista vacía, no explota', () => {
    expect(municipiosDeProvincia('99')).toEqual([]);
  });
});
