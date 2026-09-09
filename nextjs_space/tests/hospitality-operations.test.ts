import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performCheckOperation, completeCleaningTask } from '../lib/hospitality/operations';

// Mocks
const mockUpdateReservation = vi.fn();
const mockFindReservation = vi.fn();
const mockUpdateUnit = vi.fn();
const mockFindCleaning = vi.fn();
const mockCreateCleaning = vi.fn();
const mockUpdateCleaning = vi.fn();
const mockDispatch = vi.fn();

vi.mock('../lib/db', () => ({
  prisma: {
    hospitalityReservation: {
      findFirst: (...a: any[]) => mockFindReservation(...a),
      update: (...a: any[]) => mockUpdateReservation(...a),
    },
    hospitalityUnit: {
      update: (...a: any[]) => mockUpdateUnit(...a),
    },
    hospitalityCleaningTask: {
      findFirst: (...a: any[]) => mockFindCleaning(...a),
      create: (...a: any[]) => mockCreateCleaning(...a),
      update: (...a: any[]) => mockUpdateCleaning(...a),
    },
  },
}));

vi.mock('../lib/hospitality/sync', () => ({
  dispatchConnectivityPush: (...a: any[]) => mockDispatch(...a),
}));

const RESERVATION = {
  id: 'r1',
  tenantId: 't1',
  propertyId: 'p1',
  unitId: 'u1',
  estado: 'confirmed',
  checkIn: new Date('2026-09-10'),
  checkOut: new Date('2026-09-15'),
  unit: { id: 'u1', nombre: 'Loft Marina' },
};

describe('performCheckOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindReservation.mockResolvedValue(RESERVATION);
    mockUpdateReservation.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'r1', ...data })
    );
    mockUpdateUnit.mockResolvedValue({ id: 'u1', estado: 'cleaning' });
    mockFindCleaning.mockResolvedValue(null);
    mockCreateCleaning.mockResolvedValue({ id: 'cleaning-1' });
    mockDispatch.mockResolvedValue({ ok: true });
  });

  it('check-in: reserva → checked_in, unidad → occupied, push de disponibilidad', async () => {
    const result = await performCheckOperation('t1', 'r1', 'checkin');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('checked_in');
    expect(mockUpdateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: { estado: 'checked_in' },
      })
    );
    expect(mockUpdateUnit).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { estado: 'occupied' } })
    );
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockCreateCleaning).not.toHaveBeenCalled();
  });

  it('check-out: reserva → checked_out, unidad → cleaning, tarea de limpieza creada', async () => {
    mockFindReservation.mockResolvedValue({ ...RESERVATION, estado: 'checked_in' });
    const result = await performCheckOperation('t1', 'r1', 'checkout');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('checked_out');
    expect(result.cleaningTaskId).toBe('cleaning-1');
    expect(mockUpdateUnit).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { estado: 'cleaning' } })
    );
    expect(mockCreateCleaning).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          unitId: 'u1',
          reservationId: 'r1',
        }),
      })
    );
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('check-out: no crea tarea duplicada si ya existe una pendiente', async () => {
    mockFindReservation.mockResolvedValue({ ...RESERVATION, estado: 'checked_in' });
    mockFindCleaning.mockResolvedValue({ id: 'existing-1', estado: 'pending' });
    const result = await performCheckOperation('t1', 'r1', 'checkout');
    expect(result.ok).toBe(true);
    expect(result.cleaningTaskId).toBe('existing-1');
    expect(mockCreateCleaning).not.toHaveBeenCalled();
  });

  it('rechaza reservas canceladas', async () => {
    mockFindReservation.mockResolvedValue({ ...RESERVATION, estado: 'cancelled' });
    const result = await performCheckOperation('t1', 'r1', 'checkin');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cancelled');
    expect(mockUpdateReservation).not.toHaveBeenCalled();
  });

  it('rechaza doble check-in', async () => {
    mockFindReservation.mockResolvedValue({ ...RESERVATION, estado: 'checked_in' });
    const result = await performCheckOperation('t1', 'r1', 'checkin');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('check-in');
  });

  it('aislamiento: reserva de otro tenant → no encontrada', async () => {
    mockFindReservation.mockResolvedValue(null);
    const result = await performCheckOperation('t2', 'r1', 'checkin');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Reserva no encontrada');
    expect(mockUpdateReservation).not.toHaveBeenCalled();
  });

  it('los errores de push no rompen el check-out', async () => {
    mockFindReservation.mockResolvedValue({ ...RESERVATION, estado: 'checked_in' });
    mockDispatch.mockRejectedValue(new Error('red caída'));
    const result = await performCheckOperation('t1', 'r1', 'checkout');
    expect(result.ok).toBe(true);
    expect(result.cleaningTaskId).toBe('cleaning-1');
  });

  it('reserva sin unidad: check-out funciona sin unidad ni limpieza', async () => {
    mockFindReservation.mockResolvedValue({ ...RESERVATION, unitId: null, unit: null });
    const result = await performCheckOperation('t1', 'r1', 'checkout');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('checked_out');
    expect(mockUpdateUnit).not.toHaveBeenCalled();
    expect(mockCreateCleaning).not.toHaveBeenCalled();
  });
});

describe('completeCleaningTask (cierre del ciclo §18.3 → §17)', () => {
  const CLEANING_TASK = {
    id: 'ct1',
    tenantId: 't1',
    unitId: 'u1',
    estado: 'pending',
    unit: { id: 'u1', propertyId: 'p1' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindCleaning.mockResolvedValue(CLEANING_TASK);
    mockUpdateCleaning.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'ct1', ...data })
    );
    mockUpdateUnit.mockResolvedValue({ id: 'u1', estado: 'available' });
    mockFindReservation.mockResolvedValue(null); // sin reserva activa hoy
    mockDispatch.mockResolvedValue({ ok: true });
  });

  it('completa la tarea y pone la unidad en available', async () => {
    const result = await completeCleaningTask('t1', 'ct1');
    expect(result.ok).toBe(true);
    expect(result.unitEstado).toBe('available');
    expect(mockUpdateCleaning).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ct1' },
        data: expect.objectContaining({ estado: 'completed' }),
      })
    );
    expect(mockUpdateUnit).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { estado: 'available' } })
    );
  });

  it('dispara el push de disponibilidad tras cerrar el ciclo', async () => {
    await completeCleaningTask('t1', 'ct1');
    expect(mockDispatch).toHaveBeenCalledWith(
      't1',
      'p1',
      'unidad_cambiada',
      expect.objectContaining({ skipRates: true })
    );
  });

  it('unidad con reserva activa HOY → occupied (no sobrevender, §16)', async () => {
    mockFindReservation.mockResolvedValue({ id: 'r-active' });
    const result = await completeCleaningTask('t1', 'ct1');
    expect(result.ok).toBe(true);
    expect(result.unitEstado).toBe('occupied');
    expect(mockUpdateUnit).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { estado: 'occupied' } })
    );
  });

  it('tarea ya completada → idempotente, sin re-empujar', async () => {
    mockFindCleaning.mockResolvedValue({ ...CLEANING_TASK, estado: 'completed' });
    const result = await completeCleaningTask('t1', 'ct1');
    expect(result.ok).toBe(true);
    expect(mockUpdateCleaning).not.toHaveBeenCalled();
    expect(mockUpdateUnit).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('aislamiento: tarea de otro tenant → no encontrada', async () => {
    mockFindCleaning.mockResolvedValue(null);
    const result = await completeCleaningTask('t2', 'ct1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Tarea no encontrada');
    expect(mockUpdateCleaning).not.toHaveBeenCalled();
    expect(mockUpdateUnit).not.toHaveBeenCalled();
  });

  it('tarea sin unidad: completa sin tocar unidad y sin push', async () => {
    mockFindCleaning.mockResolvedValue({ id: 'ct1', tenantId: 't1', unitId: null, estado: 'pending', unit: null });
    const result = await completeCleaningTask('t1', 'ct1');
    expect(result.ok).toBe(true);
    expect(result.unitEstado).toBeUndefined();
    expect(mockUpdateUnit).not.toHaveBeenCalled();
  });

  it('los errores de push no rompen el cierre del ciclo', async () => {
    mockDispatch.mockRejectedValue(new Error('red caída'));
    const result = await completeCleaningTask('t1', 'ct1');
    expect(result.ok).toBe(true);
    expect(result.unitEstado).toBe('available');
  });

  it('aplica datos extra (notas/responsable) al completar', async () => {
    await completeCleaningTask('t1', 'ct1', { notas: 'Listo para huéspedes', responsable: 'Ana' });
    expect(mockUpdateCleaning).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'completed',
          notas: 'Listo para huéspedes',
          responsable: 'Ana',
        }),
      })
    );
  });
});