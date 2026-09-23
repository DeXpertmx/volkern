// @vitest-environment node
//
// GUARDIA del bucle riesgo → roleplay (la primera prueba de la familia
// comercial, que llevaba CERO). Cubre las tres piezas del ciclo:
//
//   1. Módulo puro (lib/sales/training-gate.ts): qué abre la puerta, qué
//      puntuación la levanta, qué actividades son contacto bloqueable y la
//      gestión idempotente de la etiqueta en Deal.tags.
//   2. Servicio (lib/sales/training-gate-service.ts): abrirPuertas es
//      idempotente (no re-notifica ni re-emite), notifica solo con vendedor
//      asignado y lead, cierra al alcanzar el mínimo dejando rastro, y NO
//      cierra por debajo del umbral.
//   3. Vigilante (lib/sales/pipeline-watchdog.ts): tras recalcular salud,
//      abre puertas y lo reporta — el hueco que quedaba entre «saber» y
//      «hacer» del pipeline.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dealFindMany: vi.fn(),
  dealUpdate: vi.fn(),
  dealFindFirst: vi.fn(),
  dealFindUnique: vi.fn(),
  dealActivityCreate: vi.fn(),
  notifyUser: vi.fn(),
  notifyByTelegram: vi.fn(),
  emitEvent: vi.fn(),
  userFindUnique: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: {
      findMany: mocks.dealFindMany,
      update: mocks.dealUpdate,
      findFirst: mocks.dealFindFirst,
      findUnique: mocks.dealFindUnique,
    },
    dealActivity: { create: mocks.dealActivityCreate },
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyUser: mocks.notifyUser,
  notifyByTelegram: mocks.notifyByTelegram,
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: mocks.emitEvent },
  EVENTS: { TRAINING_REQUIRED: 'training_required', TRAINING_COMPLETED: 'training_completed' },
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

const { ETIQUETA_PUERTA, PUNTUACION_MINIMA } = await import('@/lib/sales/training-gate');

const DEAL_CRITICO = {
  id: 'deal-1',
  tenantId: 'tenant-1',
  titulo: 'Implementación ERP',
  valor: 12000,
  moneda: 'EUR',
  leadId: 'lead-1',
  healthScore: 38,
  healthStatus: 'CRITICAL',
  tags: 'ZOMBIE',
  usuarioAsignadoId: 'user-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dealUpdate.mockResolvedValue({});
  mocks.dealActivityCreate.mockResolvedValue({});
  mocks.notifyUser.mockResolvedValue({});
  mocks.notifyByTelegram.mockResolvedValue(undefined);
  mocks.dealFindUnique.mockResolvedValue({ titulo: 'Implementación ERP', usuarioAsignadoId: 'user-1' });
  mocks.userFindUnique.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
  mocks.getServerSession.mockResolvedValue({ user: { email: 'vendedor@empresa.test' } });
});

describe('Bucle riesgo → roleplay · módulo puro (training-gate)', () => {
  it('abre la puerta SOLO en CRITICAL — WARNING y ZOMBIE no la abren', async () => {
    const { debeAbrirPuerta } = await import('@/lib/sales/training-gate');
    expect(debeAbrirPuerta('CRITICAL')).toBe(true);
    expect(debeAbrirPuerta('WARNING')).toBe(false);
    expect(debeAbrirPuerta('ZOMBIE')).toBe(false);
    expect(debeAbrirPuerta('HEALTHY')).toBe(false);
    expect(debeAbrirPuerta(null)).toBe(false);
  });

  it('el umbral levanta la puerta exacto y con margen, nunca por debajo', async () => {
    const { levantaLaPuerta } = await import('@/lib/sales/training-gate');
    expect(PUNTUACION_MINIMA).toBe(70);
    expect(levantaLaPuerta(70)).toBe(true);
    expect(levantaLaPuerta(95)).toBe(true);
    expect(levantaLaPuerta(69)).toBe(false);
    expect(levantaLaPuerta(0)).toBe(false);
    expect(levantaLaPuerta(null)).toBe(false);
    expect(levantaLaPuerta(Number.NaN)).toBe(false);
  });

  it('llamada, email, reunión, cita e interacción SON contacto; nota, tarea, cotización y cambio de etapa NO', async () => {
    const { esContactoConCliente } = await import('@/lib/sales/training-gate');
    // canónicos del CRM
    expect(esContactoConCliente('actividad')).toBe(true);
    expect(esContactoConCliente('cita')).toBe(true);
    expect(esContactoConCliente('interaccion')).toBe(true);
    // los que envía el formulario de la ficha del deal
    expect(esContactoConCliente('llamada')).toBe(true);
    expect(esContactoConCliente('email')).toBe(true);
    expect(esContactoConCliente('reunion')).toBe(true);
    // interno
    expect(esContactoConCliente('nota')).toBe(false);
    expect(esContactoConCliente('tarea')).toBe(false);
    expect(esContactoConCliente('cotizacion')).toBe(false);
    expect(esContactoConCliente('cambio_etapa')).toBe(false);
    expect(esContactoConCliente('contrato')).toBe(false);
  });

  it('con la puerta activa se bloquea el contacto y se permite lo interno', async () => {
    const { actividadBloqueada } = await import('@/lib/sales/training-gate');
    expect(actividadBloqueada('actividad', true)).toBe(true);
    expect(actividadBloqueada('cita', true)).toBe(true);
    expect(actividadBloqueada('llamada', true)).toBe(true);
    expect(actividadBloqueada('email', true)).toBe(true);
    expect(actividadBloqueada('reunion', true)).toBe(true);
    expect(actividadBloqueada('nota', true)).toBe(false);
    expect(actividadBloqueada('cotizacion', true)).toBe(false);
    // sin puerta nada se bloquea, ni siquiera el contacto
    expect(actividadBloqueada('actividad', false)).toBe(false);
  });

  it('la etiqueta-puerta se activa sin duplicar y convive con las humanas', async () => {
    const { activarEtiqueta, puertaActivaEnEtiquetas } = await import('@/lib/sales/training-gate');
    expect(activarEtiqueta('ZOMBIE')).toBe(`ZOMBIE,${ETIQUETA_PUERTA}`);
    expect(activarEtiqueta(`ZOMBIE,${ETIQUETA_PUERTA}`)).toBe(`ZOMBIE,${ETIQUETA_PUERTA}`);
    expect(activarEtiqueta(null)).toBe(ETIQUETA_PUERTA);
    expect(activarEtiqueta('')).toBe(ETIQUETA_PUERTA);
    expect(puertaActivaEnEtiquetas(`HOT,${ETIQUETA_PUERTA}`)).toBe(true);
    expect(puertaActivaEnEtiquetas('HOT')).toBe(false);
    expect(puertaActivaEnEtiquetas(null)).toBe(false);
  });

  it('al desactivar, la etiqueta-puerta se quita y las demás se conservan', async () => {
    const { desactivarEtiqueta } = await import('@/lib/sales/training-gate');
    expect(desactivarEtiqueta(`ZOMBIE,${ETIQUETA_PUERTA}`)).toBe('ZOMBIE');
    expect(desactivarEtiqueta(ETIQUETA_PUERTA)).toBeNull();
    expect(desactivarEtiqueta('HOT,ZOMBIE')).toBe('HOT,ZOMBIE');
  });

  it('sin lead no hay encargo de práctica (no hay gemelo digital que armar)', async () => {
    const { encargoDePractica } = await import('@/lib/sales/training-gate');
    expect(encargoDePractica({ ...DEAL_CRITICO, leadId: null })).toBeNull();
    const encargo = encargoDePractica(DEAL_CRITICO);
    expect(encargo).not.toBeNull();
    expect(encargo!.motivo()).toContain('Implementación ERP');
    expect(encargo!.motivo()).toContain('38/100');
  });
});

describe('Bucle riesgo → roleplay · servicio (training-gate-service)', () => {
  it('abre la puerta en el deal crítico: etiqueta + notificación al vendedor + evento TRAINING_REQUIRED', async () => {
    mocks.dealFindMany.mockResolvedValue([DEAL_CRITICO]);
    const { TrainingGateService } = await import('@/lib/sales/training-gate-service');

    const res = await TrainingGateService.abrirPuertas('tenant-1');

    expect(res.abiertas).toBe(1);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: { tags: `ZOMBIE,${ETIQUETA_PUERTA}` },
      })
    );
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Practica'),
      expect.stringContaining('riesgo crítico'),
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'training_required',
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
  });

  it('es idempotente: un deal que YA tiene la puerta no se re-notifica ni re-emite', async () => {
    mocks.dealFindMany.mockResolvedValue([{ ...DEAL_CRITICO, tags: `HOT,${ETIQUETA_PUERTA}` }]);
    const { TrainingGateService } = await import('@/lib/sales/training-gate-service');

    const res = await TrainingGateService.abrirPuertas('tenant-1');

    expect(res.abiertas).toBe(0);
    expect(res.detalles).toEqual([{ dealId: 'deal-1', yaEstaba: true }]);
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('no notifica sin vendedor asignado (pero sí abre la puerta)', async () => {
    mocks.dealFindMany.mockResolvedValue([{ ...DEAL_CRITICO, usuarioAsignadoId: null }]);
    const { TrainingGateService } = await import('@/lib/sales/training-gate-service');

    const res = await TrainingGateService.abrirPuertas('tenant-1');

    expect(res.abiertas).toBe(1);
    expect(mocks.dealUpdate).toHaveBeenCalled();
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it('cierra la puerta al alcanzar el mínimo y deja rastro en la línea de tiempo', async () => {
    mocks.dealFindFirst.mockResolvedValue({
      id: 'deal-1',
      titulo: 'Implementación ERP',
      tags: `ZOMBIE,${ETIQUETA_PUERTA}`,
    });
    const { TrainingGateService } = await import('@/lib/sales/training-gate-service');

    const res = await TrainingGateService.cerrarPuertaSiAlcanza({
      tenantId: 'tenant-1',
      userId: 'user-1',
      leadId: 'lead-1',
      score: 78,
    });

    expect(res).toEqual({ cerrada: true, dealId: 'deal-1' });
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: 'ZOMBIE' } })
    );
    expect(mocks.dealActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: 'deal-1',
          tipo: 'nota',
          titulo: expect.stringContaining('78/100'),
        }),
      })
    );
  });

  it('NO cierra por debajo del mínimo — la puerta sigue cerrando el contacto', async () => {
    const { TrainingGateService } = await import('@/lib/sales/training-gate-service');

    const res = await TrainingGateService.cerrarPuertaSiAlcanza({
      tenantId: 'tenant-1',
      userId: 'user-1',
      leadId: 'lead-1',
      score: 55,
    });

    expect(res).toEqual({ cerrada: false, dealId: null });
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
  });

  it('sin puerta activa, cerrar no toca nada (idempotente)', async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: 'deal-1', titulo: 'X', tags: 'HOT' });
    const { TrainingGateService } = await import('@/lib/sales/training-gate-service');

    const res = await TrainingGateService.cerrarPuertaSiAlcanza({
      tenantId: 'tenant-1',
      userId: 'user-1',
      leadId: 'lead-1',
      score: 90,
    });

    expect(res).toEqual({ cerrada: false, dealId: 'deal-1' });
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
    expect(mocks.dealActivityCreate).not.toHaveBeenCalled();
  });
});

describe('Bucle riesgo → roleplay · vigilante (pipeline-watchdog)', () => {
  it('tras recalcular salud, abre puertas y reporta cuántas abrió', async () => {
    const syncSpy = vi
      .spyOn(
        (await import('@/lib/sales/pipeline-health-service')).PipelineHealthService,
        'syncPipelineHealth'
      )
      .mockResolvedValue([{ ...DEAL_CRITICO } as any]);
    mocks.dealFindMany.mockResolvedValue([{ ...DEAL_CRITICO }]);

    const { PipelineWatchdog } = await import('@/lib/sales/pipeline-watchdog');
    const res = await PipelineWatchdog.runWatchdog('tenant-1');

    expect(res.puertasAbiertas).toBe(1);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'deal-1' } })
    );
    syncSpy.mockRestore();
  });
});

describe('Bucle riesgo → roleplay · puerta en la API de actividades (POST /api/deals/[id]/activities)', () => {
  // La ruta lee `deal` (con tags y leadId) en su findFirst de autenticación.
  const dealConPuerta = { id: 'deal-1', leadId: 'lead-1', tags: `HOT,${ETIQUETA_PUERTA}` };
  const dealSinPuerta = { id: 'deal-1', leadId: 'lead-1', tags: 'HOT' };

  function peticion(tipo: string) {
    return new Request('http://localhost/api/deals/deal-1/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, titulo: 'Contacto comercial' }),
    });
  }

  async function importarRuta() {
    return await import('@/app/api/deals/[id]/activities/route');
  }

  it('423 en contacto con la puerta activa: llamada, cita e interacción, con código y enlace al simulador', async () => {
    const { POST } = await importarRuta();
    mocks.dealFindFirst.mockResolvedValue(dealConPuerta);

    for (const tipo of ['actividad', 'cita', 'interaccion', 'llamada', 'email', 'reunion']) {
      const res = await POST(peticion(tipo), { params: { id: 'deal-1' } } as any);

      expect(res.status).toBe(423);
      const cuerpo = await res.json();
      expect(cuerpo.codigo).toBe('PRACTICA_REQUERIDA');
      expect(cuerpo.error).toContain('práctica');
      // El 423 trae el camino al simulador con el lead del deal: el que
      // recibe el bloqueo sabe qué hacer, no solo que no puede.
      expect(cuerpo.simulador).toBe('/api/training/roleplay?leadId=lead-1');
    }
    // Bloqueado = nada escrito: ni actividad ni fecha de última actividad.
    expect(mocks.dealActivityCreate).not.toHaveBeenCalled();
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
  });

  it('201 en notas y tareas con la puerta activa: preparar la venta no se bloquea', async () => {
    const { POST } = await importarRuta();
    mocks.dealFindFirst.mockResolvedValue(dealConPuerta);
    mocks.dealActivityCreate.mockResolvedValue({ id: 'act-1' });

    for (const tipo of ['nota', 'tarea']) {
      const res = await POST(peticion(tipo), { params: { id: 'deal-1' } } as any);

      expect(res.status).toBe(201);
    }
    expect(mocks.dealActivityCreate).toHaveBeenCalledTimes(2);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({ numeroActividades: { increment: 1 } }),
      })
    );
  });

  it('sin puerta activa el contacto pasa: 201 sin tocar la puerta', async () => {
    const { POST } = await importarRuta();
    mocks.dealFindFirst.mockResolvedValue(dealSinPuerta);
    mocks.dealActivityCreate.mockResolvedValue({ id: 'act-2' });

    const res = await POST(peticion('actividad'), { params: { id: 'deal-1' } } as any);

    expect(res.status).toBe(201);
  });

  it('la decisión de bloqueo sale del módulo puro, no de una segunda opinión en la ruta', async () => {
    // La ruta no puede decidir por su cuenta: si deja de llamar a
    // actividadBloqueada/puertaActivaEnEtiquetas, la regla viviría en dos
    // sitios y este test lo destapa.
    const fs = await import('fs');
    const fuente = fs.readFileSync('app/api/deals/[id]/activities/route.ts', 'utf8');
    expect(fuente).toContain('actividadBloqueada(tipo, puertaActivaEnEtiquetas(deal.tags))');
  });
});
