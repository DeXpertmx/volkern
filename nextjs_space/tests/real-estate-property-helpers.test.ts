/**
 * Tests Unitarios — Real Estate Property Helpers
 *
 * Verifica parseInmueble, buildCustomFieldValues, getPropertyStats
 * y getProperties con mocks de Prisma.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    catalogoItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db';
import {
  parseInmueble,
  buildCustomFieldValues,
  getPropertyStats,
  getProperties,
} from '@/lib/real-estate/property-helpers';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockCatalogoItem = {
  id: 'inm-1',
  tenantId: 'tenant-1',
  nombre: 'Ático de lujo en el centro',
  descripcion: 'Precioso ático con vistas espectaculares',
  precioBase: 350000,
  moneda: 'EUR',
  activo: true,
  destacado: true,
  tipo: 'inmueble',
  media: [{ url: 'https://cdn.example.com/img1.jpg', tipo: 'imagen' }],
  customFieldValues: {
    tipo_operacion: 'venta',
    tipo_inmueble: 'Departamento',
    superficie_total: '120',
    superficie_construida: '140',
    habitaciones: '3',
    banos: '2',
    estacionamientos: '1',
    direccion: 'Calle Mayor 15',
    zona: 'Madrid Centro',
    latitud: '40.4168',
    longitud: '-3.7038',
    antiguedad: '2018',
    ascensor: true,
    estacionamiento: true,
    alberca: false,
    jardin: false,
    trastero: true,
    amueblado: true,
    orientacion: 'sur',
    certificacion_energetica: 'A',
    estado: 'disponible',
    destacada: true,
    descripcion_larga: 'Ático de lujo con terraza de 40m²...',
    tags_seo: 'atico,lujo,centro,madrid',
  },
  fechaCreacion: new Date('2026-01-15'),
  fechaActualizacion: new Date('2026-05-20'),
};

// ─── parseInmueble ─────────────────────────────────────────────────────────

describe('parseInmueble', () => {
  it('debe extraer correctamente todos los campos inmobiliarios', () => {
    const result = parseInmueble(mockCatalogoItem as any);

    expect(result.id).toBe('inm-1');
    expect(result.nombre).toBe('Ático de lujo en el centro');
    expect(result.precioBase).toBe(350000);
    expect(result.moneda).toBe('EUR');

    // Campos inmobiliarios
    expect(result.operationType).toBe('venta');
    expect(result.propertyType).toBe('Departamento');
    expect(result.areaM2).toBe(120);
    expect(result.builtM2).toBe(140);
    expect(result.bedrooms).toBe(3);
    expect(result.bathrooms).toBe(2);
    expect(result.parking).toBe(1);
    expect(result.address).toBe('Calle Mayor 15');
    expect(result.city).toBe('Madrid Centro');
    expect(result.lat).toBe(40.4168);
    expect(result.lng).toBe(-3.7038);
    expect(result.yearBuilt).toBe(2018);
    expect(result.hasElevator).toBe(true);
    expect(result.hasParking).toBe(true);
    expect(result.hasPool).toBe(false);
    expect(result.hasGarden).toBe(false);
    expect(result.hasStorageRoom).toBe(true);
    expect(result.furnished).toBe(true);
    expect(result.orientation).toBe('sur');
    expect(result.energyCert).toBe('A');
    expect(result.status).toBe('disponible');
    expect(result.featured).toBe(true);
    expect(result.longDescription).toBe('Ático de lujo con terraza de 40m²...');
    expect(result.seoTags).toBe('atico,lujo,centro,madrid');
  });

  it('debe manejar customFieldValues nulos', () => {
    const item = {
      ...mockCatalogoItem,
      customFieldValues: null,
    };

    const result = parseInmueble(item as any);

    expect(result.operationType).toBeNull();
    expect(result.propertyType).toBeNull();
    expect(result.areaM2).toBeNull();
    expect(result.bedrooms).toBeNull();
    expect(result.city).toBeNull();
    expect(result.hasElevator).toBe(false);
    expect(result.status).toBe('disponible'); // default
    expect(result.featured).toBe(false);
  });

  it('debe manejar customFieldValues vacío', () => {
    const item = {
      ...mockCatalogoItem,
      customFieldValues: {},
    };

    const result = parseInmueble(item as any);

    expect(result.operationType).toBeNull();
    expect(result.areaM2).toBeNull();
    expect(result.hasPool).toBe(false);
    expect(result.status).toBe('disponible');
  });

  it('debe parsear números correctamente desde strings', () => {
    const item = {
      ...mockCatalogoItem,
      customFieldValues: {
        superficie_total: '85.5',
        habitaciones: '2',
        banos: '1',
        latitud: '41.3851',
      },
    };

    const result = parseInmueble(item as any);

    expect(result.areaM2).toBe(85.5);
    expect(result.bedrooms).toBe(2);
    expect(result.bathrooms).toBe(1);
    expect(result.lat).toBe(41.3851);
  });
});

// ─── buildCustomFieldValues ────────────────────────────────────────────────

describe('buildCustomFieldValues', () => {
  it('debe construir objeto con todos los campos', () => {
    const result = buildCustomFieldValues({
      operationType: 'alquiler',
      propertyType: 'Casa',
      areaM2: 200,
      bedrooms: 4,
      bathrooms: 3,
      city: 'Barcelona',
      hasPool: true,
      hasGarden: true,
      status: 'disponible',
    } as any);

    expect(result.tipo_operacion).toBe('alquiler');
    expect(result.tipo_inmueble).toBe('Casa');
    expect(result.superficie_total).toBe(200);
    expect(result.habitaciones).toBe(4);
    expect(result.banos).toBe(3);
    expect(result.zona).toBe('Barcelona');
    expect(result.alberca).toBe(true);
    expect(result.jardin).toBe(true);
    expect(result.estado).toBe('disponible');
  });

  it('debe omitir campos no definidos', () => {
    const result = buildCustomFieldValues({
      operationType: 'venta',
      city: 'Valencia',
    } as any);

    expect(result.tipo_operacion).toBe('venta');
    expect(result.zona).toBe('Valencia');
    expect(result.superficie_total).toBeUndefined();
    expect(result.habitaciones).toBeUndefined();
    expect(result.ascensor).toBeUndefined();
  });

  it('debe incluir booleanos solo si son true', () => {
    const result = buildCustomFieldValues({
      hasPool: true,
      hasParking: true,
      hasElevator: true,
      hasGarden: false,
    } as any);

    expect(result.alberca).toBe(true);
    expect(result.estacionamiento).toBe(true);
    expect(result.ascensor).toBe(true);
    // false no debe incluirse
    expect(result.jardin).toBeUndefined();
  });

  // ── Owner fields ────────────────────────────────────────────────────────

  it('debe serializar todos los campos del propietario cuando se proporcionan', () => {
    const result = buildCustomFieldValues({
      operationType: 'venta',
      city: 'Madrid',
      owner: {
        name: 'Juan Pérez López',
        phone: '+34 612 345 678',
        email: 'juan@example.com',
        contactId: 'contact-123',
      },
    } as any);

    expect(result.propietario_nombre).toBe('Juan Pérez López');
    expect(result.propietario_telefono).toBe('+34 612 345 678');
    expect(result.propietario_email).toBe('juan@example.com');
    expect(result.propietario_contact_id).toBe('contact-123');
    // Los demás campos deben seguir presentes
    expect(result.tipo_operacion).toBe('venta');
    expect(result.zona).toBe('Madrid');
  });

  it('debe serializar solo el nombre si es el único campo del propietario', () => {
    const result = buildCustomFieldValues({
      owner: { name: 'María García', phone: null, email: null, contactId: null },
    } as any);

    expect(result.propietario_nombre).toBe('María García');
    expect(result.propietario_telefono).toBeUndefined();
    expect(result.propietario_email).toBeUndefined();
    expect(result.propietario_contact_id).toBeUndefined();
  });

  it('debe serializar solo teléfono si es el único campo del propietario', () => {
    const result = buildCustomFieldValues({
      owner: { name: null, phone: '+34 600 000 000', email: null, contactId: null },
    } as any);

    expect(result.propietario_nombre).toBeUndefined();
    expect(result.propietario_telefono).toBe('+34 600 000 000');
    expect(result.propietario_email).toBeUndefined();
    expect(result.propietario_contact_id).toBeUndefined();
  });

  it('debe serializar solo contactId si es el único campo del propietario', () => {
    const result = buildCustomFieldValues({
      owner: { name: null, phone: null, email: null, contactId: 'contact-456' },
    } as any);

    expect(result.propietario_nombre).toBeUndefined();
    expect(result.propietario_telefono).toBeUndefined();
    expect(result.propietario_email).toBeUndefined();
    expect(result.propietario_contact_id).toBe('contact-456');
  });

  it('debe omitir campos del propietario si todos son nulos', () => {
    const result = buildCustomFieldValues({
      owner: { name: null, phone: null, email: null, contactId: null },
    } as any);

    expect(result.propietario_nombre).toBeUndefined();
    expect(result.propietario_telefono).toBeUndefined();
    expect(result.propietario_email).toBeUndefined();
    expect(result.propietario_contact_id).toBeUndefined();
  });

  it('debe omitir owner si no se proporciona el objeto owner', () => {
    const result = buildCustomFieldValues({
      operationType: 'alquiler',
    } as any);

    expect(result.propietario_nombre).toBeUndefined();
    expect(result.propietario_telefono).toBeUndefined();
    expect(result.propietario_email).toBeUndefined();
    expect(result.propietario_contact_id).toBeUndefined();
    // Otros campos deben seguir ahí
    expect(result.tipo_operacion).toBe('alquiler');
  });

  it('debe omitir owner si el objeto owner está vacío', () => {
    const result = buildCustomFieldValues({
      owner: {} as any,
    } as any);

    expect(result.propietario_nombre).toBeUndefined();
    expect(result.propietario_telefono).toBeUndefined();
    expect(result.propietario_email).toBeUndefined();
    expect(result.propietario_contact_id).toBeUndefined();
  });

  it('debe serializar owner junto con campos booleanos correctamente', () => {
    const result = buildCustomFieldValues({
      operationType: 'venta',
      areaM2: 150,
      hasPool: true,
      hasParking: true,
      owner: {
        name: 'Carlos Ruiz',
        phone: '+34 655 123 456',
        email: 'carlos@example.com',
        contactId: 'contact-789',
      },
    } as any);

    // Campos regulares
    expect(result.tipo_operacion).toBe('venta');
    expect(result.superficie_total).toBe(150);
    expect(result.alberca).toBe(true);
    expect(result.estacionamiento).toBe(true);

    // Campos del propietario
    expect(result.propietario_nombre).toBe('Carlos Ruiz');
    expect(result.propietario_telefono).toBe('+34 655 123 456');
    expect(result.propietario_email).toBe('carlos@example.com');
    expect(result.propietario_contact_id).toBe('contact-789');
  });
});

// ─── getPropertyStats ──────────────────────────────────────────────────────

describe('getPropertyStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe retornar estadísticas correctas desde findMany + JS aggregation', async () => {
    const mockItems = [
      { precioBase: 350000, destacado: true, customFieldValues: { estado: 'disponible', superficie_total: '120', tipo_operacion: 'venta' } },
      { precioBase: 250000, destacado: false, customFieldValues: { estado: 'disponible', superficie_total: '90', tipo_operacion: 'venta' } },
      { precioBase: 500000, destacado: true, customFieldValues: { estado: 'vendida', superficie_total: '200', tipo_operacion: 'venta' } },
      { precioBase: 180000, destacado: false, customFieldValues: { estado: 'alquilada', superficie_total: '80', tipo_operacion: 'alquiler' } },
      { precioBase: 300000, destacado: false, customFieldValues: { estado: 'reservada', superficie_total: '100', tipo_operacion: 'venta' } },
      { precioBase: 150000, destacado: false, customFieldValues: { estado: null, superficie_total: '60', tipo_operacion: 'venta' } },
    ];
    (prisma.catalogoItem.findMany as any).mockResolvedValue(mockItems);

    const stats = await getPropertyStats('tenant-1');

    expect(stats.total).toBe(6);
    expect(stats.available).toBe(3);  // 2 'disponible' + 1 null → 3
    expect(stats.reserved).toBe(1);
    expect(stats.sold).toBe(1);
    expect(stats.rented).toBe(1);
    expect(stats.featured).toBe(2);
    expect(stats.avgPrice).toBeCloseTo(288333.33, 0);
    expect(stats.avgPricePerM2).toBeCloseTo(2657.41, 0);
  });

  it('debe retornar ceros cuando no hay propiedades', async () => {
    (prisma.catalogoItem.findMany as any).mockResolvedValue([]);

    const stats = await getPropertyStats('tenant-1');

    expect(stats.total).toBe(0);
    expect(stats.available).toBe(0);
    expect(stats.reserved).toBe(0);
    expect(stats.sold).toBe(0);
    expect(stats.rented).toBe(0);
    expect(stats.featured).toBe(0);
    expect(stats.avgPrice).toBe(0);
    expect(stats.avgPricePerM2).toBe(0);
  });
});

// ─── getProperties ─────────────────────────────────────────────────────────

describe('getProperties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe retornar propiedades con filtros básicos', async () => {
    (prisma.catalogoItem.findMany as any).mockResolvedValue([mockCatalogoItem]);

    const result = await getProperties('tenant-1', {
      operationType: 'venta',
      limit: 10,
    });

    expect(result.total).toBe(1);
    expect(result.properties).toHaveLength(1);
    expect(result.properties[0].operationType).toBe('venta');
    expect(result.properties[0].nombre).toBe('Ático de lujo en el centro');
  });

  it('debe incluir tenantId y tipo en la query', async () => {
    (prisma.catalogoItem.findMany as any).mockResolvedValue([]);

    await getProperties('tenant-1');

    const calls = (prisma.catalogoItem.findMany as any).mock.calls;
    expect(calls[0][0].where.tenantId).toBe('tenant-1');
    expect(calls[0][0].where.tipo).toBe('inmueble');
    expect(calls[0][0].where.activo).toBe(true);
  });

  it('debe aplicar filtro de precio máximo', async () => {
    const items = [
      { ...mockCatalogoItem, precioBase: 500000 },
      { ...mockCatalogoItem, id: 'inm-2', precioBase: 200000 },
      { ...mockCatalogoItem, id: 'inm-3', precioBase: 100000 },
    ];
    (prisma.catalogoItem.findMany as any).mockResolvedValue(items);

    const result = await getProperties('tenant-1', { maxPrice: 300000 });

    expect(result.total).toBe(2); // 200000 and 100000
    expect(result.properties).toHaveLength(2);
  });

  it('debe aplicar filtro de ciudad con case-insensitive', async () => {
    const items = [
      { ...mockCatalogoItem, customFieldValues: { ...mockCatalogoItem.customFieldValues, zona: 'Madrid Centro' } },
      { ...mockCatalogoItem, id: 'inm-2', customFieldValues: { ...mockCatalogoItem.customFieldValues, zona: 'Barcelona Gracia' } },
    ];
    (prisma.catalogoItem.findMany as any).mockResolvedValue(items);

    const result = await getProperties('tenant-1', { city: 'madrid' });

    expect(result.total).toBe(1);
    expect(result.properties[0].city).toBe('Madrid Centro');
  });

  it('debe retornar array vacío cuando no hay resultados', async () => {
    (prisma.catalogoItem.findMany as any).mockResolvedValue([]);

    const result = await getProperties('tenant-1', { operationType: 'alquiler' });

    expect(result.total).toBe(0);
    expect(result.properties).toEqual([]);
  });

  it('debe aplicar paginación correctamente', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...mockCatalogoItem,
      id: `inm-${i}`,
      nombre: `Propiedad ${i}`,
      customFieldValues: { ...mockCatalogoItem.customFieldValues },
    }));
    (prisma.catalogoItem.findMany as any).mockResolvedValue(items);

    const result = await getProperties('tenant-1', { limit: 2, offset: 1 });

    expect(result.total).toBe(5);
    expect(result.properties).toHaveLength(2);
    expect(result.properties[0].nombre).toBe('Propiedad 1');
    expect(result.properties[1].nombre).toBe('Propiedad 2');
  });
});

// ─── getPropertyById (via findFirst) ───────────────────────────────────────

describe('getPropertyById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe retornar null si no existe la propiedad', async () => {
    (prisma.catalogoItem.findFirst as any).mockResolvedValue(null);

    const { getPropertyById } = await import('@/lib/real-estate/property-helpers');
    const result = await getPropertyById('tenant-1', 'inm-nonexistent');

    expect(result).toBeNull();
    expect(prisma.catalogoItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'inm-nonexistent',
          tenantId: 'tenant-1',
          tipo: 'inmueble',
        }),
      })
    );
  });
});
