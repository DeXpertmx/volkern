import { describe, it, expect, vi } from 'vitest';

import {
  normalizarNominatim,
  buscarDireccion,
  GEOCODER_USER_AGENT,
} from '@/lib/hospitality/geocoding';

const BRUTO_OK = {
  display_name: 'Calle General Castaños 40, 11201 Algeciras, Spain',
  lat: '36.1402100',
  lon: '-5.4537800',
  address: {
    road: 'Calle General Castaños',
    house_number: '40',
    postcode: '11201',
    city: 'Algeciras',
    state: 'Andalusia',
    country: 'Spain',
  },
};

describe('Hospitality — geocoding (Nominatim)', () => {
  it('normaliza la fila cruda a resultados con partes de la dirección', () => {
    const [r] = normalizarNominatim([BRUTO_OK]);
    expect(r).toBeDefined();
    expect(r!.latitud).toBeCloseTo(36.14021);
    expect(r!.longitud).toBeCloseTo(-5.45378);
    expect(r!.direccion).toBe('Calle General Castaños 40');
    expect(r!.ciudad).toBe('Algeciras');
    expect(r!.estadoProvincia).toBe('Andalusia');
    expect(r!.pais).toBe('Spain');
    expect(r!.cp).toBe('11201');
    expect(r!.etiqueta).toContain('Calle General Castaños');
  });

  it('descarta filas sin coordenadas válidas o fuera de rango', () => {
    const salida = normalizarNominatim([
      { display_name: 'sin coords' },
      { lat: '999', lon: '0' },
      { lat: 'no', lon: 'no' },
      null,
      BRUTO_OK,
    ]);
    expect(salida).toHaveLength(1);
    expect(salida[0]!.ciudad).toBe('Algeciras');
  });

  it('máximo 5 resultados y entrada no-array devuelve lista vacía', () => {
    const muchos = Array.from({ length: 9 }, (_, i) => ({ ...BRUTO_OK, lat: String(10 + i) }));
    expect(normalizarNominatim(muchos)).toHaveLength(5);
    expect(normalizarNominatim(null)).toEqual([]);
    expect(normalizarNominatim('pepe')).toEqual([]);
  });

  it('ciudad con fallback a town/village y vía sin número', () => {
    const [r] = normalizarNominatim([
      {
        display_name: 'Benaocaz',
        lat: '36.67',
        lon: '-5.35',
        address: { road: 'Camino', town: 'Benaocaz' },
      },
    ]);
    expect(r!.ciudad).toBe('Benaocaz');
    expect(r!.direccion).toBe('Camino');
    expect(r!.cp).toBeNull();
  });

  it('buscarDireccion arma la URL de Nominatim con User-Agent y normaliza', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([BRUTO_OK]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const salida = await buscarDireccion('Calle General Castaños 40 Algeciras');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://nominatim.openstreetmap.org/search');
    expect(String(url)).toContain('addressdetails=1');
    expect(String(url)).toContain('limit=5');
    // URLSearchParams codifica los espacios como '+', no como %20.
    expect(String(url)).toContain(encodeURI('Calle General Castaños 40 Algeciras').replaceAll('%20', '+'));
    expect(init.headers['User-Agent']).toBe(GEOCODER_USER_AGENT);
    expect(salida).toHaveLength(1);
  });

  it('lanza con mensaje claro si el geocoder no responde 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('cuelgue', { status: 503 }))
    );
    await expect(buscarDireccion('Calle Inventada 123')).rejects.toThrow('503');
  });
});
