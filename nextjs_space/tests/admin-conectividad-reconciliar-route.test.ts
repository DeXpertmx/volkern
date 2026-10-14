// @vitest-environment node
//
// Guardia de POST /api/admin/conectividad/reconciliar y de lo que el panel
// enseña de su resultado.
//
// Por qué existe
// --------------
// El resumen de la reconciliación solo mostraba cuatro contadores (creadas,
// actualizadas, canceladas, divergencias), y todos pueden ser **0** por dos
// motivos opuestos:
//
//   • el proveedor no devolvió ninguna reserva en el rango (no hay nada al otro
//     lado: puede que el hotel no reciba reservas todavía), o
//   • devolvió N reservas y todas ya cuadraban con nuestro estado (el circuito
//     funciona y está al día).
//
// Leídos igual —«Reconciliación completada: 0 creadas…»— el operador no puede
// saber si el canal está vacío o perfecto. El módulo ya calculaba `totalFetch` y
// `sinCambios`: esta guardia exige que lleguen a la API y que el panel los
// pinte, para que «0 creadas» deje de ser ambiguo.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  propertyFindMany: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    hospitalityProperty: { findMany: mocks.propertyFindMany },
  },
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    hospitalityProperty: { findMany: mocks.propertyFindMany },
  },
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/hospitality/reconciliation', () => ({
  runReconciliation: (...a: unknown[]) => mocks.reconcile(...a),
}));

const { getServerSession } = await import('next-auth');
const { POST } = await import('@/app/api/admin/conectividad/reconciliar/route');

const RAIZ = path.resolve(__dirname, '..');

function reqPost(body: unknown): any {
  return { json: async () => body, headers: { get: () => null } };
}

/** Resumen de un tenant tal como lo devuelve `runReconciliation`. */
function resumen(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    propiedades: 1,
    fetchFallidos: 0,
    totalFetch: 0,
    creadas: 0,
    actualizadas: 0,
    canceladas: 0,
    sinCambios: 0,
    divergencias: 0,
    errores: [],
    ...extra,
  };
}

describe('POST /api/admin/conectividad/reconciliar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.userFindUnique.mockResolvedValue({
      id: 'u1',
      name: 'Root',
      role: { nombre: 'Superadmin' },
    });
    mocks.propertyFindMany.mockResolvedValue([{ tenantId: 'tenant_1' }]);
    mocks.reconcile.mockResolvedValue(resumen());
  });

  it('sin sesión → 401 y no se reconcilia nada', async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(reqPost({}));

    expect(res.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('sin rol Superadmin → 403 y no se reconcilia nada', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Usuario' } });

    const res = await POST(reqPost({}));

    expect(res.status).toBe(403);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('sin propiedades mapeadas → mensaje propio y ninguna llamada al proveedor', async () => {
    mocks.propertyFindMany.mockResolvedValue([]);

    const res = await POST(reqPost({}));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/no hay propiedades con mapping/i);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('el proveedor no devolvió nada → «0 reservas» explícito (y no un 0 a secas)', async () => {
    mocks.reconcile.mockResolvedValue(resumen({ totalFetch: 0 }));

    const body = await (await POST(reqPost({}))).json();

    expect(body.totalFetch).toBe(0);
    expect(body.totalSinCambios).toBe(0);
    expect(body.totalPropiedades).toBe(1);
    expect(body.message).toContain('devolvió 0 reservas');
  });

  it('el proveedor devolvió reservas y todas cuadraban → se ve que hay feed vivo', async () => {
    mocks.reconcile.mockResolvedValue(resumen({ totalFetch: 3, sinCambios: 3 }));

    const body = await (await POST(reqPost({}))).json();

    expect(body.totalFetch).toBe(3);
    expect(body.totalSinCambios).toBe(3);
    expect(body.totalCreadas).toBe(0);
    expect(body.message).toContain('devolvió 3 reservas');
    expect(body.message).toContain('3 sin cambios');
  });

  it('los totales suman los de todos los tenants reconciliados', async () => {
    mocks.propertyFindMany.mockResolvedValue([{ tenantId: 'a' }, { tenantId: 'b' }]);
    mocks.reconcile
      .mockResolvedValueOnce(resumen({ totalFetch: 2, creadas: 1 }))
      .mockResolvedValueOnce(resumen({ totalFetch: 1, sinCambios: 1 }));

    const body = await (await POST(reqPost({}))).json();

    expect(body.totalPropiedades).toBe(2);
    expect(body.totalFetch).toBe(3);
    expect(body.totalCreadas).toBe(1);
    expect(body.totalSinCambios).toBe(1);
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
  });

  it('un fetch fallido sale como error del resumen (no como éxito silencioso)', async () => {
    mocks.reconcile.mockResolvedValue(
      resumen({ ok: false, fetchFallidos: 1, errores: ['[Casa X] HTTP 500'] })
    );

    const body = await (await POST(reqPost({}))).json();

    expect(body.ok).toBe(false);
    expect(body.errores).toEqual(['[Casa X] HTTP 500']);
  });
});

describe('el panel enseña lo que devolvió el proveedor (guardia de fuente)', () => {
  const panel = fs.readFileSync(path.join(RAIZ, 'app/admin/conectividad/page.tsx'), 'utf8');
  const ruta = fs.readFileSync(
    path.join(RAIZ, 'app/api/admin/conectividad/reconciliar/route.ts'),
    'utf8'
  );

  it('la ruta devuelve los totales de lo leído y de lo ya cuadrado', () => {
    expect(ruta).toContain('totalFetch');
    expect(ruta).toContain('totalSinCambios');
    expect(ruta).toContain('totalPropiedades');
  });

  it('el panel los pinta junto a los contadores de cambios', () => {
    expect(panel).toContain('Reservas del proveedor:');
    expect(panel).toContain('Sin cambios:');
    expect(panel).toContain('totalFetch');
    expect(panel).toContain('totalSinCambios');
  });

  it('la tarjeta dice el rango REAL (desde hoy a 30 días vista, no «últimos 30 días»)', () => {
    // El fetch va de hoy hacia adelante: decir «últimos 30 días» hacía esperar
    // reservas ya pasadas que este barrido no consulta.
    expect(panel).toContain('desde hoy y 30 días vista');
    expect(panel).not.toContain('(últimos 30 días)');
  });
});
