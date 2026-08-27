import { describe, it, expect } from 'vitest';
import { parseNum } from '../lib/import/parse-num';

describe('parseNum determinista por moneda', () => {
  describe('EUR (punto = miles, coma = decimal)', () => {
    it('parsea miles + decimales europeos', () => {
      expect(parseNum('1.234,56', 'EUR')).toBe(1234.56);
      expect(parseNum('12.000,50', 'EUR')).toBe(12000.5);
      expect(parseNum('1.234.567,89', 'EUR')).toBe(1234567.89);
    });

    it('parsea miles enteros sin decimales', () => {
      // El bug original: '1.234' en EUR debe ser mil doscientos treinta y cuatro,
      // no uno con doscientos treinta y cuatro decimales.
      expect(parseNum('1.234', 'EUR')).toBe(1234);
      expect(parseNum('1.500', 'EUR')).toBe(1500);
    });

    it('parsea decimales sin miles', () => {
      expect(parseNum('240,39', 'EUR')).toBe(240.39);
      expect(parseNum('31,88', 'EUR')).toBe(31.88);
      expect(parseNum('0,57', 'EUR')).toBe(0.57);
    });

    it('maneja enteros limpios y números', () => {
      expect(parseNum('240', 'EUR')).toBe(240);
      expect(parseNum(240.39, 'EUR')).toBe(240.39);
      expect(parseNum('315', 'EUR')).toBe(315);
    });

    it('NO rompe números reales de Excel con punto decimal (bug: 1234.56 → 123456)', () => {
      // Cuando la celda de Excel es numérica (formato general), SheetJS entrega
      // '1234.56'. El fix anterior hacía replace(/\\./g,'') y lo convertía en 123456.
      expect(parseNum('1234.56', 'EUR')).toBe(1234.56);
      expect(parseNum('1234.5', 'EUR')).toBe(1234.5);
      expect(parseNum('999.99', 'EUR')).toBe(999.99);
    });

    it('respeta archivos en formato americano aunque el tenant sea EUR', () => {
      expect(parseNum('1,234.56', 'EUR')).toBe(1234.56);
      expect(parseNum('1,234', 'EUR')).toBe(1234);
      expect(parseNum('240.39', 'EUR')).toBe(240.39);
    });

    it('devuelve null en vacíos', () => {
      expect(parseNum('', 'EUR')).toBeNull();
      expect(parseNum(null, 'EUR')).toBeNull();
    });
  });

  describe('USD/MXN (coma = miles, punto = decimal)', () => {
    it('parsea miles + decimales americanos', () => {
      expect(parseNum('1,234.56', 'USD')).toBe(1234.56);
      expect(parseNum('1,234,567.89', 'USD')).toBe(1234567.89);
    });

    it('parsea miles enteros sin decimales', () => {
      expect(parseNum('1,234', 'USD')).toBe(1234);
      expect(parseNum('1,500', 'MXN')).toBe(1500);
    });

    it('parsea decimales sin miles', () => {
      expect(parseNum('240.39', 'USD')).toBe(240.39);
      expect(parseNum('31.88', 'MXN')).toBe(31.88);
    });

    it('parsea enteros limpios', () => {
      expect(parseNum('315', 'USD')).toBe(315);
      expect(parseNum(1234.56, 'USD')).toBe(1234.56);
    });

    it('NO rompe números reales de Excel con punto decimal', () => {
      expect(parseNum('1234.56', 'USD')).toBe(1234.56);
      expect(parseNum('1234.56', 'MXN')).toBe(1234.56);
    });

    it('respeta archivos en formato europeo aunque el tenant no sea EUR', () => {
      expect(parseNum('1.234,56', 'MXN')).toBe(1234.56);
      expect(parseNum('240,39', 'USD')).toBe(240.39);
    });
  });

  describe('Sin moneda (auto-detección / genérico)', () => {
    it('es robusto ante enteros y números', () => {
      expect(parseNum('1234.56')).toBe(1234.56);
      expect(parseNum('1234')).toBe(1234);
      expect(parseNum(42)).toBe(42);
    });

    it('soporta el formato europeo clásico sin moneda', () => {
      expect(parseNum('240,39')).toBe(240.39);
    });
  });
});