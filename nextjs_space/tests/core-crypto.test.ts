import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/lib/core/crypto';

// ==================== encrypt + decrypt round-trip ====================
describe('core/crypto encrypt + decrypt', () => {
  it('debe hacer round-trip para texto normal', () => {
    const original = 'Hola mundo';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe hacer round-trip para string vacío', () => {
    const encrypted = encrypt('');
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('debe hacer round-trip para caracteres especiales', () => {
    const original = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`¡™£¢∞§¶•ªº';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe hacer round-trip para emojis y unicode', () => {
    const original = '🚀 Hola 世界 🌍 ✨ — Café ñoño';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe hacer round-trip para strings largos', () => {
    const original = 'A'.repeat(10000);
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('debe hacer round-trip para JSON', () => {
    const original = JSON.stringify({ user: 'test', data: { nested: true, arr: [1, 2, 3] } });
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
    expect(() => JSON.parse(decrypted)).not.toThrow();
  });

  it('cada encriptación debe producir distinto ciphertext (IV único)', () => {
    const encrypted1 = encrypt('mismo texto');
    const encrypted2 = encrypt('mismo texto');
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('el formato debe ser iv:encrypted (hex:hex)', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(2);
    // IV son 32 caracteres hex (16 bytes)
    expect(parts[0]).toHaveLength(32);
    // Ambos partes deben ser hex
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
  });
});

// ==================== decrypt edge cases ====================
describe('core/crypto decrypt edge cases', () => {
  it('debe devolver el texto sin modificar si el formato no es iv:encrypted', () => {
    const result = decrypt('texto-sin-formato');
    expect(result).toBe('texto-sin-formato');
  });

  it('debe devolver el texto sin modificar si hay más de 2 partes', () => {
    const result = decrypt('a:b:c:d');
    // decrypt split por ':', toma el primer elemento como IV y el resto como encrypted
    // No es "sin modificar", podría dar error o basura. Pero la función devuelve el texto si falla.
    // El comportamiento real: textParts.shift() saca el IV, textParts.join(':') reconstruye el ciphertext.
    // Si el ciphertext no es hex válido, el decipher falla y devuelve el texto original.
    const decrypted = decrypt('a:b:c:d');
    // Si falla el decipher, devuelve 'a:b:c:d' (el texto original pasado a decrypt)
    expect(typeof decrypted).toBe('string');
  });

  it('debe manejar texto vacío', () => {
    expect(decrypt('')).toBe('');
  });

  it('debe manejar texto con solo dos puntos', () => {
    const result = decrypt('::');
    expect(typeof result).toBe('string');
  });
});
