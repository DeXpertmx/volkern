import { describe, expect, it } from 'vitest';
import { datosCambioEstado, esEstadoDeBaja } from '@/lib/tenant-estado';

describe('esEstadoDeBaja', () => {
  it('reconoce los estados que cuentan como baja', () => {
    expect(esEstadoDeBaja('suspendido')).toBe(true);
    expect(esEstadoDeBaja('cancelado')).toBe(true);
    expect(esEstadoDeBaja('inactivo')).toBe(true);
    expect(esEstadoDeBaja('archived')).toBe(true);
  });

  it('no considera baja los estados vivos', () => {
    expect(esEstadoDeBaja('activo')).toBe(false);
    expect(esEstadoDeBaja('trial')).toBe(false);
    expect(esEstadoDeBaja(null)).toBe(false);
  });
});

describe('datosCambioEstado', () => {
  it('sella la fecha al entrar en baja', () => {
    const cambio = datosCambioEstado('suspendido');
    expect(cambio.estado).toBe('suspendido');
    expect(cambio.fechaBaja).toBeInstanceOf(Date);
  });

  it('conserva la primera fecha de baja (un reintento no la mueve de periodo)', () => {
    const primera = new Date('2026-06-01T10:00:00Z');
    const cambio = datosCambioEstado('suspendido', primera);
    expect(cambio.fechaBaja).toBe(primera);
  });

  it('limpia la fecha al reactivar la cuenta', () => {
    const primera = new Date('2026-06-01T10:00:00Z');
    expect(datosCambioEstado('activo', primera).fechaBaja).toBeNull();
    expect(datosCambioEstado('trial', primera).fechaBaja).toBeNull();
  });
});
