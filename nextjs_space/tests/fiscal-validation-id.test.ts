import { describe, it, expect } from 'vitest';
import { validateFiscalId, getFiscalIdConfigsByCountry, normalizarPais } from '@/lib/fiscal-validation';

describe('validateFiscalId España (la lógica del modal de registro de proveedor)', () => {
  it('acepta un NIF con dígito de control correcto', () => {
    expect(validateFiscalId('ES', 'NIF', '12345678Z').valid).toBe(true);
  });

  it('rechaza un NIF con dígito de control incorrecto', () => {
    const r = validateFiscalId('ES', 'NIF', '12345678X');
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('acepta un CIF con dígito de control correcto', () => {
    expect(validateFiscalId('ES', 'CIF', 'B12345674').valid).toBe(true);
  });

  it('acepta un NIE con letra de control correcta', () => {
    expect(validateFiscalId('ES', 'NIE', 'X1234567L').valid).toBe(true);
  });

  it('rechaza un NIE con letra de control incorrecta', () => {
    expect(validateFiscalId('ES', 'NIE', 'X1234567J').valid).toBe(false);
  });

  it('España tiene configs NIF/CIF/NIE (las que usa el modal)', () => {
    expect(normalizarPais('España')).toBe('ES');
    expect(getFiscalIdConfigsByCountry('ES').map(c => c.tipoId)).toEqual(['NIF', 'CIF', 'NIE']);
  });

  it('acepta cualquier valor si el país no tiene configuración', () => {
    expect(validateFiscalId('ZZ', 'NIF', 'cualquier-cosa').valid).toBe(true);
  });
});
