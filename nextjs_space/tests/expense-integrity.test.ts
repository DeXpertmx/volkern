import { describe, it, expect } from 'vitest';
import { ExpenseIntegrityService } from '@/lib/finance/expense-integrity';

describe('calculateFingerprint', () => {
  it('debe generar un hash SHA-256 de 64 caracteres hex', () => {
    const hash = ExpenseIntegrityService.calculateFingerprint({
      id: 'exp-1',
      amount: 150.50,
      createdById: 'user-1',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('debe ser determinista para los mismos datos', () => {
    const data = { id: 'exp-1', amount: 150.50, createdById: 'user-1' };
    expect(ExpenseIntegrityService.calculateFingerprint(data))
      .toBe(ExpenseIntegrityService.calculateFingerprint(data));
  });

  it('debe cambiar si cambia el id', () => {
    const h1 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 100, createdById: 'u1' });
    const h2 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-2', amount: 100, createdById: 'u1' });
    expect(h1).not.toBe(h2);
  });

  it('debe cambiar si cambia el amount', () => {
    const h1 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 100, createdById: 'u1' });
    const h2 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 200, createdById: 'u1' });
    expect(h1).not.toBe(h2);
  });

  it('debe cambiar si cambia el createdById', () => {
    const h1 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 100, createdById: 'u1' });
    const h2 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 100, createdById: 'u2' });
    expect(h1).not.toBe(h2);
  });

  it('debe cambiar si se añade parentFingerprint', () => {
    const h1 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 100, createdById: 'u1' });
    const h2 = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-1', amount: 100, createdById: 'u1', parentFingerprint: 'abc123' });
    expect(h1).not.toBe(h2);
  });

  it('debe ser determinista con parentFingerprint', () => {
    const data = { id: 'exp-1', amount: 100, createdById: 'u1', parentFingerprint: 'chain-hash' };
    expect(ExpenseIntegrityService.calculateFingerprint(data))
      .toBe(ExpenseIntegrityService.calculateFingerprint(data));
  });

  it('debe manejar amount=0', () => {
    const hash = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-0', amount: 0, createdById: 'u1' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('debe manejar amount negativo', () => {
    const hash = ExpenseIntegrityService.calculateFingerprint({ id: 'exp-neg', amount: -50, createdById: 'u1' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('debe concatenar en orden fijo: id + amount + createdById + parentFingerprint', () => {
    // Si concatenara en otro orden, estos dos serían iguales
    const h1 = ExpenseIntegrityService.calculateFingerprint({ id: 'a', amount: 1, createdById: 'b', parentFingerprint: 'c' });
    const h2 = ExpenseIntegrityService.calculateFingerprint({ id: 'a', amount: 1, createdById: 'b', parentFingerprint: 'd' });
    expect(h1).not.toBe(h2);
  });
});

// ─── calculateDistance (Haversine) ────────────────────────────────────
describe('calculateDistance (Haversine)', () => {
  it('debe devolver 0 para el mismo punto', () => {
    expect(ExpenseIntegrityService.calculateDistance(40.4168, -3.7038, 40.4168, -3.7038)).toBe(0);
  });

  it('debe calcular distancia Madrid → Barcelona (~505 km)', () => {
    const distance = ExpenseIntegrityService.calculateDistance(
      40.4168, -3.7038,  // Madrid
      41.3874, 2.1686     // Barcelona
    );
    expect(distance).toBeGreaterThan(480000);
    expect(distance).toBeLessThan(530000);
  });

  it('debe calcular distancia corta (< 1 km)', () => {
    const distance = ExpenseIntegrityService.calculateDistance(
      40.4168, -3.7038,
      40.4178, -3.7038  // ~111m al norte
    );
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(200);
  });

  it('debe ser simétrica', () => {
    const d1 = ExpenseIntegrityService.calculateDistance(40.4, -3.7, 41.4, 2.1);
    const d2 = ExpenseIntegrityService.calculateDistance(41.4, 2.1, 40.4, -3.7);
    expect(d1).toBeCloseTo(d2, 0);
  });

  it('debe manejar coordenadas en hemisferio sur', () => {
    const distance = ExpenseIntegrityService.calculateDistance(
      -33.4489, -70.6693,  // Santiago
      -34.6037, -58.3816   // Buenos Aires
    );
    expect(distance).toBeGreaterThan(1100000);
    expect(distance).toBeLessThan(1200000);
  });

  it('debe manejar el ecuador y el meridiano 0', () => {
    const distance = ExpenseIntegrityService.calculateDistance(0, 0, 0, 1);
    expect(distance).toBeGreaterThan(110000);
    expect(distance).toBeLessThan(112000);
  });

  it('debe manejar polo norte → polo sur (~20,000 km)', () => {
    const distance = ExpenseIntegrityService.calculateDistance(90, 0, -90, 0);
    expect(distance).toBeGreaterThan(20000000);
    expect(distance).toBeLessThan(20020000);
  });
});

// ─── checkLocationAnomaly ─────────────────────────────────────────────
describe('checkLocationAnomaly', () => {
  it('debe devolver isAnomaly=false si algún parámetro es null', () => {
    expect(ExpenseIntegrityService.checkLocationAnomaly(null, 0, 0, 0).isAnomaly).toBe(false);
    expect(ExpenseIntegrityService.checkLocationAnomaly(0, null, 0, 0).isAnomaly).toBe(false);
    expect(ExpenseIntegrityService.checkLocationAnomaly(0, 0, null, 0).isAnomaly).toBe(false);
    expect(ExpenseIntegrityService.checkLocationAnomaly(0, 0, 0, null).isAnomaly).toBe(false);
  });

  it('debe devolver distance=null si algún parámetro es null', () => {
    expect(ExpenseIntegrityService.checkLocationAnomaly(null, 0, 0, 0).distance).toBeNull();
  });

  it('debe NO marcar anomalía si distancia < 500m', () => {
    const result = ExpenseIntegrityService.checkLocationAnomaly(
      40.4168, -3.7038,
      40.4178, -3.7038  // ~111m
    );
    expect(result.isAnomaly).toBe(false);
    expect(result.distance).toBeLessThan(500);
  });

  it('debe marcar anomalía si distancia > 500m', () => {
    const result = ExpenseIntegrityService.checkLocationAnomaly(
      40.4168, -3.7038,   // Madrid
      41.3874, 2.1686     // Barcelona
    );
    expect(result.isAnomaly).toBe(true);
    expect(result.distance!).toBeGreaterThan(500);
  });
});
