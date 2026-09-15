// @vitest-environment jsdom

/**
 * La interfaz no ofrece lo que el rol no puede hacer.
 *
 * La guardia estática comprueba que toda acción mutante pasa por
 * `<AccionHospitality>`; esta prueba comprueba que la decisión es la correcta:
 * con permiso se ve el botón, sin permiso no se ve, y mientras el rol se está
 * resolviendo tampoco —es preferible que una acción tarde una fracción de
 * segundo en aparecer a que aparezca y desaparezca, o a que alguien pulse algo
 * que su rol no tiene—.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { olvidarRolCacheado } from '@/hooks/use-capacidades-hospitality';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Un rol con las claves que el editor de roles concede. */
function rolCon(permisos: Record<string, unknown>) {
  return { id: 'rol-1', nombre: 'Rol de prueba', permisos };
}

function responderConRol(rol: unknown) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/users/me')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ role: rol }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function montar() {
  return render(
    React.createElement(
      'div',
      null,
      React.createElement(
        AccionHospitality,
        { capacidad: 'reservas.cancelar' },
        React.createElement('button', null, 'Cancelar reserva')
      ),
      React.createElement(
        AccionHospitality,
        { capacidad: 'operaciones.gestionar' },
        React.createElement('button', null, 'Crear limpieza')
      )
    )
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  olvidarRolCacheado();
});

afterEach(() => {
  cleanup();
});

describe('las acciones de Hospitality se muestran solo si el rol puede', () => {
  it('con el permiso concedido, la acción está', async () => {
    responderConRol(
      rolCon({ hospitality_reservas: { ver: true, cancelar: true }, hospitality_operaciones: { gestionar: true } })
    );
    montar();
    expect(await screen.findByText('Cancelar reserva')).toBeTruthy();
    expect(screen.getByText('Crear limpieza')).toBeTruthy();
  });

  it('sin el permiso, la acción no aparece', async () => {
    responderConRol(
      rolCon({ hospitality_reservas: { ver: true, editar: true }, hospitality_operaciones: { ver: true } })
    );
    montar();
    // Se espera a que el rol se resuelva para no confundir "oculto" con "cargando".
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText('Cancelar reserva')).toBeNull();
      expect(screen.queryByText('Crear limpieza')).toBeNull();
    });
  });

  it('cancelar no es editar: quien corrige una reserva no puede anularla', async () => {
    responderConRol(rolCon({ hospitality_reservas: { ver: true, editar: true } }));
    montar();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText('Cancelar reserva')).toBeNull();
  });

  it('sin rol no se ofrece nada', async () => {
    responderConRol(null);
    montar();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText('Cancelar reserva')).toBeNull();
    expect(screen.queryByText('Crear limpieza')).toBeNull();
  });

  it('el comodín del administrador lo puede todo', async () => {
    responderConRol(rolCon({ all: true }));
    montar();
    expect(await screen.findByText('Cancelar reserva')).toBeTruthy();
    expect(screen.getByText('Crear limpieza')).toBeTruthy();
  });

  it('el Superadmin lo puede todo aunque su rol no traiga claves', async () => {
    responderConRol({ id: 'rol-2', nombre: 'Superadmin', permisos: {} });
    montar();
    expect(await screen.findByText('Cancelar reserva')).toBeTruthy();
  });
});
