// @vitest-environment node
//
// Guardia de la RUTA del cron de holds caducados y de su registro en el panel
// de estado (`/api/cron-status`, que pinta /admin/hospitality).
//
// Dos cosas se vigilan aquí:
//   1. La respuesta HTTP del disparador (200 con resumen, 500 si el barrido
//      devuelve error).
//   2. Que la ejecución QUEDE en el store de estado — si no, el panel no la
//      muestra nunca y solo quedaría el log.
// Y una tercera de coherencia: el id/etiqueta/cadencia que usa el scheduler
// deben ser los mismos que los del módulo (si no, el panel cruzaría registros
// distintos y el job desaparecería de la vista).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const __mockScan = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/hospitality/sync', () => ({ dispatchConnectivityPush: vi.fn() }));
vi.mock('@/lib/hospitality/events', () => ({ emitReservationCancelled: vi.fn() }));
vi.mock('@/lib/cron/hospitality-holds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cron/hospitality-holds')>();
  return { ...actual, runHospitalityHoldExpiryScan: (...a: any[]) => __mockScan(...a) };
});

import { GET } from '@/app/api/cron/hospitality-holds-expirados/route';
import { getCronStatus } from '@/lib/cron/cron-status';
import {
  JOB_ID_HOLDS_CADUCADOS,
  JOB_LABEL_HOLDS_CADUCADOS,
  JOB_SCHEDULE_HOLDS_CADUCADOS,
} from '../lib/cron/hospitality-holds';

const RAIZ = path.resolve(__dirname, '..');
const URL_CRON = 'http://localhost:3098/api/cron/hospitality-holds-expirados';

function resumen(overrides: Record<string, unknown> = {}) {
  return {
    total: 3,
    caducados: 2,
    omitidos: 1,
    sinCaducidad: 0,
    pushes: 1,
    errores: 0,
    ...overrides,
  };
}

describe('GET /api/cron/hospitality-holds-expirados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('una ejecución en verde responde 200 y se registra en el panel', async () => {
    __mockScan.mockResolvedValue(resumen());

    const res = await GET(new NextRequest(URL_CRON));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.caducados).toBe(2);

    const estado = getCronStatus(JOB_ID_HOLDS_CADUCADOS);
    expect(estado?.lastResult).toBe('success');
    expect(estado?.lastRunAt).not.toBeNull();
    expect(estado?.lastMessage).toContain('2 caducados');
    expect(typeof estado?.lastDurationMs).toBe('number');
    // El registro lleva el nombre y la cadencia que pinta el panel.
    expect(estado?.label).toBe(JOB_LABEL_HOLDS_CADUCADOS);
    expect(estado?.schedule).toBe(JOB_SCHEDULE_HOLDS_CADUCADOS);
  });

  it('un barrido con error responde 500 y deja el estado en error', async () => {
    __mockScan.mockResolvedValue(resumen({ caducados: 0, error: 'conexión caída' }));

    const res = await GET(new NextRequest(URL_CRON));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(getCronStatus(JOB_ID_HOLDS_CADUCADOS)?.lastResult).toBe('error');
    expect(getCronStatus(JOB_ID_HOLDS_CADUCADOS)?.lastMessage).toBe('conexión caída');
  });

  it('el scheduler registra el MISMO job (id, etiqueta y cadencia del módulo)', () => {
    // Si alguien renombra el job en un sitio y no en el otro, el panel de
    // /admin/hospitality dejaría de verlo: este test lo reprocha.
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/cron/scheduler.ts'), 'utf8');
    expect(fuente).toContain(`'${JOB_ID_HOLDS_CADUCADOS}'`);
    expect(fuente).toContain(`'${JOB_LABEL_HOLDS_CADUCADOS}'`);
    expect(fuente).toContain(`'${JOB_SCHEDULE_HOLDS_CADUCADOS}'`);
    // Y lo ejecuta por su función de barrido, no reimplementando nada.
    expect(fuente).toContain('runHospitalityHoldExpiryScan');
  });
});
