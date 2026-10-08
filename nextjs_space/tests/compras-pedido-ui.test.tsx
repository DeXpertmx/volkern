// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PedidosCompraPage from '@/app/dashboard/compras/page';

/**
 * Alta de un pedido desde la pantalla, no desde el servicio.
 *
 * Comprueba lo que hace el operador: abrir el formulario, escribir una línea y
 * que lo que sale por la red sea el pedido con sus importes —y que las
 * sugerencias de stock entren como líneas reales, que es lo que promete el
 * botón del hub de inventario.
 */

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard/compras',
}));

const fetchMock = vi.fn();

function respuesta(cuerpo: any, ok = true) {
  return { ok, json: async () => cuerpo };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string, opciones?: any) => {
    if (url === '/api/compras' && opciones?.method === 'POST') {
      return respuesta({ ok: true, compra: { id: 'c1', numero: 'OC-2026-0001' } });
    }
    if (url.startsWith('/api/compras/sugerencias')) {
      return respuesta({
        total: 1,
        sugerencias: [
          {
            catalogoItemId: 'i1',
            nombre: 'Café en grano',
            cantidadSugerida: 5,
            precioUnitario: 3.5,
            almacenId: 'a1',
          },
        ],
      });
    }
    if (url.startsWith('/api/compras')) return respuesta({ compras: [], total: 0 });
    if (url.startsWith('/api/erp/suppliers')) return respuesta([{ id: 'p1', name: 'Distribuciones Sur' }]);
    if (url.startsWith('/api/erp/warehouses')) return respuesta([{ id: 'a1', name: 'Almacén Central' }]);
    if (url.startsWith('/api/catalogo')) return respuesta({ items: [] });
    return respuesta({});
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abrirFormulario() {
  const user = userEvent.setup();
  render(<PedidosCompraPage />);
  await user.click(await screen.findByRole('button', { name: /nuevo pedido/i }));
  await screen.findByText(/nuevo pedido a proveedor/i);
  return user;
}

describe('Compras · alta de pedido', () => {
  it('arranca sin pedidos y explica cómo crear el primero', async () => {
    render(<PedidosCompraPage />);
    expect(await screen.findByText(/todavía no hay pedidos/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /nuevo pedido/i })).toBeTruthy();
  });

  it('envía el pedido con sus líneas, cantidades e importes', async () => {
    const user = await abrirFormulario();

    await user.type(screen.getByLabelText('Concepto'), 'Detergente industrial');
    await user.clear(screen.getByLabelText('Cantidad'));
    await user.type(screen.getByLabelText('Cantidad'), '4');
    await user.type(screen.getByLabelText('Precio unitario'), '2.5');

    await user.click(screen.getByRole('button', { name: /^crear pedido$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/compras', expect.objectContaining({ method: 'POST' })));
    const llamada = fetchMock.mock.calls.find(([url, opciones]) => url === '/api/compras' && opciones?.method === 'POST');
    const cuerpo = JSON.parse(llamada![1].body);

    expect(cuerpo.items).toHaveLength(1);
    expect(cuerpo.items[0]).toMatchObject({
      concepto: 'Detergente industrial',
      cantidad: 4,
      precioUnitario: 2.5,
      porcentajeImpuesto: 21,
      catalogoItemId: null,
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/compras/c1'));
  });

  it('las sugerencias de stock entran como líneas revisables', async () => {
    const user = await abrirFormulario();

    await user.click(screen.getByRole('button', { name: /añadir sugerencias de stock/i }));

    await waitFor(() => expect(screen.getByDisplayValue('Café en grano')).toBeTruthy());
    expect(screen.getByDisplayValue('5')).toBeTruthy();
    expect(screen.getByDisplayValue('3.5')).toBeTruthy();
  });

  it('no deja crear un pedido sin líneas con concepto', async () => {
    const user = await abrirFormulario();
    const boton = screen.getByRole('button', { name: /^crear pedido$/i }) as HTMLButtonElement;

    expect(boton.disabled).toBe(true);

    await user.type(screen.getByLabelText('Concepto'), 'Guantes de nitrilo');
    expect(boton.disabled).toBe(false);
  });
});
