// @vitest-environment node
//
// Guardia de la RUTA del cron del registro de viajeros y de su registro en el
// panel de estado (`/api/cron-status`, que pinta /admin/hospitality).
//
// Se vigilan tres cosas:
//   1. La respuesta HTTP del disparador (200 con resumen, 500 si el barrido
//      devuelve error).
//   2. Que la ejecución QUEDE en el store de estado: si no, el panel no la
//      muestra y el cumplimiento del plazo de 24 h solo quedaría en el log.
//   3. Que el scheduler registre el MISMO job (id, etiqueta y cadencia), porque
//      el panel cruza los dos registros.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const __mockScan = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/cron/hospitality-registro-viajeros', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/cron/hospitality-registro-viajeros')>();
  return { ...actual, runRegistroViajerosScan: (...a: unknown[]) => __mockScan(...a) };
});

import { GET } from '@/app/api/cron/hospitality-registro-viajeros/route';
import { getCronStatus } from '@/lib/cron/cron-status';
import {
  JOB_ID_REGISTRO_VIAJEROS,
  JOB_LABEL_REGISTRO_VIAJEROS,
  JOB_SCHEDULE_REGISTRO_VIAJEROS,
} from '../lib/cron/hospitality-registro-viajeros';

const RAIZ = path.resolve(__dirname, '..');
const URL_CRON = 'http://localhost:3098/api/cron/hospitality-registro-viajeros';

function resumen(overrides: Record<string, unknown> = {}) {
  return {
    tenants: 1,
    candidatas: 3,
    enviadas: 2,
    aceptadasAlConsultar: 1,
    rechazadas: 0,
    datosIncompletos: 1,
    anuladas: 1,
    abandonados: 0,
    abandonadosPorTenant: [],
    errores: 0,
    ...overrides,
  };
}

describe('GET /api/cron/hospitality-registro-viajeros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('una ejecución en verde responde 200 y se registra en el panel', async () => {
    __mockScan.mockResolvedValue(resumen());

    const res = await GET(new NextRequest(URL_CRON));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.enviadas).toBe(2);

    const estado = getCronStatus(JOB_ID_REGISTRO_VIAJEROS);
    expect(estado?.lastResult).toBe('success');
    expect(estado?.lastRunAt).not.toBeNull();
    expect(estado?.lastMessage).toContain('2 enviadas');
    expect(typeof estado?.lastDurationMs).toBe('number');
    // El registro lleva el nombre y la cadencia que pinta el panel.
    expect(estado?.label).toBe(JOB_LABEL_REGISTRO_VIAJEROS);
    expect(estado?.schedule).toBe(JOB_SCHEDULE_REGISTRO_VIAJEROS);
  });

  it('los partes que el barrido ya no reintenta quedan como aviso del panel', async () => {
    __mockScan.mockResolvedValue(
      resumen({
        abandonados: 3,
        abandonadosPorTenant: [
          { tenantId: 't1', nombre: 'Hotel Uno', partes: 2 },
          { tenantId: 't2', nombre: 'Hotel Dos', partes: 1 },
        ],
      })
    );

    const res = await GET(new NextRequest(URL_CRON));
    expect(res.status).toBe(200);

    const estado = getCronStatus(JOB_ID_REGISTRO_VIAJEROS);
    // La pasada ha ido BIEN: el abandono no es un fallo del job, es algo que
    // alguien tiene que mirar. Por eso va en avisos y no en el mensaje de error.
    expect(estado?.lastResult).toBe('success');
    expect(estado?.lastAvisos).toHaveLength(2);
    expect(estado?.lastAvisos?.[0]).toContain('Hotel Uno')
    expect(estado?.lastAvisos?.[0]).toContain('2 parte(s) sin reintentar')
    expect(estado?.lastAvisos?.[1]).toContain('Hotel Dos')
    // Y el resumen de la línea tampoco lo esconde.
    expect(estado?.lastMessage).toContain('3 sin reintentar')
  });

  it('sin partes abandonados no deja ningún aviso colgando', async () => {
    __mockScan.mockResolvedValue(resumen());

    await GET(new NextRequest(URL_CRON));

    expect(getCronStatus(JOB_ID_REGISTRO_VIAJEROS)?.lastAvisos).toEqual([])
  });

  it('un barrido con error responde 500 y deja el estado en error', async () => {
    __mockScan.mockResolvedValue(resumen({ enviadas: 0, error: 'servicio del Ministerio caído' }));

    const res = await GET(new NextRequest(URL_CRON));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(getCronStatus(JOB_ID_REGISTRO_VIAJEROS)?.lastResult).toBe('error');
    expect(getCronStatus(JOB_ID_REGISTRO_VIAJEROS)?.lastMessage).toBe('servicio del Ministerio caído');
  });

  it('el scheduler registra el MISMO job (id, etiqueta y cadencia del módulo)', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/cron/scheduler.ts'), 'utf8');
    expect(fuente).toContain(`'${JOB_ID_REGISTRO_VIAJEROS}'`);
    expect(fuente).toContain(`'${JOB_LABEL_REGISTRO_VIAJEROS}'`);
    expect(fuente).toContain(`'${JOB_SCHEDULE_REGISTRO_VIAJEROS}'`);
    // Y lo ejecuta por su función de barrido, no reimplementando nada.
    expect(fuente).toContain('runRegistroViajerosScan');
    // Y publica en el panel el MISMO resumen y los MISMOS avisos que el disparo
    // por HTTP: si no, el panel contaría una cosa u otra según quién lanzara el
    // job, que es justo lo que no puede pasar.
    expect(fuente).toContain('resumenDelBarrido');
    expect(fuente).toContain('avisosDelBarrido');
  });

  it('la cadencia cumple el plazo de 24 h del RD 933/2021', () => {
    // Horario fijo de una vez por hora: entre dos pasadas nunca pasan más de
    // 60 minutos, muy por debajo del plazo máximo legal.
    expect(JOB_SCHEDULE_REGISTRO_VIAJEROS).toBe('30 * * * *');
  });
});
