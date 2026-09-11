import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Clave de idempotencia de las acciones de automatización.
 *
 * Debe identificar "esta acción sobre este ámbito": un evento repetido se
 * omite, pero dos acciones realmente distintas sobre la misma reserva no.
 */

const mockCreate = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    automationActionExecution: {
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));
vi.mock('../lib/db', () => ({
  prisma: {
    automationActionExecution: {
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));

import {
  buildActionKey,
  resolveActionScope,
  actionVariant,
  claimActionExecution,
  completeActionExecution,
  releaseActionExecution,
} from '../lib/marketing/automation/action-idempotency';

describe('buildActionKey', () => {
  it('identifica la reserva por delante de la unidad', () => {
    const built = buildActionKey(
      { type: 'CREATE_HOSPITALITY_CLEANING', priority: 'alta' },
      { reservationId: 'hres_1', unitId: 'hunit_1' }
    );

    expect(built?.scope).toEqual({ type: 'reservation', id: 'hres_1' });
    expect(built?.key).toBe('CREATE_HOSPITALITY_CLEANING|reservation:hres_1|limpieza#alta');
  });

  it('usa la tarea como ámbito cuando el evento no trae reserva (limpieza completada)', () => {
    const built = buildActionKey(
      { type: 'SET_UNIT_STATUS', status: 'available' },
      { taskId: 'htask_1', unitId: 'hunit_2' }
    );

    expect(built?.scope).toEqual({ type: 'task', id: 'htask_1' });
    expect(built?.key).toBe('SET_UNIT_STATUS|task:htask_1|available');
  });

  it('no deduplica acciones fuera de la lista ni eventos sin ámbito', () => {
    expect(buildActionKey({ type: 'CREATE_CRM_TASK' }, { leadId: 'lead1' })).toBeNull();
    expect(buildActionKey({ type: 'NOTIFY_GEMMA' }, { leadId: 'lead1' })).toBeNull();
    expect(buildActionKey({ type: 'CREATE_HOSPITALITY_TASK' }, { tenantId: 't1' })).toBeNull();
  });

  it('distingue dos tareas distintas de la misma reserva', () => {
    const a = buildActionKey(
      { type: 'CREATE_HOSPITALITY_TASK', taskType: 'PREPARACION', title: 'Preparar estancia' },
      { reservationId: 'hres_1' }
    );
    const b = buildActionKey(
      { type: 'CREATE_HOSPITALITY_TASK', taskType: 'LLAVES', title: 'Entregar llaves' },
      { reservationId: 'hres_1' }
    );

    expect(a?.key).not.toBe(b?.key);
  });

  it('distingue dos mensajes distintos de la misma reserva', () => {
    const confirmacion = buildActionKey(
      { type: 'SEND_GUEST_MESSAGE', evento: 'confirmacion' },
      { reservationId: 'hres_1' }
    );
    const resena = buildActionKey(
      { type: 'SEND_GUEST_MESSAGE', evento: 'resena' },
      { reservationId: 'hres_1' }
    );

    expect(confirmacion?.key).toBe('SEND_GUEST_MESSAGE|reservation:hres_1|confirmacion');
    expect(confirmacion?.key).not.toBe(resena?.key);
  });

  it('es estable: el mismo evento produce siempre la misma clave', () => {
    const payload = { reservationId: 'hres_9', unitId: 'hunit_9' };
    const action = { type: 'CREATE_HOSPITALITY_TASK', taskType: 'PREPARACION', title: 'Preparar estancia' };
    expect(buildActionKey(action, payload)?.key).toBe(buildActionKey(action, payload)?.key);
  });
});

describe('resolveActionScope / actionVariant', () => {
  it('resuelve ámbitos del CRM como último recurso', () => {
    expect(resolveActionScope({ leadId: 'lead1' })).toEqual({ type: 'lead', id: 'lead1' });
    expect(resolveActionScope({ contactId: 'c1' })).toEqual({ type: 'contact', id: 'c1' });
    expect(resolveActionScope({ dealId: 'd1' })).toEqual({ type: 'deal', id: 'd1' });
    expect(resolveActionScope({ tenantId: 't1' })).toBeNull();
  });

  it('usa valores por defecto cuando la acción no los trae', () => {
    expect(actionVariant({ type: 'CREATE_HOSPITALITY_TASK' })).toBe('PREPARACION#');
    expect(actionVariant({ type: 'SEND_GUEST_MESSAGE' })).toBe('confirmacion');
    expect(actionVariant({ type: 'SET_UNIT_STATUS' })).toBe('available');
    expect(actionVariant({ type: 'DESCONOCIDA' })).toBe('default');
  });
});

describe('claimActionExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reclama cuando la clave no existía', async () => {
    mockCreate.mockResolvedValue({ id: 'claim1' });

    const res = await claimActionExecution({
      tenantId: 't1',
      key: 'k1',
      actionType: 'CREATE_HOSPITALITY_TASK',
      scope: { type: 'reservation', id: 'hres_1' },
    });

    expect(res).toEqual({ status: 'claimed', claimId: 'claim1' });
  });

  it('devuelve duplicado con el artefacto previo si la clave ya existe', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    mockFindUnique.mockResolvedValue({ id: 'claim0', entityId: 'task-previo', estado: 'done', jobId: 'job-viejo' });

    const res = await claimActionExecution({
      tenantId: 't1',
      key: 'k1',
      actionType: 'CREATE_HOSPITALITY_TASK',
      scope: { type: 'reservation', id: 'hres_1' },
      jobId: 'job-nuevo',
    });

    expect(res).toEqual({ status: 'duplicate', entityId: 'task-previo' });
  });

  it('recupera la reclamación si el MISMO job vuelve (el worker murió a mitad)', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    mockFindUnique.mockResolvedValue({ id: 'claim0', entityId: null, estado: 'claimed', jobId: 'job-7' });
    mockUpdate.mockResolvedValue({});

    const res = await claimActionExecution({
      tenantId: 't1',
      key: 'k1',
      actionType: 'CREATE_HOSPITALITY_TASK',
      scope: { type: 'reservation', id: 'hres_1' },
      jobId: 'job-7',
    });

    expect(res).toEqual({ status: 'claimed', claimId: 'claim0' });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'claim0' },
      data: { createdAt: expect.any(Date) },
    });
  });

  it('no recupera la reclamación de otro job ni la ya completada', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    mockFindUnique.mockResolvedValueOnce({ id: 'c', entityId: null, estado: 'claimed', jobId: 'otro-job' });
    const otroJob = await claimActionExecution({
      tenantId: 't1',
      key: 'k1',
      actionType: 'CREATE_HOSPITALITY_TASK',
      scope: { type: 'reservation', id: 'hres_1' },
      jobId: 'job-7',
    });
    expect(otroJob).toEqual({ status: 'duplicate', entityId: null });

    mockFindUnique.mockResolvedValueOnce({ id: 'c', entityId: 'task1', estado: 'done', jobId: 'job-7' });
    const yaCompletada = await claimActionExecution({
      tenantId: 't1',
      key: 'k1',
      actionType: 'CREATE_HOSPITALITY_TASK',
      scope: { type: 'reservation', id: 'hres_1' },
      jobId: 'job-7',
    });
    expect(yaCompletada).toEqual({ status: 'duplicate', entityId: 'task1' });
  });

  it('fail-open (unavailable) si el registro no está disponible', async () => {
    mockCreate.mockRejectedValue(new Error('tabla ausente'));

    const res = await claimActionExecution({
      tenantId: 't1',
      key: 'k1',
      actionType: 'CREATE_HOSPITALITY_TASK',
      scope: { type: 'reservation', id: 'hres_1' },
    });

    expect(res).toEqual({ status: 'unavailable' });
  });
});

describe('completeActionExecution / releaseActionExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
  });

  it('cierra la reclamación guardando el artefacto', async () => {
    await completeActionExecution('claim1', 'task1');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'claim1' },
      data: { estado: 'done', entityId: 'task1' },
    });
  });

  it('libera la reclamación cuando la acción falla', async () => {
    await releaseActionExecution('claim1');

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'claim1' } });
  });

  it('un fallo al cerrar o liberar no lanza excepción', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('db caída'));
    mockDelete.mockRejectedValueOnce(new Error('db caída'));

    await expect(completeActionExecution('claim1', 'task1')).resolves.toBeUndefined();
    await expect(releaseActionExecution('claim1')).resolves.toBeUndefined();
  });
});
