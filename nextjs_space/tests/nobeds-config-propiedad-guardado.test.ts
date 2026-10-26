// @vitest-environment node
//
// Guardado de la credencial de conectividad POR PROPIEDAD.
//
// Lo que se comprueba aquí no es cosmético: un token que se guarda en claro, que
// vuelve en la respuesta o que se borra al cambiar solo el estado es un secreto
// filtrado o una credencial rota. El cifrado se verifica descifrando lo que
// llegó a la base, no confiando en que el código llame a `encrypt`.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decrypt, encrypt } from '@/lib/core/crypto';

const hoisted = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityConnectivityPropertyConfig: {
      findUnique: hoisted.findUnique,
      findMany: hoisted.findMany,
      upsert: hoisted.upsert,
    },
  },
}));

import { guardarCredencialPropiedad } from '@/lib/hospitality/nobeds/config-propiedad';

const TOKEN = 'tok_9f8e7d6c5b4a';
const OTRO_TOKEN = 'tok_rotado_0001';

function fila(parcial: Record<string, unknown> = {}) {
  return {
    tokenEnc: encrypt(TOKEN),
    modo: 'escritura',
    activo: true,
    estado: 'configurado',
    externalPropertyId: '4821',
    ...parcial,
  };
}

function capturaUpsert() {
  const llamada = hoisted.upsert.mock.calls[0]?.[0] as {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    where: unknown;
  };
  return llamada;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.findMany.mockResolvedValue([]);
  hoisted.upsert.mockResolvedValue({});
});

describe('Credencial por propiedad — el token se cifra y no vuelve', () => {
  it('guarda el token cifrado, nunca en claro', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    const resultado = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: TOKEN,
    });

    expect(resultado.ok).toBe(true);
    const { create } = capturaUpsert();
    expect(create.tokenEnc).toBeTypeOf('string');
    expect(create.tokenEnc).not.toContain(TOKEN);
    expect(decrypt(create.tokenEnc as string)).toBe(TOKEN);
    expect(create).toMatchObject({
      tenantId: 't1',
      propertyId: 'p1',
      provider: 'nobeds',
      externalPropertyId: '4821',
      activo: true,
      modo: 'escritura',
    });
  });

  it('la respuesta no contiene el token en ningún campo', async () => {
    hoisted.findUnique.mockResolvedValue(fila());

    const resultado = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: TOKEN,
    });

    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
    expect(resultado.estado).toMatchObject({ configurado: true });
    expect(Object.keys(resultado.estado ?? {})).not.toContain('tokenEnc');
  });

  it('el token se recorta y se rechaza con espacios o controles', async () => {
    const conEspacios = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: 'tok con espacio',
    });
    expect(conEspacios).toMatchObject({ ok: false, campo: 'token' });
    expect(hoisted.upsert).not.toHaveBeenCalled();

    hoisted.findUnique.mockResolvedValue(null);
    await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: `  ${TOKEN}  `,
    });
    expect(decrypt(capturaUpsert().create.tokenEnc as string)).toBe(TOKEN);
  });
});

describe('Credencial por propiedad — guardar sin token no borra el existente', () => {
  it('sin token en la petición conserva el guardado y no lo reescribe', async () => {
    hoisted.findUnique.mockResolvedValue(fila());

    const resultado = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      activo: false,
    });

    expect(resultado.ok).toBe(true);
    const { update } = capturaUpsert();
    expect(update).not.toHaveProperty('tokenEnc');
    expect(update).toMatchObject({ activo: false });
  });

  it('rotar el token no reactiva una credencial apagada', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ activo: false }));

    await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: OTRO_TOKEN,
    });

    expect(capturaUpsert().update).toMatchObject({ activo: false });
  });

  it('sin token y sin credencial previa es un error de campo, no una fila vacía', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    const resultado = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
    });

    expect(resultado).toMatchObject({ ok: false, campo: 'token' });
    expect(hoisted.upsert).not.toHaveBeenCalled();
  });

  it('conserva el modo «lectura» de una convivencia si no se envía otro', async () => {
    hoisted.findUnique.mockResolvedValue(fila({ modo: 'lectura' }));

    await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: TOKEN,
    });

    expect(capturaUpsert().update).toMatchObject({ modo: 'lectura' });
  });
});

describe('Credencial por propiedad — validaciones de campo', () => {
  it('exige propiedad y código externo', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    await expect(
      guardarCredencialPropiedad({ tenantId: 't1', propertyId: '', externalPropertyId: '1', token: TOKEN })
    ).resolves.toMatchObject({ ok: false, campo: 'propertyId' });

    await expect(
      guardarCredencialPropiedad({ tenantId: 't1', propertyId: 'p1', externalPropertyId: '  ', token: TOKEN })
    ).resolves.toMatchObject({ ok: false, campo: 'externalPropertyId' });
  });

  it('rechaza un código externo con espacios o demasiado largo', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    await expect(
      guardarCredencialPropiedad({
        tenantId: 't1',
        propertyId: 'p1',
        externalPropertyId: 'hotel 9',
        token: TOKEN,
      })
    ).resolves.toMatchObject({ ok: false, campo: 'externalPropertyId' });

    await expect(
      guardarCredencialPropiedad({
        tenantId: 't1',
        propertyId: 'p1',
        externalPropertyId: 'x'.repeat(65),
        token: TOKEN,
      })
    ).resolves.toMatchObject({ ok: false, campo: 'externalPropertyId' });

    expect(hoisted.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un modo que no existe', async () => {
    hoisted.findUnique.mockResolvedValue(null);

    await expect(
      guardarCredencialPropiedad({
        tenantId: 't1',
        propertyId: 'p1',
        externalPropertyId: '4821',
        token: TOKEN,
        // @ts-expect-error — se prueba una entrada que la API puede recibir del cable
        modo: 'escribir',
      })
    ).resolves.toMatchObject({ ok: false, campo: 'modo' });
  });
});

describe('Credencial por propiedad — aviso de dos escritores', () => {
  it('avisa, y guarda igual, cuando otro proveedor ya escribe esta propiedad', async () => {
    hoisted.findUnique.mockResolvedValue(null);
    hoisted.findMany.mockResolvedValue([
      { provider: 'nobeds', activo: true, modo: 'escritura' },
      { provider: 'channel_connectivity', activo: true, modo: 'escritura' },
    ]);

    const resultado = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: TOKEN,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.avisos).toHaveLength(1);
    expect(resultado.avisos[0]).toContain('dos conectividades activas');
    // El aviso es para el operador: no nombra marcas.
    expect(resultado.avisos[0].toLowerCase()).not.toContain('nobeds');
    expect(resultado.avisos[0].toLowerCase()).not.toContain('aiosell');
  });

  it('no avisa cuando el respaldo está en solo lectura', async () => {
    hoisted.findUnique.mockResolvedValue(null);
    hoisted.findMany.mockResolvedValue([
      { provider: 'nobeds', activo: true, modo: 'escritura' },
      { provider: 'channel_connectivity', activo: true, modo: 'lectura' },
    ]);

    const resultado = await guardarCredencialPropiedad({
      tenantId: 't1',
      propertyId: 'p1',
      externalPropertyId: '4821',
      token: TOKEN,
    });

    expect(resultado.avisos).toHaveLength(0);
  });
});
