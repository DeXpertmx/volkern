import { describe, it, expect } from 'vitest';
import { haversineKm, interpolate, calcProgress, AVG_TRUCK_SPEED_KMH } from '@/lib/geo';

describe('AVG_TRUCK_SPEED_KMH', () => {
  it('debe ser 60 km/h', () => {
    expect(AVG_TRUCK_SPEED_KMH).toBe(60);
  });
});

describe('haversineKm', () => {
  it('debe retornar 0 para el mismo punto', () => {
    const d = haversineKm(40.4168, -3.7038, 40.4168, -3.7038);
    expect(d).toBe(0);
  });

  it('debe calcular distancia Málaga → Madrid (~414 km)', () => {
    const d = haversineKm(36.7213, -4.4214, 40.4168, -3.7038);
    // Distancia real ~414 km, tolerancia 5%
    expect(d).toBeGreaterThan(390);
    expect(d).toBeLessThan(440);
  });

  it('debe calcular distancia Málaga → Barcelona (~759 km)', () => {
    const d = haversineKm(36.7213, -4.4214, 41.3874, 2.1686);
    expect(d).toBeGreaterThan(720);
    expect(d).toBeLessThan(800);
  });

  it('debe calcular distancia Zaragoza → Sevilla (~644 km)', () => {
    const d = haversineKm(41.6488, -0.8891, 37.3891, -5.9845);
    expect(d).toBeGreaterThan(620);
    expect(d).toBeLessThan(670);
  });

  it('debe ser simétrica (A→B == B→A)', () => {
    const ab = haversineKm(36.7213, -4.4214, 40.4168, -3.7038);
    const ba = haversineKm(40.4168, -3.7038, 36.7213, -4.4214);
    expect(ab).toBeCloseTo(ba, 5);
  });

  it('debe manejar coordenadas negativas (hemisferio sur, oeste)', () => {
    // Buenos Aires (-34.6037, -58.3816) → Montevideo (-34.9033, -56.1899) ~195km
    const d = haversineKm(-34.6037, -58.3816, -34.9033, -56.1899);
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(210);
  });

  it('debe funcionar con el meridiano de Greenwich (lng=0)', () => {
    const d = haversineKm(51.5074, 0, 48.8566, 2.3522); // London → Paris ~344km
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });
});

describe('interpolate', () => {
  const malaga: [number, number] = [36.7213, -4.4214];
  const madrid: [number, number] = [40.4168, -3.7038];

  it('debe retornar origen con progress=0', () => {
    const [lat, lng] = interpolate(malaga, madrid, 0);
    expect(lat).toBeCloseTo(malaga[0], 4);
    expect(lng).toBeCloseTo(malaga[1], 4);
  });

  it('debe retornar destino con progress=1', () => {
    const [lat, lng] = interpolate(malaga, madrid, 1);
    expect(lat).toBeCloseTo(madrid[0], 4);
    expect(lng).toBeCloseTo(madrid[1], 4);
  });

  it('debe retornar el punto medio con progress=0.5', () => {
    const [lat, lng] = interpolate(malaga, madrid, 0.5);
    const midLat = (malaga[0] + madrid[0]) / 2;
    const midLng = (malaga[1] + madrid[1]) / 2;
    expect(lat).toBeCloseTo(midLat, 4);
    expect(lng).toBeCloseTo(midLng, 4);
  });

  it('debe interpolar correctamente con progress=0.25', () => {
    const [lat, lng] = interpolate(malaga, madrid, 0.25);
    const expectedLat = malaga[0] + (madrid[0] - malaga[0]) * 0.25;
    const expectedLng = malaga[1] + (madrid[1] - malaga[1]) * 0.25;
    expect(lat).toBeCloseTo(expectedLat, 4);
    expect(lng).toBeCloseTo(expectedLng, 4);
  });

  it('debe funcionar con progress > 1 (extrapolación)', () => {
    const [lat, lng] = interpolate(malaga, madrid, 1.5);
    expect(lat).toBeGreaterThan(madrid[0]);
    expect(lng).toBeCloseTo(malaga[1] + (madrid[1] - malaga[1]) * 1.5, 4);
  });

  it('debe funcionar con progress negativo', () => {
    const [lat, lng] = interpolate(malaga, madrid, -0.5);
    expect(lat).toBeLessThan(malaga[0]);
  });

  it('debe ser determinista', () => {
    const r1 = interpolate(malaga, madrid, 0.3);
    const r2 = interpolate(malaga, madrid, 0.3);
    expect(r1).toEqual(r2);
  });
});

describe('calcProgress', () => {
  const malaga: [number, number] = [36.7213, -4.4214];
  const madrid: [number, number] = [40.4168, -3.7038];
  const barcelona: [number, number] = [41.3874, 2.1686];

  it('debe retornar 0 cuando está en el origen', () => {
    const p = calcProgress(malaga, madrid, malaga);
    expect(p).toBe(0);
  });

  it('debe retornar 1 cuando está en el destino', () => {
    const p = calcProgress(malaga, madrid, madrid);
    expect(p).toBe(1);
  });

  it('debe retornar ~0.5 cuando está a medio camino', () => {
    const midpoint: [number, number] = [
      (malaga[0] + madrid[0]) / 2,
      (malaga[1] + madrid[1]) / 2,
    ];
    const p = calcProgress(malaga, madrid, midpoint);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });

  it('debe retornar 1 si origen y destino son el mismo punto', () => {
    const p = calcProgress(malaga, malaga, [37.0, -4.0]);
    expect(p).toBe(1);
  });

  it('debe manejar trayectos largos', () => {
    // Málaga → Barcelona: posición en Valencia (~50% del trayecto)
    const valencia: [number, number] = [39.4699, -0.3763];
    const p = calcProgress(malaga, barcelona, valencia);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.7);
  });

  it('debe retornar 1 si el punto actual está más allá del destino', () => {
    // Punto al norte de Madrid (más allá del destino)
    const northOfMadrid: [number, number] = [42.0, -3.7];
    const p = calcProgress(malaga, madrid, northOfMadrid);
    expect(p).toBe(1);
  });
});
