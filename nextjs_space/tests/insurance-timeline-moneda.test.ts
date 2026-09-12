import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El timeline del portfolio declaraba sus importes sin divisa, así que la
 * pantalla los escribía con la moneda mínima del esquema: un tenant en euros
 * veía pesos. Además sumaba las primas **en bruto**, sin convertir, de modo que
 * una cartera con pólizas en dos divisas producía un total sin significado.
 *
 * Estas pruebas fijan las dos cosas: la divisa viaja en la respuesta y las sumas
 * van convertidas a ella.
 */

const __mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  poliza: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'tenant-1', nombre: 'Correduría de prueba', slug: 'correduria', plan: 'insurance' },
    user: { id: 'user-1', name: 'Broker', email: 'broker@test.com' },
    authMethod: 'apikey',
  }),
}));

import { GET } from '@/app/api/insurance/portfolio/timeline/route';
import { prisma } from '@/lib/db';
import { fxConvert } from '@/lib/insurance/currency';

const TENANT_ID = 'tenant-1';

function makeReq(url = 'http://localhost/api/insurance/portfolio/timeline?months=12') {
  return new Request(url) as any;
}

/** Póliza emitida en el mes en curso, que es el último de la ventana. */
function polizaDeEsteMes(primaAnual: number, moneda: string) {
  return {
    id: `pol-${moneda}-${primaAnual}`,
    fechaEmision: new Date(),
    primaAnual,
    moneda,
    estado: 'ACTIVA',
  };
}

describe('GET /api/insurance/portfolio/timeline — divisa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.tenant.findUnique as any).mockResolvedValue({ moneda: 'MXN' });
    (prisma.poliza.findMany as any).mockResolvedValue([]);
  });

  it('declara la divisa de reporte del tenant', async () => {
    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tenantMoneda).toBe('MXN');
  });

  it('sin divisa declarada cae al mínimo del esquema, no a un literal de la ruta', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(null);

    const body = await (await GET(makeReq())).json();

    expect(body.tenantMoneda).toBe('MXN');
  });

  it('convierte las sumas a la divisa del tenant antes de totalizarlas', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([
      polizaDeEsteMes(100, 'EUR'),
      polizaDeEsteMes(1000, 'MXN'),
    ]);

    const body = await (await GET(makeReq())).json();

    // El total debe ser la suma convertida, no 1100 en bruto.
    expect(body.totalVentana).toBeCloseTo(fxConvert(100, 'EUR', 'MXN') + 1000, 6);
    expect(body.totalVentana).not.toBeCloseTo(1100, 6);
  });

  it('un tenant en euros totaliza en euros', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ moneda: 'EUR' });
    (prisma.poliza.findMany as any).mockResolvedValue([
      polizaDeEsteMes(100, 'EUR'),
      polizaDeEsteMes(1000, 'MXN'),
    ]);

    const body = await (await GET(makeReq())).json();

    expect(body.tenantMoneda).toBe('EUR');
    expect(body.totalVentana).toBeCloseTo(100 + fxConvert(1000, 'MXN', 'EUR'), 6);
  });

  it('pide las pólizas del tenant con su divisa', async () => {
    await GET(makeReq());

    expect(prisma.poliza.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID }),
        select: expect.objectContaining({ moneda: true }),
      })
    );
  });
});
