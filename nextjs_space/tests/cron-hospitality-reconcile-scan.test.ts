import { describe, it, expect, vi, beforeEach } from 'vitest';

// La ventana del barrido NO se escribe a mano aquí: el cron tiene que pasar la
// constante compartida (el horizonte de venta), y si alguien la cambia, esta
// guardia lo dice en vez de quedarse con un número viejo.
import {
  DIAS_BARRIDO_RESERVAS_ADELANTE,
  DIAS_BARRIDO_RESERVAS_ATRAS,
} from '@/lib/hospitality/ventana-reservas';

// ────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted)
// ────────────────────────────────────────────────────────────────────────────
const __mockPrisma = vi.hoisted(() => ({
  hospitalityProperty: {
    findMany: vi.fn(),
  },
}));

const __mockRunReconciliation = vi.hoisted(() => vi.fn());

/**
 * Guardia de inventario (§29): va en su propio mock porque el cron la ejecuta
 * además del fetch de reservas — y un fallo suyo NO puede parecer un fallo de
 * la reconciliación.
 */
const __mockInventario = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));

vi.mock('@/lib/hospitality/reconciliation', () => ({
  runReconciliation: (...a: any[]) => __mockRunReconciliation(...a),
}));

vi.mock('@/lib/hospitality/inventario-divergencias', () => ({
  detectarDivergenciasInventario: (...a: any[]) => __mockInventario(...a),
}));

/** Barrido limpio: sin noches sin justificar y sin avisos. */
function inventarioLimpio(avisos: string[] = []) {
  return {
    ok: true,
    propiedades: 1,
    cerradasSinJustificar: 0,
    abiertasSinJustificar: 0,
    comparadas: 30,
    sinDato: 0,
    avisos,
    errores: [],
    detalle: [],
  };
}

describe('runHospitalityReconcileScan (job diario §14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([]);
    __mockRunReconciliation.mockResolvedValue({
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
    });
    __mockInventario.mockResolvedValue(inventarioLimpio());
  });

  it('sin tenants con mappings activos → no llama a la reconciliación ni al inventario', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([]);

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.success).toBe(true);
    expect(res.tenants).toBe(0);
    expect(res.totalCreadas).toBe(0);
    expect(__mockRunReconciliation).not.toHaveBeenCalled();
    expect(__mockInventario).not.toHaveBeenCalled();
  });

  it('la guardia de inventario corre por cada tenant, con la misma ventana de 30 días', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    await runHospitalityReconcileScan();

    expect(__mockInventario).toHaveBeenCalledTimes(2);
    expect(__mockInventario).toHaveBeenCalledWith({ tenantId: 't1', dias: 30 });
    expect(__mockInventario).toHaveBeenCalledWith({ tenantId: 't2', dias: 30 });
  });

  it('suma las noches sin justificar y deja los avisos para el panel', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockInventario
      .mockResolvedValueOnce({
        ...inventarioLimpio(['[Villa Mar Azul] 2 noche(s) que el proveedor NO vende y aquí sí están libres (se pierden ventas).']),
        cerradasSinJustificar: 2,
        abiertasSinJustificar: 1,
      })
      .mockResolvedValueOnce(inventarioLimpio());

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.totalNochesCerradasSinJustificar).toBe(2);
    expect(res.totalNochesAbiertasSinJustificar).toBe(1);
    expect(res.avisos).toHaveLength(1);
    expect(res.avisos[0]).toContain('se pierden ventas');
    expect(res.message).toContain('2 noches que el proveedor no vende y 1 que vende sin justificar');
    // El job sigue siendo un éxito: detectar divergencias no es fallar.
    expect(res.success).toBe(true);
  });

  it('un barrido de inventario que falla se reporta y no se traga', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([{ tenantId: 't1' }]);
    __mockInventario.mockRejectedValue(new Error('DB timeout'));

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    // La reconciliación de reservas fue bien, pero el calendario del canal
    // quedó sin auditar: eso es un fallo del job y se ve.
    expect(res.success).toBe(false);
    expect(res.errores).toEqual(['[inventario] DB timeout']);
    expect(res.totalNochesCerradasSinJustificar).toBe(0);
  });

  it('reconcilia cada tenant con mapping, siempre conservador y con la ventana de reservas (atrás y adelante)', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.tenants).toBe(2);
    expect(__mockRunReconciliation).toHaveBeenCalledTimes(2);
    // `diasAtras` no es un adorno: el proveedor filtra por fecha de RESERVA, y
    // sin mirar atrás el barrido no recupera los pushes perdidos.
    expect(__mockRunReconciliation).toHaveBeenCalledWith({
      tenantId: 't1',
      dias: DIAS_BARRIDO_RESERVAS_ADELANTE,
      diasAtras: DIAS_BARRIDO_RESERVAS_ATRAS,
      cancelarAusentes: false,
    });
    expect(__mockRunReconciliation).toHaveBeenCalledWith({
      tenantId: 't2',
      dias: DIAS_BARRIDO_RESERVAS_ADELANTE,
      diasAtras: DIAS_BARRIDO_RESERVAS_ATRAS,
      cancelarAusentes: false,
    });
    // Y el horizonte es el de venta, no los 30 días que dejaban fuera las
    // reservas vivas hechas hace meses (medido: ver ventana-reservas.ts).
    expect(DIAS_BARRIDO_RESERVAS_ATRAS).toBe(730);
  });

  it('acumula contadores y reporta errores sin romper el job', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockRunReconciliation
      .mockResolvedValueOnce({
        ok: true,
        propiedades: 1,
        fetchFallidos: 0,
        totalFetch: 4,
        creadas: 2,
        actualizadas: 1,
        canceladas: 0,
        sinCambios: 0,
        divergencias: 3,
        errores: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        propiedades: 1,
        fetchFallidos: 1,
        totalFetch: 0,
        creadas: 0,
        actualizadas: 0,
        canceladas: 0,
        sinCambios: 0,
        divergencias: 0,
        errores: ['[Prop A] HTTP 404'],
      });

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.success).toBe(false);
    expect(res.totalCreadas).toBe(2);
    expect(res.totalActualizadas).toBe(1);
    expect(res.totalDivergencias).toBe(3);
    expect(res.errores).toEqual(['[Prop A] HTTP 404']);
  });

  it('un tenant que lanza no impide reconciliar los demás', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockRunReconciliation
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({
        ok: true,
        propiedades: 1,
        fetchFallidos: 0,
        totalFetch: 0,
        creadas: 1,
        actualizadas: 0,
        canceladas: 0,
        sinCambios: 0,
        divergencias: 0,
        errores: [],
      });

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.tenants).toBe(2);
    expect(res.success).toBe(false);
    expect(res.totalCreadas).toBe(1);
    expect(res.errores).toEqual(['DB timeout']);
  });
});
