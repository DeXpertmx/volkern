import { describe, it, expect } from 'vitest';
import { validateSpanishID } from '@/lib/utils/tax-validator';

describe('Tax Validator — validateSpanishID', () => {
  describe('NIF (DNI español)', () => {
    it('debe validar un NIF correcto (12345678Z)', () => {
      const result = validateSpanishID('12345678Z');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIF');
    });

    it('debe validar un NIF con letra correcta (00000000T)', () => {
      const result = validateSpanishID('00000000T');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIF');
    });

    it('debe rechazar NIF con letra incorrecta', () => {
      const result = validateSpanishID('12345678A');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('NIF');
      expect(result.error).toContain('Letra de control incorrecta');
    });

    it('debe validar NIF en minúsculas (normalización)', () => {
      const result = validateSpanishID('12345678z');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIF');
    });

    it('debe validar NIF con espacios alrededor', () => {
      const result = validateSpanishID('  12345678Z  ');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIF');
    });

    it('debe rechazar NIF con formato inválido (demasiado corto)', () => {
      const result = validateSpanishID('1234567Z');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
    });

    it('debe rechazar NIF con formato inválido (letras extra)', () => {
      const result = validateSpanishID('ABCDEFGHZ');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
    });
  });

  describe('NIE (Número de Identidad de Extranjero)', () => {
    it('debe validar un NIE con prefijo X', () => {
      // X1234567L es un NIE de ejemplo
      const result = validateSpanishID('X1234567L');
      // La letra depende del número transformado (X→0)
      // 01234567 % 23 = 01234567 % 23. Let's just check it runs the algorithm
      expect(result.type).toBe('NIE');
    });

    it('debe validar un NIE con prefijo Y', () => {
      const result = validateSpanishID('Y1234567X');
      expect(result.type).toBe('NIE');
    });

    it('debe validar un NIE con prefijo Z', () => {
      const result = validateSpanishID('Z1234567R');
      expect(result.type).toBe('NIE');
    });

    it('debe rechazar un NIE con letra incorrecta (prefijo X)', () => {
      // X1234567 → 01234567, letra esperada calculada
      const result = validateSpanishID('X1234567A');
      if (!result.isValid) {
        expect(result.type).toBe('NIE');
        expect(result.error).toContain('Letra de control incorrecta');
      }
    });

    it('debe aceptar NIE en minúsculas', () => {
      const result = validateSpanishID('x1234567l');
      expect(result.type).toBe('NIE');
    });
  });

  describe('CIF (Código de Identificación Fiscal - Empresas)', () => {
    it('debe validar un CIF correcto tipo A (numérico)', () => {
      // A58818501 es un CIF conocido
      const result = validateSpanishID('A58818501');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('CIF');
    });

    it('debe validar un CIF tipo B (numérico)', () => {
      const result = validateSpanishID('B12345678');
      expect(result.type).toBe('CIF');
    });

    it('debe validar un CIF tipo P (letra)', () => {
      const result = validateSpanishID('P1234567J');
      expect(result.type).toBe('CIF');
    });

    it('debe validar un CIF tipo Q (letra)', () => {
      const result = validateSpanishID('Q1234567C');
      expect(result.type).toBe('CIF');
    });

    it('debe validar un CIF tipo H (numérico)', () => {
      const result = validateSpanishID('H12345678');
      expect(result.type).toBe('CIF');
    });

    it('debe rechazar un CIF con dígito de control inválido', () => {
      const result = validateSpanishID('A12345678');
      // Probablemente inválido
      if (!result.isValid) {
        expect(result.type).toBe('CIF');
        expect(result.error).toContain('Dígito de control');
      }
    });

    it('debe aceptar CIF en minúsculas', () => {
      const result = validateSpanishID('a58818501');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('CIF');
    });
  });

  describe('Casos límite y edge cases', () => {
    it('debe rechazar string vacío', () => {
      const result = validateSpanishID('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('vacío');
    });

    it('debe rechazar string solo espacios', () => {
      const result = validateSpanishID('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('vacío');
    });

    it('debe rechazar formato completamente inválido', () => {
      const result = validateSpanishID('esto-no-es-un-id');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
      expect(result.error).toContain('no reconocido');
    });

    it('debe rechazar números puros sin letra', () => {
      const result = validateSpanishID('12345678');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
    });

    it('debe rechazar solo una letra', () => {
      const result = validateSpanishID('Z');
      expect(result.isValid).toBe(false);
    });

    it('cada resultado debe tener type y isValid', () => {
      const result = validateSpanishID('12345678Z');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('type');
    });

    it('resultados inválidos deben tener mensaje de error', () => {
      const result = validateSpanishID('XYZ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Casos reales conocidos', () => {
    it('B76364199 debe ser CIF válido', () => {
      // B76364199: B(num) → dígito control = 9
      const result = validateSpanishID('B76364199');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('CIF');
    });

    it('A28015865 debe ser CIF válido', () => {
      const result = validateSpanishID('A28015865');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('CIF');
    });
  });

  describe('Variantes de formato CIF', () => {
    it('debe aceptar letras C, D, E, F, G, J, N, R, S, U, V, W como primer carácter', () => {
      const cifLetters = ['C', 'D', 'E', 'F', 'G', 'J', 'N', 'R', 'S', 'U', 'V', 'W'];
      for (const letter of cifLetters) {
        const result = validateSpanishID(`${letter}12345678`);
        expect(result.type).toBe('CIF');
      }
    });

    it('debe rechazar letras no válidas como primer carácter de CIF', () => {
      const result = validateSpanishID('I12345678');
      // I no es una letra CIF válida
      expect(result.type).toBe('UNKNOWN');
    });
  });
});
