import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Resultado real de las acciones del Automation Engine.
 *
 * El motor encolaba las acciones y registraba `success` en ese momento; si
 * luego una acción fallaba, el log seguía diciendo `success`. Ahora el
 * worker es el único que escribe el desenlace: por acción y con su causa.
 */

const mockTaskCreate = vi.hoisted(() => vi.fn());
const mockCleaningCreate = vi.hoisted(() => vi.fn());
const mockUnitUpdate = vi.hoisted(() => vi.fn());
const mockCampaignRecipientCreate = vi.hoisted(() => vi.fn());
const mockLogUpdate = vi.hoisted(() => vi.fn());
const mockInitRedis = vi.hoisted(() => vi.fn());
const mockClaimCreate = vi.hoisted(() => vi.fn());
const mockClaimFindUnique = vi.hoisted(() => vi.fn());
const mockClaimUpdate = vi.hoisted(() => vi.fn());
const mockClaimDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    task: { create: mockTaskCreate },
    hospitalityCleaningTask: { create: mockCleaningCreate },
    hospitalityUnit: { update: mockUnitUpdate },
    campaignRecipient: { create: mockCampaignRecipientCreate },
    automationLog: { update: mockLogUpdate },
    automationActionExecution: {
      create: mockClaimCreate,
      findUnique: mockClaimFindUnique,
      update: mockClaimUpdate,
      delete: mockClaimDelete,
    },
  },
}));
vi.mock('../lib/db', () => ({
  prisma: {
    task: { create: mockTaskCreate },
    hospitalityCleaningTask: { create: mockCleaningCreate },
    hospitalityUnit: { update: mockUnitUpdate },
    campaignRecipient: { create: mockCampaignRecipientCreate },
    automationLog: { update: mockLogUpdate },
    automationActionExecution: {
      create: mockClaimCreate,
      findUnique: mockClaimFindUnique,
      update: mockClaimUpdate,
      delete: mockClaimDelete,
    },
  },
}));
vi.mock('../lib/core/redis', () => ({ initRedis: mockInitRedis }));
vi.mock('../lib/marketing/social-media-service', () => ({
  SocialMediaService: { schedulePost: vi.fn() },
}));

import { processWorkflowJob } from '../lib/marketing/automation/workflow-worker';

const JOB = {
  ruleId: 'ar1',
  tenantId: 't1',
  logId: 'log1',
  payload: { tenantId: 't1', reservationId: 'hres_1', unitId: 'hunit_1', reservation: {} },
};

/** Datos del último update sobre el log (el que cierra la ejecución). */
const ultimoUpdate = () => mockLogUpdate.mock.calls.at(-1)![0];

describe('processWorkflowJob — registro del resultado real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogUpdate.mockResolvedValue({});
    mockTaskCreate.mockResolvedValue({ id: 'task1' });
    mockCleaningCreate.mockResolvedValue({ id: 'clean1' });
    mockUnitUpdate.mockResolvedValue({});
    // Por defecto la reclamación de idempotencia siempre se concede.
    mockClaimCreate.mockResolvedValue({ id: 'claim1' });
    mockClaimUpdate.mockResolvedValue({});
    mockClaimDelete.mockResolvedValue({});
  });

  it('marca success y guarda el detalle por acción cuando todo va bien', async () => {
    const summary = await processWorkflowJob({
      ...JOB,
      actions: [{ type: 'CREATE_HOSPITALITY_TASK', title: 'Preparar estancia' }],
    });

    expect(summary.status).toBe('success');
    expect(mockTaskCreate).toHaveBeenCalledTimes(1);

    // Primero se marca `running`, y al cerrar queda el estado real.
    expect(mockLogUpdate.mock.calls[0][0].data.status).toBe('running');

    const cierre = ultimoUpdate();
    expect(cierre.where).toEqual({ id: 'log1' });
    expect(cierre.data.status).toBe('success');
    expect(cierre.data.error).toBeNull();
    expect(cierre.data.result.actions[0].status).toBe('success');
    expect(typeof cierre.data.result.durationMs).toBe('number');
    expect(cierre.data.result.finishedAt).toBeTruthy();
  });

  it('marca failed con la causa cuando la acción falla', async () => {
    // CREATE_HOSPITALITY_CLEANING exige unitId en el payload.
    const summary = await processWorkflowJob({
      ...JOB,
      payload: { tenantId: 't1', reservationId: 'hres_1' },
      actions: [{ type: 'CREATE_HOSPITALITY_CLEANING' }],
    });

    expect(summary.status).toBe('failed');
    expect(summary.error).toMatch(/unitId/);

    const cierre = ultimoUpdate();
    expect(cierre.data.status).toBe('failed');
    expect(String(cierre.data.error)).toMatch(/unitId/);
    expect(cierre.data.result.actions[0].status).toBe('failed');
  });

  it('marca partial cuando solo parte de las acciones falla', async () => {
    const summary = await processWorkflowJob({
      ...JOB,
      payload: { tenantId: 't1', reservationId: 'hres_1' },
      actions: [
        { type: 'CREATE_HOSPITALITY_TASK' },
        { type: 'SET_UNIT_STATUS' }, // sin unitId → falla
      ],
    });

    expect(summary.status).toBe('partial');
    const cierre = ultimoUpdate();
    expect(cierre.data.status).toBe('partial');
    expect(cierre.data.result.actions.map((a: any) => a.status)).toEqual(['success', 'failed']);
  });

  it('registra failed si el tipo de acción no existe (antes se ignoraba en silencio)', async () => {
    const summary = await processWorkflowJob({
      ...JOB,
      actions: [{ type: 'ACCION_INEXISTENTE' }],
    });

    expect(summary.status).toBe('failed');
    expect(summary.error).toMatch(/desconocido/i);
    expect(ultimoUpdate().data.status).toBe('failed');
  });

  it('sin logId ejecuta las acciones pero no intenta actualizar el log', async () => {
    const summary = await processWorkflowJob({
      ...JOB,
      logId: undefined,
      actions: [{ type: 'CREATE_HOSPITALITY_TASK' }],
    });

    expect(summary.status).toBe('success');
    expect(mockLogUpdate).not.toHaveBeenCalled();
  });

  it('un fallo de la acción no relanza el error (evita reintentos duplicadores)', async () => {
    await expect(
      processWorkflowJob({
        ...JOB,
        actions: [{ type: 'CREATE_HOSPITALITY_CLEANING' }],
        payload: { tenantId: 't1' },
      })
    ).resolves.toMatchObject({ status: 'failed' });
  });
});

describe('processWorkflowJob — idempotencia por reserva y tipo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogUpdate.mockResolvedValue({});
    mockTaskCreate.mockResolvedValue({ id: 'task1' });
    mockCleaningCreate.mockResolvedValue({ id: 'clean1' });
    mockClaimCreate.mockResolvedValue({ id: 'claim1' });
    mockClaimUpdate.mockResolvedValue({});
    mockClaimDelete.mockResolvedValue({});
  });

  const reclamacionDuplicada = () => Object.assign(new Error('Unique constraint'), { code: 'P2002' });

  const TAREA = { type: 'CREATE_HOSPITALITY_TASK', taskType: 'PREPARACION', title: 'Preparar estancia' };
  const LIMPIEZA = { type: 'CREATE_HOSPITALITY_CLEANING' };

  it('no crea una segunda tarea cuando el evento se repite', async () => {
    mockClaimCreate.mockRejectedValueOnce(reclamacionDuplicada());
    mockClaimFindUnique.mockResolvedValue({ id: 'claim0', entityId: 'task-previa', estado: 'done', jobId: 'job0' });

    const summary = await processWorkflowJob({ ...JOB, actions: [TAREA] });

    expect(mockTaskCreate).not.toHaveBeenCalled();
    expect(summary.status).toBe('success');
    expect(summary.outcomes[0]).toMatchObject({ status: 'skipped', entityId: 'task-previa' });
    expect(summary.outcomes[0].reason).toMatch(/ya se había ejecutado/i);
  });

  it('no crea una segunda limpieza cuando el evento se repite', async () => {
    mockClaimCreate.mockRejectedValueOnce(reclamacionDuplicada());
    mockClaimFindUnique.mockResolvedValue({ id: 'claim0', entityId: 'clean-previa', estado: 'done', jobId: 'job0' });

    await processWorkflowJob({ ...JOB, actions: [LIMPIEZA] });

    expect(mockCleaningCreate).not.toHaveBeenCalled();
  });

  it('reclama con la clave reserva+tipo+variante y la cierra con el artefacto creado', async () => {
    await processWorkflowJob({ ...JOB, actions: [TAREA] });

    const reclamacion = mockClaimCreate.mock.calls[0][0].data;
    expect(reclamacion.key).toBe('CREATE_HOSPITALITY_TASK|reservation:hres_1|PREPARACION#Preparar estancia');
    expect(reclamacion.scopeType).toBe('reservation');
    expect(reclamacion.scopeId).toBe('hres_1');
    expect(mockClaimUpdate).toHaveBeenCalledWith({
      where: { id: 'claim1' },
      data: { estado: 'done', entityId: 'task1' },
    });
  });

  it('libera la reclamación si la acción falla, para que un intento posterior sí la ejecute', async () => {
    // Falla por falta de unitId, pero el ámbito (reserva) sí existe.
    await processWorkflowJob({ ...JOB, payload: { tenantId: 't1', reservationId: 'hres_1' }, actions: [LIMPIEZA] });

    expect(mockClaimCreate).toHaveBeenCalledTimes(1);
    expect(mockClaimDelete).toHaveBeenCalledWith({ where: { id: 'claim1' } });
    expect(mockClaimUpdate).not.toHaveBeenCalled();
  });

  it('dos acciones distintas sobre la misma reserva usan claves distintas', async () => {
    await processWorkflowJob({
      ...JOB,
      actions: [TAREA, { type: 'CREATE_HOSPITALITY_TASK', taskType: 'LLAVES', title: 'Entregar llaves' }],
    });

    const claves = mockClaimCreate.mock.calls.map((c) => c[0].data.key);
    expect(claves).toHaveLength(2);
    expect(claves[0]).not.toBe(claves[1]);
    expect(mockTaskCreate).toHaveBeenCalledTimes(2);
  });

  it('no intenta deduplicar acciones sin ámbito (sin reserva, tarea ni unidad)', async () => {
    await processWorkflowJob({
      ...JOB,
      payload: { tenantId: 't1' },
      actions: [{ type: 'CREATE_HOSPITALITY_TASK', taskType: 'PREPARACION', title: 'Tarea suelta' }],
    });

    expect(mockClaimCreate).not.toHaveBeenCalled();
    expect(mockTaskCreate).toHaveBeenCalledTimes(1);
  });

  it('pasa el job al registro para que un reintento del mismo job no pierda el trabajo', async () => {
    await processWorkflowJob({ ...JOB, jobId: 'job-7', actions: [TAREA] });

    expect(mockClaimCreate.mock.calls[0][0].data.jobId).toBe('job-7');
  });

  it('si el registro de idempotencia no está disponible ejecuta igual (fail-open)', async () => {
    mockClaimCreate.mockRejectedValueOnce(new Error('tabla ausente'));

    const summary = await processWorkflowJob({ ...JOB, actions: [TAREA] });

    expect(summary.status).toBe('success');
    expect(mockTaskCreate).toHaveBeenCalledTimes(1);
  });
});
