import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El esquema trae `'MXN'` como valor por defecto en todos los campos de moneda.
 * Si la API lo usara como respaldo, un tenant que trabaja en euros crearía
 * inventario en pesos con solo omitir el campo. Estas pruebas fijan la cadena
 * completa: dato explícito → dato real (inventario, unidad) → moneda de reporte
 * del tenant (`Tenant.moneda`). El valor del esquema queda solo como red de
 * seguridad de la escritura, nunca como primera opción.
 */

const hoisted = vi.hoisted(() => ({
  hospitalityProperty: { findFirst: vi.fn() },
  hospitalityUnit: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  hospitalityRatePlan: { create: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityProperty: hoisted.hospitalityProperty,
    hospitalityUnit: hoisted.hospitalityUnit,
    hospitalityRatePlan: hoisted.hospitalityRatePlan,
  },
}));

vi.mock('@/lib/permissions', () => ({
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'tenant_a', moneda: 'EUR' },
    user: { id: 'user_1' },
  }),
}));

// El push hacia la capa de conectividad se dispara al crear un plan: se aísla
// para que estas pruebas midan solo la divisa.
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: vi.fn().mockResolvedValue({ ok: true }),
}));

import { POST as postUnit } from '@/app/api/hospitality/units/route';
import { POST as postRatePlan } from '@/app/api/hospitality/rateplans/route';

function jsonReq(body: unknown) {
  return new Request('http://test.local/api/hospitality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.hospitalityProperty.findFirst.mockResolvedValue({ id: 'prop_a', tenantId: 'tenant_a' });
  hoisted.hospitalityUnit.findMany.mockResolvedValue([]);
  hoisted.hospitalityUnit.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));
});

describe('POST /api/hospitality/units — divisa por defecto', () => {
  it('usa la divisa del inventario del tenant cuando no se indica ninguna', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([{ moneda: 'EUR' }, { moneda: 'EUR' }]);

    await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1' }));

    const data = hoisted.hospitalityUnit.create.mock.calls[0][0].data;
    expect(data.moneda).toBe('EUR');
    // La consulta de respaldo está acotada al tenant: no filtra por otra cuenta.
    expect(hoisted.hospitalityUnit.findMany.mock.calls[0][0].where.tenantId).toBe('tenant_a');
  });

  it('gana la divisa predominante, no la primera unidad', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([
      { moneda: 'MXN' },
      { moneda: 'EUR' },
      { moneda: 'EUR' },
    ]);

    await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1' }));

    expect(hoisted.hospitalityUnit.create.mock.calls[0][0].data.moneda).toBe('EUR');
  });

  it('respeta la divisa indicada explícitamente sin consultar el inventario', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([{ moneda: 'EUR' }]);

    await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1', moneda: 'usd' }));

    const data = hoisted.hospitalityUnit.create.mock.calls[0][0].data;
    expect(data.moneda).toBe('USD');
    expect(hoisted.hospitalityUnit.findMany).not.toHaveBeenCalled();
  });

  it('sin divisa y sin inventario previo cae a la moneda de reporte del tenant', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([]);

    await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1' }));

    expect(hoisted.hospitalityUnit.create.mock.calls[0][0].data.moneda).toBe('EUR');
  });

  it('sin divisa en el tenant queda el valor del esquema, nunca una cadena vacía', async () => {
    // La columna no admite nulos y es una escritura: aquí 'MXN' es preferible a
    // guardar una unidad sin divisa. En producción `Tenant.moneda` siempre trae
    // valor, así que este caso no se alcanza.
    const { authenticateRequest } = await import('@/lib/api-key-auth');
    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      valid: true,
      tenant: { id: 'tenant_a' },
      user: { id: 'user_1' },
    } as never);
    hoisted.hospitalityUnit.findMany.mockResolvedValue([]);

    await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1' }));

    expect(hoisted.hospitalityUnit.create.mock.calls[0][0].data.moneda).toBe('MXN');
  });

  it('un campo vacío se trata como ausente, no como divisa', async () => {
    // El asistente de puesta en marcha envía cadena vacía para decir "la del
    // inventario"; guardarla tal cual dejaría unidades sin divisa.
    hoisted.hospitalityUnit.findMany.mockResolvedValue([{ moneda: 'EUR' }]);

    await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1', moneda: '' }));

    expect(hoisted.hospitalityUnit.create.mock.calls[0][0].data.moneda).toBe('EUR');
  });
});

describe('POST /api/hospitality/rateplans — divisa por defecto', () => {
  beforeEach(() => {
    hoisted.hospitalityUnit.findFirst.mockResolvedValue({ id: 'unit_a', moneda: 'EUR' });
    hoisted.hospitalityRatePlan.create.mockImplementation(async ({ data }: any) => ({ id: 'rp1', ...data }));
  });

  it('el plan hereda la divisa de su unidad', async () => {
    await postRatePlan(
      jsonReq({ propertyId: 'prop_a', unitId: 'unit_a', nombre: 'Tarifa base', tarifa: 120 })
    );

    expect(hoisted.hospitalityRatePlan.create.mock.calls[0][0].data.moneda).toBe('EUR');
  });

  it('la divisa indicada gana sobre la de la unidad', async () => {
    await postRatePlan(
      jsonReq({
        propertyId: 'prop_a',
        unitId: 'unit_a',
        nombre: 'Tarifa base',
        tarifa: 120,
        moneda: 'USD',
      })
    );

    expect(hoisted.hospitalityRatePlan.create.mock.calls[0][0].data.moneda).toBe('USD');
  });

  it('sin divisa en la unidad cae a la del tenant', async () => {
    hoisted.hospitalityUnit.findFirst.mockResolvedValue({ id: 'unit_a', moneda: null });

    await postRatePlan(
      jsonReq({ propertyId: 'prop_a', unitId: 'unit_a', nombre: 'Tarifa base', tarifa: 120 })
    );

    expect(hoisted.hospitalityRatePlan.create.mock.calls[0][0].data.moneda).toBe('EUR');
  });
});
