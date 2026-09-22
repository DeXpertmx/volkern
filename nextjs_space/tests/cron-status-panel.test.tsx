// @vitest-environment jsdom
//
// El panel de estado de crons (/admin/hospitality) y sus AVISOS.
//
// Lo que se vigila: un aviso del último resultado se ve aunque el job haya ido
// bien —que es el caso del registro de viajeros, que avisa de los partes que ya
// no se van a reintentar—, y un job sin avisos no arrastra los de nadie.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { CronStatusPanel } from '@/components/dashboard/CronStatusPanel';

/** Un job del panel, con lo que devuelve /api/cron-status. */
function job(extra: Record<string, unknown>) {
  return {
    id: 'hospitality-registro-viajeros',
    label: 'Hospitality Registro de Viajeros (MIR)',
    schedule: '30 * * * *',
    lastRunAt: new Date().toISOString(),
    lastResult: 'success',
    lastMessage: '1 enviadas · 0 incompletas · 1 aceptadas · 0 anuladas · 3 sin reintentar',
    lastDurationMs: 1200,
    lastAvisos: [],
    ...extra,
  };
}

function montarFetch(jobs: unknown[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ jobs, processUptime: 60, processPid: 1234 }),
  }));
}

describe('Panel de estado de crons: avisos del último resultado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enseña los avisos de un job que ha ido bien', async () => {
    global.fetch = montarFetch([
      job({
        lastAvisos: [
          'Hotel Uno: 2 parte(s) sin reintentar — el barrido agotó sus 5 intentos y el Ministerio sigue sin aceptarlos',
          'Hotel Dos: 1 parte(s) sin reintentar — el barrido agotó sus 5 intentos y el Ministerio sigue sin aceptarlos',
        ],
      }),
    ]) as unknown as typeof fetch;

    render(<CronStatusPanel />);

    expect(await screen.findByText(/Hotel Uno: 2 parte\(s\) sin reintentar/)).toBeTruthy();
    expect(screen.getByText(/Hotel Dos: 1 parte\(s\) sin reintentar/)).toBeTruthy();
    // No es un error del job: la fila sigue siendo un OK.
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('un job sin avisos no arrastra ninguno', async () => {
    global.fetch = montarFetch([job({ id: 'daily-mrr', label: 'Métricas SaaS diarias', lastAvisos: [] })]) as unknown as typeof fetch;

    render(<CronStatusPanel />);

    // El resumen se pinta solo en el job... salvo que sea un aviso: aquí no hay.
    await waitFor(() => expect(screen.getByText('Métricas SaaS diarias')).toBeTruthy());
    expect(screen.queryByText(/sin reintentar/)).toBeNull();
  });

  it('un mensaje de error se sigue viendo en rojo, sin avisos', async () => {
    global.fetch = montarFetch([
      job({ lastResult: 'error', lastMessage: 'servicio del Ministerio caído', lastAvisos: [] }),
    ]) as unknown as typeof fetch;

    render(<CronStatusPanel />);

    expect(await screen.findByText('servicio del Ministerio caído')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.queryByText(/sin reintentar/)).toBeNull();
  });
});
