// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El cotejo del peaje (lib/hospitality/cotejo-vinculo.ts): lo que el canal
 * vendió contra la tarifa configurada. La regla del §0.1 a prueba: sin reserva
 * o sin precio el veredicto lo dice, nunca se inventa un número para cerrar.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    hospitalityProperty: { findFirst: vi.fn() },
    connectivityMapping: { findMany: vi.fn() },
    hospitalityRatePlan: { findFirst: vi.fn() },
    hospitalityReservation: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

const { cotejarVinculosPropiedad, TOLERANCIA_COTEJO } = await import(
  '@/lib/hospitality/cotejo-vinculo'
);

const PROP = {
  id: 'p1',
  mappings: [{ externalPropertyId: 'sandbox-pms' }],
};

const MAPPING = {
  estado: 'pendiente_revision',
  externalUnitCode: 'penthouse',
  externalRatePlanCode: 'penthouse-ep',
  metadata: { origen: 'vinculacion_automatica_webhook', bookingId: 'BKG-9', motivo: 'codigo_de_unidad' },
  fechaCreacion: new Date('2026-10-15T10:00:00Z'),
  unitId: 'u1',
  unit: { nombre: 'Penthouse', tarifaBase: null, moneda: 'MXN' },
};

const RESERVA = {
  externalBookingId: 'BKG-9',
  channel: 'Airbnb',
  checkIn: new Date('2026-11-01T00:00:00Z'),
  checkOut: new Date('2026-11-04T00:00:00Z'),
  amountAfterTax: 3000,
  currency: 'MXN',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.hospitalityProperty.findFirst.mockResolvedValue(PROP);
  mocks.prisma.connectivityMapping.findMany.mockResolvedValue([MAPPING]);
  mocks.prisma.hospitalityReservation.findFirst.mockResolvedValue(RESERVA);
  // Plan vinculado por el rateplanCode del vínculo: la precedencia real.
  mocks.prisma.hospitalityRatePlan.findFirst.mockImplementation((_args: any) => {
    // Primera llamada busca el plan «vinculado» por código; si un test quiere
    // solo plan activo, la reconfigura con mockResolvedValueOnce extra.
    return Promise.resolve({
      tarifa: 1000,
      moneda: 'MXN',
      temporadas: null,
      finDeSemana: null,
    });
  });
});

describe('cotejarVinculosPropiedad — veredictos', () => {
  it('canal que cobra la tarifa configurada: ok (100%)', async () => {
    const res = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    expect(res.ok).toBe(true);
    expect(res.vinculos).toHaveLength(1);
    const v = res.vinculos[0];
    // 3000 / 3 noches = 1000/noche; plan a 1000 → 100%.
    expect(v.veredicto).toBe('ok');
    expect(v.porcentaje).toBe(100);
    expect(v.canal?.porNoche).toBe(1000);
    expect(v.nuestro.porNoche).toBe(1000);
    expect(res.conAlerta).toBe(0);
    // Coteja el MISMO rango: el desglose va por el checkIn/checkOut de la reserva.
    expect(v.canal?.checkIn).toBe(RESERVA.checkIn.toISOString());
  });

  it('canal que vendió por debajo: canal_bajo con el porcentaje', async () => {
    mocks.prisma.hospitalityReservation.findFirst.mockResolvedValue({ ...RESERVA, amountAfterTax: 2100 });

    const res = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    const v = res.vinculos[0];
    // 2100 / 3 = 700/noche contra 1000 → 70%.
    expect(v.veredicto).toBe('canal_bajo');
    expect(v.porcentaje).toBe(70);
    expect(res.conAlerta).toBe(1);
  });

  it('la tolerancia del ok deja margen por redondeos del canal', async () => {
    // 97% (dentro del 95%): ok.
    mocks.prisma.hospitalityReservation.findFirst.mockResolvedValue({ ...RESERVA, amountAfterTax: 2910 });
    const dentro = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    expect(dentro.vinculos[0].veredicto).toBe('ok');

    // 92% (fuera): canal_bajo.
    mocks.prisma.hospitalityReservation.findFirst.mockResolvedValue({ ...RESERVA, amountAfterTax: 2760 });
    const fuera = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    expect(fuera.vinculos[0].veredicto).toBe('canal_bajo');
  });

  it('sin reserva del canal: sin_reserva y cero alertas (no bloquea el peaje)', async () => {
    mocks.prisma.hospitalityReservation.findFirst.mockResolvedValue(null);

    const res = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    const v = res.vinculos[0];
    expect(v.veredicto).toBe('sin_reserva');
    expect(v.canal).toBeNull();
    // El precio nuestro sigue informado (tarifa del plan), sin total inventado.
    expect(v.nuestro.porNoche).toBe(1000);
    expect(v.nuestro.total).toBeNull();
    expect(res.conAlerta).toBe(0);
  });

  it('sin plan ni tarifa base: sin_precio y cuenta como alerta del peaje', async () => {
    mocks.prisma.hospitalityRatePlan.findFirst.mockResolvedValue(null);

    const res = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    const v = res.vinculos[0];
    expect(v.veredicto).toBe('sin_precio');
    expect(v.nuestro.fuente).toBe('sin_precio');
    // Vendió caro o barato no se sabe; lo que sí es seguro: publicar sin
    // precio no es aceptable, así que cuenta como alerta del peaje.
    expect(res.conAlerta).toBe(1);
  });

  it('la reserva buscada es la del bookingId que trajo el vínculo', async () => {
    await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    expect(mocks.prisma.hospitalityReservation.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      unitId: 'u1',
      externalBookingId: 'BKG-9',
    });
  });

  it('los automáticos VIEJOS (activo + metadata webhook) van solo-informativo', async () => {
    mocks.prisma.connectivityMapping.findMany.mockResolvedValue([
      { ...MAPPING, estado: 'activo' },
    ]);

    const res = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    expect(res.vinculos[0].soloInformativo).toBe(true);
    // Y aunque vendiera barato no cuenta para el peaje (ya publicaba antes).
    mocks.prisma.hospitalityReservation.findFirst.mockResolvedValue({ ...RESERVA, amountAfterTax: 100 });
    const barato = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'p1' });
    expect(barato.conAlerta).toBe(0);
  });

  it('propiedad de otro tenant: ok=false (aislamiento)', async () => {
    mocks.prisma.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await cotejarVinculosPropiedad({ tenantId: 't1', propertyId: 'ajena' });
    expect(res.ok).toBe(false);
    expect(res.vinculos).toHaveLength(0);
  });
});

describe('cotejo — guardia de fuente (UI y endpoint)', () => {
  const RAIZ = path.resolve(__dirname, '..');
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

  it('la página abre el modal con el cotejo antes de poder confirmar', () => {
    const fuente = leer('app/dashboard/hospitality/onboarding/page.tsx');
    // El botón del paso 6 abre el cotejo, ya no confirma a ciegas:
    expect(fuente).toContain('abrirCotejo');
    expect(fuente).toContain('confirmarDesdeCotejo');
    // Y la comparación es visible, no solo el veredicto:
    expect(fuente).toContain('Tu tarifa');
    expect(fuente).toContain('Canal');
  });

  it('el endpoint exige autenticación y pasa propertyId al módulo', () => {
    const fuente = leer('app/api/hospitality/onboarding/cotejo/route.ts');
    expect(fuente).toContain('authenticateRequest');
    expect(fuente).toContain("exigirPermisoHospitality(auth, 'integraciones.gestionar')");
    expect(fuente).toContain('cotejarVinculosPropiedad');
  });
});
