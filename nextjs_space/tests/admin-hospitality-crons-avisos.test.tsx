// @vitest-environment jsdom
//
// El panel de Hospitality (/admin/hospitality) que mira el equipo de operación.
//
// Aquí se vigila la pieza que este panel existe para dar: los partes que el
// barrido del registro de viajeros ya NO va a reintentar, **por tenant**, sin
// tener que entrar reserva a reserva. Va en ámbar porque el job ha ido bien: el
// abandono no es un fallo del cron, es trabajo que se ha quedado sin hacer.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import AdminHospitality from '@/app/admin/hospitality/page';

function montarFetch(jobs: unknown[]) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/api/cron-status')) {
      return { ok: true, json: async () => ({ jobs, processUptime: 60, processPid: 1234 }) };
    }
    if (String(url).includes('/api/admin/hospitality/holds')) {
      return {
        ok: true,
        json: async () => ({ desde: '2026-08-20', hasta: '2026-09-19', total: 0, tenants: [], generadoEn: '2026-09-19T10:00:00Z' }),
      };
    }
    throw new Error(`petición no esperada: ${url}`);
  });
}

const JOB_REGISTRO = {
  id: 'hospitality-registro-viajeros',
  label: 'Hospitality Registro de Viajeros (MIR)',
  schedule: '30 * * * *',
  lastRunAt: new Date().toISOString(),
  lastResult: 'success',
  lastMessage: '1 enviadas · 0 incompletas · 1 aceptadas · 0 anuladas · 3 sin reintentar',
  lastDurationMs: 1200,
  lastAvisos: [
    'Hotel Uno: 2 parte(s) sin reintentar — el barrido agotó sus 5 intentos y el Ministerio sigue sin aceptarlos',
    'Hotel Dos: 1 parte(s) sin reintentar — el barrido agotó sus 5 intentos y el Ministerio sigue sin aceptarlos',
  ],
};

describe('Panel de Hospitality: avisos de los crons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enseña, por tenant, los partes que el barrido ya no reintenta', async () => {
    global.fetch = montarFetch([JOB_REGISTRO]) as unknown as typeof fetch;

    render(<AdminHospitality />);

    expect(await screen.findByText(/Hotel Uno: 2 parte\(s\) sin reintentar/)).toBeTruthy();
    expect(screen.getByText(/Hotel Dos: 1 parte\(s\) sin reintentar/)).toBeTruthy();
    // El job sigue siendo un OK: el aviso no disfraza un fallo.
    expect(screen.getByText('OK')).toBeTruthy();
    // Y la línea del resumen tampoco lo esconde.
    expect(screen.getByText(/3 sin reintentar/)).toBeTruthy();
  });

  it('un job sin avisos no enseña ninguno', async () => {
    global.fetch = montarFetch([
      {
        ...JOB_REGISTRO,
        id: 'hospitality-holds-expirados',
        label: 'Hospitality Holds Caducados',
        lastMessage: '12 holds caducados en 3 tenants',
        lastAvisos: [],
      },
    ]) as unknown as typeof fetch;

    render(<AdminHospitality />);

    expect(await screen.findByText('Hospitality Holds Caducados')).toBeTruthy();
    expect(screen.getByText('12 holds caducados en 3 tenants')).toBeTruthy();
    // Sin avisos: ni una línea de aviso colgando del job de al lado.
    expect(screen.queryByText(/sin reintentar/)).toBeNull();
  });
});
