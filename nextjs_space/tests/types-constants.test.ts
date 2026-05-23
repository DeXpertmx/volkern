import { describe, it, expect } from 'vitest';
import { EstadosLead, EstadosCita, Monedas } from '@/lib/types';

// ==================== EstadosLead ====================
describe('EstadosLead', () => {
  it('debe tener 4 estados', () => {
    const values = Object.values(EstadosLead);
    expect(values).toHaveLength(4);
  });

  it('debe incluir los estados esperados', () => {
    expect(EstadosLead.NUEVO).toBe('nuevo');
    expect(EstadosLead.CONTACTADO).toBe('contactado');
    expect(EstadosLead.CONVERTIDO).toBe('convertido');
    expect(EstadosLead.PERDIDO).toBe('perdido');
  });

  it('todos los valores deben ser strings no vacíos', () => {
    for (const v of Object.values(EstadosLead)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('no debe tener valores duplicados', () => {
    const values = Object.values(EstadosLead);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ==================== EstadosCita ====================
describe('EstadosCita', () => {
  it('debe tener 5 estados', () => {
    const values = Object.values(EstadosCita);
    expect(values).toHaveLength(5);
  });

  it('debe incluir los estados esperados', () => {
    expect(EstadosCita.PENDIENTE).toBe('pendiente');
    expect(EstadosCita.CONFIRMADA).toBe('confirmada');
    expect(EstadosCita.PAGADA).toBe('pagada');
    expect(EstadosCita.COMPLETADA).toBe('completada');
    expect(EstadosCita.CANCELADA).toBe('cancelada');
  });

  it('todos los valores deben ser strings no vacíos', () => {
    for (const v of Object.values(EstadosCita)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('no debe tener valores duplicados', () => {
    const values = Object.values(EstadosCita);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ==================== Monedas ====================
describe('Monedas', () => {
  it('debe tener 4 monedas soportadas', () => {
    const values = Object.values(Monedas);
    expect(values).toHaveLength(4);
  });

  it('debe incluir USD, MXN, EUR, COP', () => {
    expect(Monedas.USD).toBe('USD');
    expect(Monedas.MXN).toBe('MXN');
    expect(Monedas.EUR).toBe('EUR');
    expect(Monedas.COP).toBe('COP');
  });

  it('todas las monedas deben ser códigos ISO de 3 letras', () => {
    for (const v of Object.values(Monedas)) {
      expect(v).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('no debe tener valores duplicados', () => {
    const values = Object.values(Monedas);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
