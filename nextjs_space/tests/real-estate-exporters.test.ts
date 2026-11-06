/**
 * Tests Unitarios — Exportadores a portales (Idealista XML / Fotocasa CSV)
 *
 * Comprueba que la clase energética sale en el formato que espera cada portal:
 * bloque `energyCertification` con estado y calificaciones en Idealista, y la
 * columna de certificado con letra o «En trámite» en el CSV de Fotocasa.
 */

import { describe, it, expect } from 'vitest';
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers';
import { generateIdealistaFeed } from '@/lib/real-estate/exporters/xml-exporter';
import { generateFotocasaCSV } from '@/lib/real-estate/exporters/csv-exporter';

const opciones = { tenantName: 'Demo Real Estate', tenantEmail: 'demo@example.com' };

function inmueble(overrides: Partial<InmuebleParsed>): InmuebleParsed {
  return {
    id: 'inm-1',
    nombre: 'Casa de prueba',
    descripcion: 'Inmueble de prueba',
    precioBase: 100000,
    moneda: 'MXN',
    operationType: 'venta',
    propertyType: 'Casa',
    areaM2: 100,
    media: [],
    status: 'disponible',
    featured: false,
    energyCert: null,
    energyCertConsumption: null,
    energyCertEmission: null,
    energyCertBody: null,
    energyCertDate: null,
    energyCertExpiry: null,
    energyCertUrl: null,
    owner: {},
    ...overrides,
  } as unknown as InmuebleParsed;
}

/** Devuelve la primera fila de datos del CSV como mapa columna → valor */
function filaCSV(csv: string): Record<string, string> {
  const [cabecera, fila] = csv.replace(/^\uFEFF/, '').split('\r\n');
  const columnas = cabecera.split(';');
  const valores = fila.split(';');
  return Object.fromEntries(columnas.map((columna, i) => [columna, valores[i] ?? '']));
}

describe('feeds a portales — certificación energética', () => {
  it('Idealista recibe el certificado como estado + consumo + emisiones', () => {
    const xml = generateIdealistaFeed(
      [inmueble({ energyCert: ' B ', energyCertConsumption: 28.4, energyCertEmission: 5.7 })],
      opciones
    );

    expect(xml).toContain('<energyCertification>');
    expect(xml).toContain('<type>certificate</type>');
    expect(xml).toContain('<rating>B</rating>');
    expect(xml).toContain('<value>28.4</value>');
    expect(xml).toContain('<unit>kWh/m2 year</unit>');
    expect(xml).toContain('<value>5.7</value>');
    expect(xml).toContain('<unit>kg CO2/m2 year</unit>');
  });

  it('Idealista marca el certificado en trámite con su estado, no con texto libre', () => {
    const xml = generateIdealistaFeed([inmueble({ energyCert: 'En trámite' })], opciones);

    expect(xml).toContain('<type>inProcess</type>');
    expect(xml).not.toContain('<rating>');
    expect(xml).not.toContain('En trámite');
  });

  it('Idealista omite el bloque cuando el inmueble no tiene certificado', () => {
    const xml = generateIdealistaFeed([inmueble({})], opciones);

    expect(xml).not.toContain('energyCertification');
  });

  it('Fotocasa recibe la letra junto a sus valores, en columnas propias', () => {
    const fila = filaCSV(
      generateFotocasaCSV([
        inmueble({ energyCert: 'b', energyCertConsumption: 28.4, energyCertEmission: 5.7 }),
      ])
    );

    expect(fila.CertificacionEnergetica).toBe('B');
    expect(fila.ConsumoEnergetico).toBe('28.4');
    expect(fila.EmisionesCO2).toBe('5.7');
    expect(fila.OrganismoCertificador).toBe('');
  });

  it('Fotocasa exporta «En trámite» sin valores, y vacío si no hay certificado', () => {
    const enTramite = filaCSV(
      generateFotocasaCSV([inmueble({ energyCert: 'EN TRAMITE', energyCertConsumption: 10 })])
    );
    expect(enTramite.CertificacionEnergetica).toBe('En trámite');
    expect(enTramite.ConsumoEnergetico).toBe('');

    const sinCertificado = filaCSV(generateFotocasaCSV([inmueble({})]));
    expect(sinCertificado.CertificacionEnergetica).toBe('');
  });

  it('Fotocasa emite todas las columnas de la cabecera en cada fila', () => {
    const csv = generateFotocasaCSV([inmueble({ energyCert: 'A' })]);
    const [cabecera, fila] = csv.replace(/^\uFEFF/, '').split('\r\n');

    expect(cabecera.split(';')).toHaveLength(35);
    expect(fila.split(';')).toHaveLength(35);
  });
});
