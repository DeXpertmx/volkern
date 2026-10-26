import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt } from '@/lib/core/crypto';

const hoisted = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityConnectivityPropertyConfig: {
      findUnique: hoisted.findUnique,
    },
  },
}));

import {
  crearClienteNobedsDePropiedad,
  estadoConfiguracionNobeds,
} from '@/lib/hospitality/nobeds/config-propiedad';

const TOKEN = 'token-secreto-de-la-propiedad';
const BASE = 'https://sandbox.example.test';

function fila(parcial: Record<string, unknown> = {}) {
  return {
    tokenEnc: encrypt(TOKEN),
    activo: true,
    estado: 'conectado',
    externalPropertyId: 'hotel-9',
    ...parcial,
  };
}

function fetchQueCaptura(respuesta: unknown) {
  const llamadas: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    llamadas.push(String(url));
    return new Response(JSON.stringify(respuesta), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, llamadas };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOBEDS_BASE_URL = BASE;
});

afterEach(() => {
  delete process.env.NOBEDS_BASE_URL;
});

describe('NOBEDS — credencial por propiedad', () => {
  it('lee la fila de esta propiedad y proveedor, no la de otra', async () => {
    hoisted.findUnique.mockResolvedValue(fila());
    const { fetchImpl } = fetchQueCaptura({ hotelName: 'H', isActive: true, rentals: [] });

    await crearClienteNobedsDePropiedad({
      tenantId: 'tenant-1',
      propertyId: 'prop-1',
      fetchImpl,
    });

    expect(hoisted.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_propertyId_provider: {
          tenantId: 'tenant-1',
          propertyId: 'prop-1',
          provider: 'nobeds',
        },
      },
      select: { tokenEnc: true, activo: true, estado: true, externalPropertyId: true },
    });
  });

  it('descifra el token y lo pone en la ruta contra la URL configurada', async () => {
    hoisted.findUnique.mockResolvedValue(fila());
    const { fetchImpl, llamadas } = fetchQueCaptura({ hotelName: 'H', isActive: true, rentals: [] });

    const cliente = await crearClienteNobedsDePropiedad({
      tenantId: 'tenant-1',
      propertyId: 'prop-1',
      fetchImpl,
    });
    await cliente.estado();

    const url = new URL(llamadas[0]);
    expect(url.origin).toBe(BASE);
    expect(url.pathname).toBe(`/api/Status/${TOKEN}`);
  });

  it('una fila sin configuración no se confunde con «sin datos»', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    await expect(
      crearClienteNobedsDePropiedad({ tenantId: 't', propertyId: 'p' })
    ).rejects.toMatchObject({ tipo: 'token' });
  });

  it('desactivada es error de credencial, no lectura vacía', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ activo: false }));

    await expect(
      crearClienteNobedsDePropiedad({ tenantId: 't', propertyId: 'p' })
    ).rejects.toMatchObject({ tipo: 'token', message: expect.stringContaining('desactivada') });
  });

  it('sin token guardado no se construye el cliente', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ tokenEnc: null }));

    await expect(
      crearClienteNobedsDePropiedad({ tenantId: 't', propertyId: 'p' })
    ).rejects.toMatchObject({ tipo: 'token', message: expect.stringContaining('token') });
  });

  it('los errores nunca incluyen el token', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ activo: false }));

    let mensaje = '';
    try {
      await crearClienteNobedsDePropiedad({ tenantId: 't', propertyId: 'p' });
    } catch (e) {
      mensaje = e instanceof Error ? e.message : '';
    }

    expect(mensaje).not.toBe('');
    expect(mensaje).not.toContain(TOKEN);
  });

  it('tolera un token guardado sin cifrar (formato antiguo) sin romper', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ tokenEnc: 'token-plano' }));
    const { fetchImpl, llamadas } = fetchQueCaptura({ hotelName: 'H', isActive: true, rentals: [] });

    const cliente = await crearClienteNobedsDePropiedad({
      tenantId: 't',
      propertyId: 'p',
      fetchImpl,
    });
    await cliente.estado();

    expect(new URL(llamadas[0]).pathname).toBe('/api/Status/token-plano');
  });
});

describe('NOBEDS — estado de configuración sin secretos', () => {
  it('informa si hay credencial, sin devolverla', async () => {
    hoisted.findUnique.mockResolvedValue(fila());

    const estado = await estadoConfiguracionNobeds({ tenantId: 't', propertyId: 'p' });

    expect(estado).toEqual({
      proveedor: 'nobeds',
      configurado: true,
      activo: true,
      estado: 'conectado',
      externalPropertyId: 'hotel-9',
    });
    expect(Object.keys(estado)).not.toContain('tokenEnc');
    expect(JSON.stringify(estado)).not.toContain(TOKEN);
  });

  it('sin fila se lee como sin configurar, no como error', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    const estado = await estadoConfiguracionNobeds({ tenantId: 't', propertyId: 'p' });

    expect(estado).toMatchObject({ configurado: false, activo: false, estado: 'sin_configurar' });
  });

  it('una fila sin token no cuenta como configurada', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ tokenEnc: null, activo: false }));

    const estado = await estadoConfiguracionNobeds({ tenantId: 't', propertyId: 'p' });

    expect(estado.configurado).toBe(false);
  });
});
