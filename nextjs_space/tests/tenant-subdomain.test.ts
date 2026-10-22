import { describe, it, expect } from 'vitest';
import { normalizarSubdominio, SUBDOMINIOS_RESERVADOS } from '@/lib/tenant-subdomain';

describe('normalizarSubdominio', () => {
  it('recorta y pasa a minúsculas un subdominio válido', () => {
    expect(normalizarSubdominio('  Mi-Hotel  ')).toEqual({ ok: true, subdominio: 'mi-hotel' });
  });

  it('acepta el caso real de un tenant sin subdominio al que se le asigna uno', () => {
    expect(normalizarSubdominio('jose-antonio-moreno-fernandez')).toEqual({
      ok: true,
      subdominio: 'jose-antonio-moreno-fernandez',
    });
  });

  it('vacío, null y undefined significan quitarlo', () => {
    expect(normalizarSubdominio('')).toEqual({ ok: true, subdominio: null });
    expect(normalizarSubdominio('   ')).toEqual({ ok: true, subdominio: null });
    expect(normalizarSubdominio(null)).toEqual({ ok: true, subdominio: null });
    expect(normalizarSubdominio(undefined)).toEqual({ ok: true, subdominio: null });
  });

  it('rechaza tipos que no son texto en vez de borrar en silencio', () => {
    const r = normalizarSubdominio(42);
    expect(r.ok).toBe(false);
  });

  it('rechaza guiones al principio o al final', () => {
    expect(normalizarSubdominio('-hotel').ok).toBe(false);
    expect(normalizarSubdominio('hotel-').ok).toBe(false);
  });

  it('rechaza puntos, barras y mayúsculas transformadas en basura', () => {
    expect(normalizarSubdominio('hotel.volkern.app').ok).toBe(false);
    expect(normalizarSubdominio('hotel/reservas').ok).toBe(false);
    expect(normalizarSubdominio('hotel_1').ok).toBe(false);
  });

  it('rechaza longitudes fuera de 3–40', () => {
    expect(normalizarSubdominio('ab').ok).toBe(false);
    expect(normalizarSubdominio('a'.repeat(41)).ok).toBe(false);
    expect(normalizarSubdominio('a'.repeat(40)).ok).toBe(true);
  });

  it('rechaza los nombres reservados de la plataforma', () => {
    for (const reservado of SUBDOMINIOS_RESERVADOS) {
      expect(normalizarSubdominio(reservado).ok).toBe(false);
    }
  });
});
