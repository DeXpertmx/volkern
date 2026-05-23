import { describe, it, expect } from 'vitest';
import { validateSpanishID } from '@/lib/utils/tax-validator';

// ==================== validateSpanishID ====================
describe('validateSpanishID', () => {
  // --- NIF ---
  describe('NIF', () => {
    it('debe validar NIF correcto (12345678Z)', () => {
      // 12345678 % 23 = 14 → Z
      const result = validateSpanishID('12345678Z');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIF');
    });

    it('debe validar NIF con letra correcta (00000000T)', () => {
      // 0 % 23 = 0 → T
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

    it('debe aceptar minúsculas y normalizar a mayúsculas', () => {
      const result = validateSpanishID('12345678z');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIF');
    });

    it('debe aceptar string con espacios', () => {
      const result = validateSpanishID('  12345678Z  ');
      expect(result.isValid).toBe(true);
    });

    it('debe rechazar NIF con dígitos incorrectos (letra en medio)', () => {
      const result = validateSpanishID('1234A678Z');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
    });
  });

  // --- NIE ---
  describe('NIE', () => {
    it('debe validar NIE correcto (X1234567L)', () => {
      // X → 0, 01234567 % 23 = ?
      // 1234567 % 23 = ? Let's compute: 1234567 / 23 = 53676.826..., 23*53676 = 1234548, 1234567-1234548=19 → L
      const result = validateSpanishID('X1234567L');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIE');
    });

    it('debe validar NIE con Y', () => {
      // Y → 1, 11234567 % 23 = ?
      // 11234567 % 23 = 11234567 - 23*488459 = 11234567 - 11234557 = 10 → X
      const result = validateSpanishID('Y1234567X');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIE');
    });

    it('debe validar NIE con Z', () => {
      // Z → 2, 21234567 % 23 = ?
      // 21234567 % 23 = 21234567 - 23*923242 = 21234567 - 21234566 = 1 → R
      const result = validateSpanishID('Z1234567R');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('NIE');
    });

    it('debe rechazar NIE con letra incorrecta', () => {
      const result = validateSpanishID('X1234567A');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('NIE');
      expect(result.error).toContain('Letra de control incorrecta');
    });
  });

  // --- CIF ---
  describe('CIF', () => {
    it('debe validar CIF tipo ABEH (control numérico)', () => {
      // Ejemplo: A28017895 — A, 2801789, control=5
      // Suma: 2*2=4, 8, 0*2=0, 1, 7*2=14→1+4=5, 8, 9*2=18→1+8=9
      // Total: 4+8+0+1+5+8+9 = 35
      // lastDigit = (10 - 35%10)%10 = (10-5)%10 = 5
      const result = validateSpanishID('A28017895');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('CIF');
    });

    it('debe reconocer CIF tipo PQRSW (control letra, reconocimiento de tipo)', () => {
      const result = validateSpanishID('Q2801789B');
      // Solo verificamos que el tipo se reconoce correctamente como CIF
      expect(result.type).toBe('CIF');
    });

    it('debe rechazar CIF con dígito de control inválido', () => {
      const result = validateSpanishID('A28017890');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('CIF');
      expect(result.error).toContain('Dígito de control de CIF inválido');
    });

    it('debe validar CIF tipo CD (control puede ser letra o número)', () => {
      const result = validateSpanishID('C28017895');
      // C: dígitos suma = 35, lastDigit = 5. Letra correspondiente F.
      // 5 es numérico válido, F es letra válida. test con número
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('CIF');
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('debe rechazar string vacío', () => {
      const result = validateSpanishID('');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
      expect(result.error).toContain('no puede estar vacío');
    });

    it('debe rechazar string con solo espacios', () => {
      const result = validateSpanishID('   ');
      expect(result.isValid).toBe(false);
    });

    it('debe rechazar formato completamente desconocido', () => {
      const result = validateSpanishID('hola-mundo');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
    });

    it('debe rechazar DNI con menos de 8 dígitos', () => {
      const result = validateSpanishID('1234567Z');
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('UNKNOWN');
    });
  });
});
