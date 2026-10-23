// @vitest-environment node
/**
 * Consultas de códigos promocionales: el registro del intento y la conversión.
 *
 * Lo que se protege:
 * 1. La web pública registra la consulta aunque el huésped NO reserve: sin ese
 *    dato no hay denominador y la conversión de cada código es invisible.
 * 2. Una misma sesión no suma varias consultas del mismo código (la base lo
 *    garantiza con la unicidad; aquí se comprueba que se usa el upsert).
 * 3. Un rechazo se guarda con su motivo, no como «aplicada»: no infla la
 *    conversión y explica por qué la promoción no arranca.
 * 4. La reserva marca su consulta como convertida solo si trae sesión; sin ella
 *    no se atribuye nada.
 * 5. Registrar es best-effort: si la base falla, la consulta del huésped sigue
 *    su curso (no se convierte en «código no válido»).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityPromoConsulta: { upsert: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  hospitalityPromoCode: { findUnique: vi.fn() },
  resolverPaginaPublica: vi.fn(),
  cotizarDisponibilidad: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityPromoConsulta: mocks.hospitalityPromoConsulta,
    hospitalityPromoCode: mocks.hospitalityPromoCode,
  },
}));
vi.mock('@/lib/hospitality/booking-engine', () => ({
  resolverPaginaPublica: mocks.resolverPaginaPublica,
  cotizarDisponibilidad: mocks.cotizarDisponibilidad,
}));

import { POST } from '@/app/api/public/booking/[slug]/promocion/route';
import {
  marcarConsultaConvertida,
  registrarConsultaPromocion,
} from '@/lib/hospitality/promos-registro';

const pagina = {
  ok: true as const,
  config: { tenantId: 'tenant_a' },
  moneda: 'MXN',
  propiedades: [{ id: 'prop_a' }],
};

const promo = {
  id: 'promo_1',
  codigo: 'VERANO2027',
  tipo: 'porcentaje',
  valor: 10,
  moneda: 'MXN',
  desde: null,
  hasta: null,
  minNoches: 1,
  maxUsos: null,
  usos: 0,
  activo: true,
};

const cuerpoBase = {
  propertyId: 'prop_a',
  unitId: 'unit_a',
  checkIn: '2027-07-10',
  checkOut: '2027-07-13',
  adultos: 2,
  ninos: 0,
  codigo: 'verano 2027',
  sesionPromo: 'sesion-0001',
};

const ctx = { params: Promise.resolve({ slug: 'mi-hotel' }) };

function request(cuerpo: Record<string, unknown>) {
  return new Request('http://test.local/api/public/booking/mi-hotel/promocion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverPaginaPublica.mockResolvedValue(pagina);
  mocks.cotizarDisponibilidad.mockResolvedValue({
    ok: true,
    noches: 3,
    moneda: 'MXN',
    unidades: [{ unitId: 'unit_a', cotizacion: { alojamiento: 3000, total: 3300 } }],
  });
  mocks.hospitalityPromoCode.findUnique.mockResolvedValue(promo);
  mocks.hospitalityPromoConsulta.upsert.mockResolvedValue({});
  mocks.hospitalityPromoConsulta.create.mockResolvedValue({});
});

describe('registrarConsultaPromocion', () => {
  it('con sesión hace upsert por (tenant, sesión, código): reintentar no suma otra consulta', async () => {
    const ok = await registrarConsultaPromocion({
      tenantId: 'tenant_a',
      codigo: ' verano 2027 ',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      checkIn: new Date(2027, 6, 10),
      checkOut: new Date(2027, 6, 13),
      resultado: 'aplicada',
      sesionId: 'sesion-0001',
    });

    expect(ok).toBe(true);
    const args = mocks.hospitalityPromoConsulta.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      tenantId_sesionId_codigo: {
        tenantId: 'tenant_a',
        sesionId: 'sesion-0001',
        codigo: 'VERANO2027',
      },
    });
    expect(args.create).toMatchObject({
      tenantId: 'tenant_a',
      codigo: 'VERANO2027',
      sesionId: 'sesion-0001',
      resultado: 'aplicada',
    });
    // La fecha se refresca al reaplicar: el informe ordena por el último intento.
    expect(args.update.fecha).toBeInstanceOf(Date);
  });

  it('sin sesión crea la fila igual, pero sin clave de atribución', async () => {
    await registrarConsultaPromocion({
      tenantId: 'tenant_a',
      codigo: 'VERANO2027',
      checkIn: new Date(2027, 6, 10),
      checkOut: new Date(2027, 6, 13),
      resultado: 'aplicada',
      sesionId: 'corta',
    });

    const args = mocks.hospitalityPromoConsulta.create.mock.calls[0][0];
    expect(args.data).toMatchObject({ codigo: 'VERANO2027', sesionId: null });
    expect(mocks.hospitalityPromoConsulta.upsert).not.toHaveBeenCalled();
  });

  it('un fallo de la base no rompe la consulta del huésped', async () => {
    mocks.hospitalityPromoConsulta.upsert.mockRejectedValue(new Error('sin conexión'));
    const ok = await registrarConsultaPromocion({
      tenantId: 'tenant_a',
      codigo: 'VERANO2027',
      checkIn: new Date(2027, 6, 10),
      checkOut: new Date(2027, 6, 13),
      resultado: 'aplicada',
      sesionId: 'sesion-0001',
    });
    expect(ok).toBe(false);
  });
});

describe('marcarConsultaConvertida', () => {
  it('marca la consulta de la misma sesión y código, no todas las del código', async () => {
    mocks.hospitalityPromoConsulta.updateMany.mockResolvedValue({ count: 1 });
    const tx = { hospitalityPromoConsulta: mocks.hospitalityPromoConsulta };

    const marcadas = await marcarConsultaConvertida(tx, {
      tenantId: 'tenant_a',
      codigo: 'verano 2027',
      sesionId: 'sesion-0001',
      reservationId: 'res_a',
    });

    expect(marcadas).toBe(1);
    expect(mocks.hospitalityPromoConsulta.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_a', codigo: 'VERANO2027', sesionId: 'sesion-0001' },
      data: { reservationId: 'res_a' },
    });
  });

  it('sin sesión no se atribuye la reserva a ninguna consulta', async () => {
    const tx = { hospitalityPromoConsulta: mocks.hospitalityPromoConsulta };
    const marcadas = await marcarConsultaConvertida(tx, {
      tenantId: 'tenant_a',
      codigo: 'VERANO2027',
      sesionId: null,
      reservationId: 'res_a',
    });

    expect(marcadas).toBe(0);
    expect(mocks.hospitalityPromoConsulta.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /promocion — deja registrado el intento', () => {
  it('un código que vale se registra como aplicado con la sesión del asistente', async () => {
    const res = await POST(request(cuerpoBase), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const args = mocks.hospitalityPromoConsulta.upsert.mock.calls[0][0];
    expect(args.where.tenantId_sesionId_codigo).toEqual({
      tenantId: 'tenant_a',
      sesionId: 'sesion-0001',
      codigo: 'VERANO2027',
    });
    expect(args.create).toMatchObject({
      codigo: 'VERANO2027',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      resultado: 'aplicada',
      motivo: null,
    });
  });

  it('un código que no cumple las condiciones se guarda con su motivo, no como aplicado', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue({ ...promo, minNoches: 5 });

    const res = await POST(request(cuerpoBase), ctx);
    expect((await res.json()).ok).toBe(false);

    const args = mocks.hospitalityPromoConsulta.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({
      resultado: 'min_noches',
      motivo: expect.stringContaining('5 noches'),
    });
  });

  it('un código inexistente se registra como no_existe (errata o campaña sin crear)', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue(null);

    const res = await POST(request({ ...cuerpoBase, codigo: 'VERANO207' }), ctx);
    expect((await res.json()).ok).toBe(false);

    const args = mocks.hospitalityPromoConsulta.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({ codigo: 'VERANO207', resultado: 'no_existe' });
  });

  it('un texto que no puede ser un código no se guarda', async () => {
    await POST(request({ ...cuerpoBase, codigo: 'AB' }), ctx);
    expect(mocks.hospitalityPromoConsulta.upsert).not.toHaveBeenCalled();
    expect(mocks.hospitalityPromoConsulta.create).not.toHaveBeenCalled();
  });
});
