// @vitest-environment node

/**
 * Token de un solo uso para vincular el chat de administración de un tenant.
 *
 * Es el sustituto de `/start <tenantId>`: el id de una empresa no es un
 * secreto, así que el vínculo tiene que apoyarse en algo que caduque y se gaste.
 * Aquí se comprueba lo que hace que eso sea cierto: el token es aleatorio, dura
 * 15 minutos, resuelve a un único tenant, se rechaza caducado o mal formado y
 * se borra al consumirlo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  integrationFindFirst: vi.fn(),
  integrationFindMany: vi.fn(),
  integrationUpdate: vi.fn(),
  channelFindFirst: vi.fn(),
  channelFindMany: vi.fn(),
  channelUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const prisma = {
    integration: {
      findFirst: mocks.integrationFindFirst,
      findMany: mocks.integrationFindMany,
      update: mocks.integrationUpdate,
    },
    channel: {
      findFirst: mocks.channelFindFirst,
      findMany: mocks.channelFindMany,
      update: mocks.channelUpdate,
    },
  };
  return { prisma, default: prisma };
});

const {
  crearEnlaceVinculoAdmin,
  resolverTenantPorTokenAdmin,
  resolverVinculoAdminPorToken,
  consumirTokenVinculoAdmin,
  estadoVinculoAdmin,
  desvincularChatAdmin,
  TOKEN_ADMIN_TTL_MS,
} = await import('@/lib/telegram/admin-link');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.integrationFindFirst.mockResolvedValue(null);
  mocks.channelFindFirst.mockResolvedValue(null);
  mocks.integrationFindMany.mockResolvedValue([]);
  mocks.channelFindMany.mockResolvedValue([]);
  mocks.integrationUpdate.mockResolvedValue({});
  mocks.channelUpdate.mockResolvedValue({});
});

describe('crearEnlaceVinculoAdmin', () => {
  it('genera un token aleatorio, lo guarda con caducidad y arma el enlace del bot', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: { bot_username: '@volkern_demo_bot', admin_chat_id: null },
    });

    const antes = Date.now();
    const enlace = await crearEnlaceVinculoAdmin('t1');

    expect(enlace).not.toBeNull();
    expect(enlace!.token).toMatch(/^[a-f0-9]{32}$/);
    expect(enlace!.botUsername).toBe('volkern_demo_bot');
    expect(enlace!.enlace).toBe(`https://t.me/volkern_demo_bot?start=a_${enlace!.token}`);

    const expira = Date.parse(enlace!.expiraEn);
    expect(expira - antes).toBeGreaterThanOrEqual(TOKEN_ADMIN_TTL_MS - 1000);
    expect(expira - antes).toBeLessThanOrEqual(TOKEN_ADMIN_TTL_MS + 1000);

    // Se guarda junto al vínculo, sin tocar admin_chat_id.
    const guardado = mocks.integrationUpdate.mock.calls[0][0];
    expect(guardado.where.id).toBe('int_1');
    expect(guardado.data.credenciales.admin_link_token).toBe(enlace!.token);
    expect(guardado.data.credenciales.admin_link_token_exp).toBe(enlace!.expiraEn);
    expect(guardado.data.credenciales.admin_chat_id).toBeNull();
  });

  it('dos generaciones seguidas no repiten token (el anterior deja de valer)', async () => {
    mocks.integrationFindFirst.mockResolvedValue({ id: 'int_1', credenciales: {} });

    const a = await crearEnlaceVinculoAdmin('t1');
    const b = await crearEnlaceVinculoAdmin('t1');

    expect(a!.token).not.toBe(b!.token);
    expect(mocks.integrationUpdate).toHaveBeenCalledTimes(2);
  });

  it('usa el canal moderno cuando no hay integración, y lee su botUsername', async () => {
    mocks.channelFindFirst.mockResolvedValue({
      id: 'ch_1',
      config: { botUsername: 'otro_bot' },
    });

    const enlace = await crearEnlaceVinculoAdmin('t1');

    expect(enlace!.enlace).toContain('https://t.me/otro_bot?start=a_');
    expect(mocks.channelUpdate.mock.calls[0][0].data.config.admin_link_token).toBe(enlace!.token);
  });

  it('sin bot conectado no hay enlace', async () => {
    expect(await crearEnlaceVinculoAdmin('t1')).toBeNull();
    expect(mocks.integrationUpdate).not.toHaveBeenCalled();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });

  it('guarda quién pidió el enlace, para poder auditar el vínculo a su nombre', async () => {
    mocks.integrationFindFirst.mockResolvedValue({ id: 'int_1', credenciales: {} });

    await crearEnlaceVinculoAdmin('t1', 'u-admin');

    expect(mocks.integrationUpdate.mock.calls[0][0].data.credenciales.admin_link_solicitado_por).toBe(
      'u-admin'
    );
  });

  it('regenerar sin solicitante no hereda el de un enlace anterior', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: { admin_link_solicitado_por: 'u-viejo' },
    });

    await crearEnlaceVinculoAdmin('t1');

    const creds = mocks.integrationUpdate.mock.calls[0][0].data.credenciales;
    expect(creds.admin_link_solicitado_por).toBeUndefined();
  });

  it('sin nombre de bot devuelve el token pero ningún enlace', async () => {
    mocks.integrationFindFirst.mockResolvedValue({ id: 'int_1', credenciales: {} });

    const enlace = await crearEnlaceVinculoAdmin('t1');

    expect(enlace!.token).toMatch(/^[a-f0-9]{32}$/);
    expect(enlace!.enlace).toBeNull();
  });
});

describe('resolverTenantPorTokenAdmin', () => {
  const token = 'a'.repeat(32);

  it('resuelve el tenant dueño del token vigente', async () => {
    mocks.integrationFindMany.mockResolvedValue([
      { tenantId: 't-otro', credenciales: { admin_link_token: 'b'.repeat(32) } },
      {
        tenantId: 't1',
        credenciales: {
          admin_link_token: token,
          admin_link_token_exp: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    ]);

    expect(await resolverTenantPorTokenAdmin(token)).toBe('t1');
  });

  it('un token caducado no resuelve a nadie', async () => {
    mocks.integrationFindMany.mockResolvedValue([
      {
        tenantId: 't1',
        credenciales: {
          admin_link_token: token,
          admin_link_token_exp: new Date(Date.now() - 1000).toISOString(),
        },
      },
    ]);

    expect(await resolverTenantPorTokenAdmin(token)).toBeNull();
  });

  it('una caducidad ilegible se trata como caducada', async () => {
    mocks.integrationFindMany.mockResolvedValue([
      { tenantId: 't1', credenciales: { admin_link_token: token, admin_link_token_exp: 'ayer' } },
    ]);

    expect(await resolverTenantPorTokenAdmin(token)).toBeNull();
  });

  it('rechaza formatos que no son un token (sin recorrer la base)', async () => {
    expect(await resolverTenantPorTokenAdmin('tenant-123')).toBeNull();
    expect(await resolverTenantPorTokenAdmin('')).toBeNull();
    expect(mocks.integrationFindMany).not.toHaveBeenCalled();
  });

  it('también resuelve desde la config del canal', async () => {
    mocks.channelFindMany.mockResolvedValue([
      {
        tenantId: 't-canal',
        config: {
          admin_link_token: token,
          admin_link_token_exp: Date.now() + 60_000,
        },
      },
    ]);

    expect(await resolverTenantPorTokenAdmin(token)).toBe('t-canal');
  });
});

describe('resolverVinculoAdminPorToken', () => {
  const token = 'a'.repeat(32)

  it('devuelve el tenant y quién pidió el enlace', async () => {
    mocks.integrationFindMany.mockResolvedValue([
      {
        tenantId: 't1',
        credenciales: {
          admin_link_token: token,
          admin_link_token_exp: new Date(Date.now() + 60_000).toISOString(),
          admin_link_solicitado_por: 'u-admin',
        },
      },
    ])

    expect(await resolverVinculoAdminPorToken(token)).toEqual({
      tenantId: 't1',
      solicitadoPor: 'u-admin',
    })
  })

  it('solicitante nulo en los enlaces anteriores a ese dato', async () => {
    mocks.channelFindMany.mockResolvedValue([
      { tenantId: 't-canal', config: { admin_link_token: token, admin_link_token_exp: Date.now() + 60_000 } },
    ])

    expect(await resolverVinculoAdminPorToken(token)).toEqual({
      tenantId: 't-canal',
      solicitadoPor: null,
    })
  })
})

describe('consumirTokenVinculoAdmin', () => {
  it('borra el token de integraciones y canales del tenant', async () => {
    mocks.integrationFindMany.mockResolvedValue([
      {
        id: 'int_1',
        credenciales: {
          admin_chat_id: '999',
          admin_link_token: 'x'.repeat(32),
          admin_link_token_exp: '2030-01-01T00:00:00.000Z',
          admin_link_solicitado_por: 'u-admin',
        },
      },
    ]);
    mocks.channelFindMany.mockResolvedValue([
      { id: 'ch_1', config: { adminChatId: '999', admin_link_token: 'x'.repeat(32) } },
    ]);

    await consumirTokenVinculoAdmin('t1');

    const creds = mocks.integrationUpdate.mock.calls[0][0].data.credenciales;
    expect(creds.admin_link_token).toBeUndefined();
    expect(creds.admin_link_token_exp).toBeUndefined();
    // El solicitante se gasta con el enlace: ya cumplió su función en el audit log.
    expect(creds.admin_link_solicitado_por).toBeUndefined();
    // El vínculo en sí se conserva: se gasta el enlace, no el chat.
    expect(creds.admin_chat_id).toBe('999');

    const config = mocks.channelUpdate.mock.calls[0][0].data.config;
    expect(config.admin_link_token).toBeUndefined();
    expect(config.adminChatId).toBe('999');
  });

  it('no escribe si no hay token que gastar', async () => {
    mocks.integrationFindMany.mockResolvedValue([
      { id: 'int_1', credenciales: { admin_chat_id: '999' } },
    ]);

    await consumirTokenVinculoAdmin('t1');

    expect(mocks.integrationUpdate).not.toHaveBeenCalled();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });
});

describe('estadoVinculoAdmin — qué muestra el panel', () => {
  it('con chat y fecha: vinculado, el chat y el momento del vínculo', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: {
        admin_chat_id: '646107192',
        admin_chat_vinculado_en: '2026-10-03T09:15:00.000Z',
        bot_username: '@volkern_demo_bot',
      },
    });

    expect(await estadoVinculoAdmin('t1')).toEqual({
      vinculado: true,
      chatId: '646107192',
      desde: '2026-10-03T09:15:00.000Z',
      botUsername: 'volkern_demo_bot',
    });
  });

  it('vínculo antiguo sin marca de fecha: vinculado pero sin inventar el día', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: { admin_chat_id: 555, bot_username: 'volkern_demo_bot' },
    });

    const estado = await estadoVinculoAdmin('t1');

    expect(estado!.vinculado).toBe(true);
    expect(estado!.chatId).toBe('555');
    expect(estado!.desde).toBeNull();
  });

  it('una fecha ilegible se trata como no registrada', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: { admin_chat_id: '555', admin_chat_vinculado_en: 'el martes' },
    });

    expect((await estadoVinculoAdmin('t1'))!.desde).toBeNull();
  });

  it('con bot pero sin chat: no vinculado (los avisos no llegan a nadie)', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: { bot_token: 'tk', bot_username: 'volkern_demo_bot', admin_chat_id: null },
    });

    expect(await estadoVinculoAdmin('t1')).toEqual({
      vinculado: false,
      chatId: null,
      desde: null,
      botUsername: 'volkern_demo_bot',
    });
  });

  it('lee el canal moderno (adminChatId / adminChatVinculadoEn)', async () => {
    mocks.channelFindFirst.mockResolvedValue({
      id: 'ch_1',
      config: {
        adminChatId: '777',
        adminChatVinculadoEn: '2026-09-20T18:00:00.000Z',
        botUsername: 'bot_canal',
      },
    });

    expect(await estadoVinculoAdmin('t1')).toEqual({
      vinculado: true,
      chatId: '777',
      desde: '2026-09-20T18:00:00.000Z',
      botUsername: 'bot_canal',
    });
  });

  it('sin integración ni canal → null (no hay nada que mostrar)', async () => {
    expect(await estadoVinculoAdmin('t1')).toBeNull();
  });
});

describe('desvincularChatAdmin — la baja desde el panel', () => {
  it('borra el chat, su fecha y el enlace pendiente, y deja el bot intacto', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: {
        bot_token: 'tk',
        bot_username: 'volkern_demo_bot',
        admin_chat_id: '646107192',
        admin_chat_vinculado_en: '2026-10-03T09:15:00.000Z',
        admin_link_token: 'd'.repeat(32),
        admin_link_token_exp: '2030-01-01T00:00:00.000Z',
        admin_link_solicitado_por: 'u-admin',
      },
    });

    expect(await desvincularChatAdmin('t1')).toBe(true);

    const creds = mocks.integrationUpdate.mock.calls[0][0].data.credenciales;
    expect(creds.admin_chat_id).toBeUndefined();
    expect(creds.admin_chat_vinculado_en).toBeUndefined();
    // Un enlace generado antes de la baja no puede resucitar el vínculo.
    expect(creds.admin_link_token).toBeUndefined();
    expect(creds.admin_link_token_exp).toBeUndefined();
    expect(creds.admin_link_solicitado_por).toBeUndefined();
    // El bot sigue conectado: desvincular un chat no desconecta la integración.
    expect(creds.bot_token).toBe('tk');
    expect(creds.bot_username).toBe('volkern_demo_bot');
  });

  it('funciona igual sobre el canal moderno', async () => {
    mocks.channelFindFirst.mockResolvedValue({
      id: 'ch_1',
      config: {
        botToken: 'enc(tk)',
        adminChatId: '777',
        adminChatVinculadoEn: '2026-09-20T18:00:00.000Z',
      },
    });

    expect(await desvincularChatAdmin('t1')).toBe(true);

    const config = mocks.channelUpdate.mock.calls[0][0].data.config;
    expect(config.adminChatId).toBeUndefined();
    expect(config.adminChatVinculadoEn).toBeUndefined();
    expect(config.botToken).toBe('enc(tk)');
  });

  it('sin chat vinculado no escribe nada y devuelve false', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: { bot_token: 'tk', bot_username: 'volkern_demo_bot' },
    });

    expect(await desvincularChatAdmin('t1')).toBe(false);
    expect(mocks.integrationUpdate).not.toHaveBeenCalled();
  });

  it('sin integración ni canal devuelve false', async () => {
    expect(await desvincularChatAdmin('t1')).toBe(false);
    expect(mocks.integrationUpdate).not.toHaveBeenCalled();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });
});

describe('estadoVinculoAdmin — enlace pendiente y solo lectura', () => {
  it('un enlace generado y sin usar no convierte el chat en vinculado', async () => {
    mocks.integrationFindFirst.mockResolvedValue({
      id: 'int_1',
      credenciales: {
        admin_chat_id: null,
        admin_link_token: 'c'.repeat(32),
        admin_link_token_exp: '2030-01-01T00:00:00.000Z',
      },
    });

    expect((await estadoVinculoAdmin('t1'))!.vinculado).toBe(false);
  });

  it('no escribe en la base al consultar', async () => {
    expect(mocks.integrationUpdate).not.toHaveBeenCalled();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });
});
