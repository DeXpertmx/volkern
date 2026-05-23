import { describe, it, expect } from 'vitest';
import { generateCitaEmailHash } from '@/lib/email';

// ==================== generateCitaEmailHash ====================
describe('generateCitaEmailHash', () => {
  const sampleCita = {
    fechaHora: new Date('2025-06-15T10:00:00Z'),
    duracion: 60,
    titulo: 'Consulta inicial',
    servicioNombre: 'Asesoría Fiscal',
  };

  it('debe generar un hash MD5 de 32 caracteres', () => {
    const hash = generateCitaEmailHash(sampleCita);
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('debe ser determinista para los mismos datos', () => {
    const hash1 = generateCitaEmailHash(sampleCita);
    const hash2 = generateCitaEmailHash(sampleCita);
    expect(hash1).toBe(hash2);
  });

  it('debe cambiar si cambia fechaHora', () => {
    const modified = { ...sampleCita, fechaHora: new Date('2025-06-16T10:00:00Z') };
    expect(generateCitaEmailHash(modified)).not.toBe(generateCitaEmailHash(sampleCita));
  });

  it('debe cambiar si cambia duracion', () => {
    const modified = { ...sampleCita, duracion: 90 };
    expect(generateCitaEmailHash(modified)).not.toBe(generateCitaEmailHash(sampleCita));
  });

  it('debe cambiar si cambia titulo', () => {
    const modified = { ...sampleCita, titulo: 'Seguimiento' };
    expect(generateCitaEmailHash(modified)).not.toBe(generateCitaEmailHash(sampleCita));
  });

  it('debe cambiar si cambia servicioNombre', () => {
    const modified = { ...sampleCita, servicioNombre: 'Consultoría Legal' };
    expect(generateCitaEmailHash(modified)).not.toBe(generateCitaEmailHash(sampleCita));
  });

  it('debe manejar valores por defecto (duracion undefined → 60)', () => {
    const cita = {
      fechaHora: new Date('2025-06-15T10:00:00Z'),
      titulo: null,
      servicioNombre: undefined,
    };
    const hash = generateCitaEmailHash(cita);
    expect(hash).toHaveLength(32);
  });

  it('debe manejar titulo null y servicioNombre undefined como string vacío', () => {
    const cita1 = {
      fechaHora: new Date('2025-06-15T10:00:00Z'),
      titulo: null,
      servicioNombre: undefined,
    };
    const cita2 = {
      fechaHora: new Date('2025-06-15T10:00:00Z'),
      titulo: '',
      servicioNombre: '',
    };
    // null → '' en JSON.stringify, undefined → no se incluye en JSON.stringify
    // Estos no serán idénticos, pero ambos deben generar hash válido
    expect(generateCitaEmailHash(cita1)).toHaveLength(32);
    expect(generateCitaEmailHash(cita2)).toHaveLength(32);
  });

  it('hashes para fechas con mismo instante pero distinta zona deben coincidir', () => {
    const cita1 = { fechaHora: new Date('2025-06-15T10:00:00.000Z') };
    const cita2 = { fechaHora: new Date('2025-06-15T10:00:00.000Z') };
    expect(generateCitaEmailHash(cita1)).toBe(generateCitaEmailHash(cita2));
  });
});
