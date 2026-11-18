/**
 * Tests — Adaptador Kyero (feed XML V3.9.1)
 *
 * Lo importante no es que el XML «parezca» Kyero: es que el documento generado
 * pase el XSD oficial (`kyeroV3.0.xsd`). Por eso la prueba principal construye
 * el feed completo y lo valida con libxmljs2, igual que hace el orquestador
 * antes de servir `/feeds/{token}`.
 */

import { describe, it, expect } from 'vitest';
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers';
import { kyeroAdapter, kyeroDate, imagenesValidas } from '@/lib/portals/adapters/kyero';
import type { DeliveryContext, MapContext } from '@/lib/portals/types';

const config = {
  defaults: { country: 'Spain', province: 'Málaga', town: 'Marbella' },
  publicBaseUrl: 'https://volkern.app',
} as const;

function inmueble(overrides: Partial<InmuebleParsed> = {}): InmuebleParsed {
  return {
    id: 'cm0000000000000000000001',
    tenantId: 'tenant-1',
    nombre: 'Villa de prueba',
    descripcion: 'Villa con vistas al mar',
    precioBase: 450000,
    moneda: 'EUR',
    activo: true,
    destacado: false,
    media: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-11-17T09:30:15Z'),
    operationType: 'venta',
    propertyType: 'Casa',
    areaM2: 200,
    builtM2: 180,
    bedrooms: 4,
    bathrooms: 3,
    parking: 1,
    address: null,
    city: 'Marbella',
    lat: 36.51,
    lng: -4.88,
    yearBuilt: 2010,
    hasElevator: false,
    hasParking: true,
    hasPool: true,
    hasGarden: true,
    hasStorageRoom: false,
    hasTerrace: true,
    hasBalcony: false,
    hasAirConditioning: true,
    hasHeating: false,
    furnished: false,
    orientation: null,
    energyCert: 'B',
    energyCertConsumption: null,
    energyCertEmission: null,
    energyCertBody: null,
    energyCertDate: null,
    energyCertExpiry: null,
    energyCertUrl: null,
    status: 'disponible',
    publicableEnPortales: true,
    featured: false,
    longDescription: null,
    seoTags: null,
    roomsDetail: null,
    bedsDetail: null,
    servicios: null,
    owner: { name: null, phone: null, email: null, contactId: null },
    ...overrides,
  };
}

const mapCtx: MapContext = {
  config,
  tenant: { id: 'tenant-1', name: 'Demo', email: null, phone: null },
  propertyUrlBase: 'https://volkern.app',
};

const deliveryCtx: DeliveryContext = {
  config,
  tenant: { id: 'tenant-1', name: 'Demo', email: null, phone: null },
  credentials: null,
  connectionId: 'conn-1',
  now: new Date('2026-11-17T10:00:00Z'),
};

describe('adaptador Kyero', () => {
  it('genera un feed que cumple el XSD oficial', async () => {
    const mapped = kyeroAdapter.mapProperty(inmueble(), mapCtx);
    expect(mapped).not.toBeNull();

    const xml = await kyeroAdapter.buildDocument([mapped!], deliveryCtx);
    expect(xml).toContain('<feed_version>3</feed_version>');
    expect(xml).toContain('<province>Málaga</province>');
    expect(xml).toContain('<price_freq>sale</price_freq>');
    expect(xml).toContain('<feature>private pool</feature>');
  });

  it('valida el payload mapeado y rechaza URLs de imagen no admitidas', () => {
    const mapped = kyeroAdapter.mapProperty(inmueble(), mapCtx)!;
    expect(kyeroAdapter.validatePayload(mapped.payload).valid).toBe(true);

    const roto = {
      ...mapped.payload,
      images: ['https://images.unsplash.com/photo-123?w=800'],
    };
    const resultado = kyeroAdapter.validatePayload(roto);
    expect(resultado.valid).toBe(false);
    expect(resultado.errors.join(' ')).toContain('images');
  });

  it('no sirve un feed vacío (el XSD exige al menos un inmueble)', async () => {
    await expect(kyeroAdapter.buildDocument([], deliveryCtx)).rejects.toThrow(/al menos uno/i);
  });

  it('omite monedas y operaciones que Kyero no admite', () => {
    expect(() => kyeroAdapter.mapProperty(inmueble({ moneda: 'MXN' }), mapCtx)).toThrow(/Moneda/);
    expect(() =>
      kyeroAdapter.mapProperty(inmueble({ operationType: 'alquiler_temporada' }), mapCtx)
    ).toThrow(/Operación/);
  });

  it('descarta imágenes que no puede procesar y normaliza las locales', () => {
    const urls = imagenesValidas(
      [
        { url: '/uploads/foto1.jpg' },
        { url: 'https://images.unsplash.com/photo-1?w=800' },
        { url: 'https://cdn.example.com/foto2.PNG' },
      ],
      'https://volkern.app'
    );
    expect(urls).toEqual(['https://volkern.app/uploads/foto1.jpg', 'https://cdn.example.com/foto2.PNG']);
  });

  it('formatea la fecha como exige Kyero', () => {
    expect(kyeroDate(new Date('2026-11-17T09:30:15Z'))).toBe('2026-11-17 09:30:15');
  });
});
