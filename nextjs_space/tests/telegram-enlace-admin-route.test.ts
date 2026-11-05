// @vitest-environment node

/**
 * POST /api/integraciones/telegram/enlace-admin
 *
 * El chat que se vincula pasa a recibir los avisos de la empresa, así que el
 * enlace no lo puede pedir cualquiera de la cuenta: sin sesión 401, sin rol de
 * administración 403, y sin bot conectado 409 (no hay a dónde mandar el
 * `/start`). Lo mismo vale para leer el estado del vínculo (GET) y para
 * deshacerlo (DELETE): si el panel puede ver qué chat recibe los avisos,
 * también es información de la cuenta.
 * La generación real del token, la lectura del estado y la baja del vínculo se
 * cubren en `tests/telegram-admin-link.test.ts`; aquí solo se comprueba la
 * puerta.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  checkPermission: vi.fn(),
  crearEnlace: vi.fn(),
  estadoVinculo: vi.fn(),
  desvincular: vi.fn(),
  auditar: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const prisma = { user: { findUnique: mocks.userFindUnique } };
  return { prisma, default: prisma };
});
vi.mock('@/lib/permissions', () => ({ checkPermission: mocks.checkPermission }));
vi.mock('@/lib/telegram/admin-link', () => ({
  crearEnlaceVinculoAdmin: mocks.crearEnlace,
  estadoVinculoAdmin: mocks.estadoVinculo,
  desvincularChatAdmin: mocks.desvincular,
  TOKEN_ADMIN_PREFIJO: 'a_',
}));
vi.mock('@/lib/telegram/admin-chat-audit', () => ({ auditarChatAdmin: mocks.auditar }));

const { POST, GET, DELETE } = await import('@/app/api/integraciones/telegram/enlace-admin/route');

const ENLACE = {
  token: 'f'.repeat(32),
  expiraEn: '2030-01-01T00:00:00.000Z',
  botUsername: 'volkern_demo_bot',
  enlace: 'https://t.me/volkern_demo_bot?start=a_' + 'f'.repeat(32),
};

function usuario(rol: string, tenantId: string | null = 't1') {
  return { id: 'u1', tenantId, role: { nombre: rol } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue({ user: { email: 'admin@empresa.test' } });
  mocks.userFindUnique.mockResolvedValue(usuario('Admin'));
  mocks.checkPermission.mockResolvedValue(false);
  mocks.crearEnlace.mockResolvedValue(ENLACE);
  mocks.estadoVinculo.mockResolvedValue({
    vinculado: false,
    chatId: null,
    desde: null,
    botUsername: 'volkern_demo_bot',
  });
  mocks.desvincular.mockResolvedValue(true);
  mocks.auditar.mockResolvedValue(true);
});

describe('POST /api/integraciones/telegram/enlace-admin', () => {
  it('sin sesión responde 401 y no genera nada', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('No autorizado');
    expect(mocks.crearEnlace).not.toHaveBeenCalled();
  });

  it('un usuario sin tenant no puede pedirlo', async () => {
    mocks.userFindUnique.mockResolvedValue(usuario('Admin', null));

    const res = await POST();

    expect(res.status).toBe(404);
    expect(mocks.crearEnlace).not.toHaveBeenCalled();
  });

  it('un rol sin permiso de configuración recibe 403', async () => {
    mocks.userFindUnique.mockResolvedValue(usuario('Usuario'));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain('administrador');
    expect(mocks.crearEnlace).not.toHaveBeenCalled();
  });

  it('un rol personalizado con permiso de configuración sí puede', async () => {
    mocks.userFindUnique.mockResolvedValue(usuario('Operaciones'));
    mocks.checkPermission.mockResolvedValue(true);

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enlace).toBe(ENLACE.enlace);
    expect(mocks.checkPermission).toHaveBeenCalledWith('u1', 'configuracion', 'editar');
  });

  it('el administrador recibe el enlace, su caducidad y el bot', async () => {
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      enlace: ENLACE.enlace,
      expiraEn: ENLACE.expiraEn,
      botUsername: ENLACE.botUsername,
    });
    // El solicitante viaja con el token para que el vínculo se pueda auditar
    // a nombre de quien pidió el enlace.
    expect(mocks.crearEnlace).toHaveBeenCalledWith('t1', 'u1');
  });

  it('sin bot conectado responde 409 explicando qué falta', async () => {
    mocks.crearEnlace.mockResolvedValue(null);

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('bot de Telegram');
    expect(body.detalle).toContain('token de BotFather');
  });

  it('un fallo inesperado no filtra el error interno', async () => {
    mocks.crearEnlace.mockRejectedValue(new Error('ECONNREFUSED 5432'));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});

describe('DELETE /api/integraciones/telegram/enlace-admin', () => {
  it('sin sesión responde 401 y no toca el vínculo', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(mocks.desvincular).not.toHaveBeenCalled();
  });

  it('un rol sin permiso no puede quitar el chat de los avisos', async () => {
    mocks.userFindUnique.mockResolvedValue(usuario('Usuario'));

    const res = await DELETE();

    expect(res.status).toBe(403);
    expect(mocks.desvincular).not.toHaveBeenCalled();
  });

  it('el administrador desvincula el chat de su tenant', async () => {
    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ desvinculado: true });
    expect(mocks.desvincular).toHaveBeenCalledWith('t1');
  });

  it('deja en el audit log quién desvinculó, el chat y desde cuándo estaba vinculado', async () => {
    mocks.estadoVinculo.mockResolvedValue({
      vinculado: true,
      chatId: '646107192',
      desde: '2026-10-03T09:15:00.000Z',
      botUsername: 'volkern_demo_bot',
    });

    await DELETE();

    expect(mocks.auditar).toHaveBeenCalledTimes(1);
    expect(mocks.auditar).toHaveBeenCalledWith({
      accion: 'desvinculado',
      tenantId: 't1',
      userId: 'u1',
      chatId: '646107192',
      vinculadoDesde: '2026-10-03T09:15:00.000Z',
    });
  });

  it('sin chat vinculado responde 200 con desvinculado:false (idempotente)', async () => {
    mocks.desvincular.mockResolvedValue(false);

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ desvinculado: false });
    // No se desvinculó nada: tampoco hay baja que auditar.
    expect(mocks.auditar).not.toHaveBeenCalled();
  });

  it('si la auditoría falla, la baja ya hecha no se convierte en un 500', async () => {
    mocks.estadoVinculo.mockResolvedValue({
      vinculado: true,
      chatId: '646107192',
      desde: '2026-10-03T09:15:00.000Z',
      botUsername: 'volkern_demo_bot',
    });
    mocks.auditar.mockRejectedValue(new Error('audit down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ desvinculado: true });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('un fallo inesperado no filtra el error interno', async () => {
    mocks.desvincular.mockRejectedValue(new Error('connection terminated'));

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('connection');
  });
});

describe('GET /api/integraciones/telegram/enlace-admin', () => {
  it('sin sesión responde 401 y no consulta el vínculo', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mocks.estadoVinculo).not.toHaveBeenCalled();
  });

  it('un rol sin permiso no puede ver qué chat recibe los avisos', async () => {
    mocks.userFindUnique.mockResolvedValue(usuario('Usuario'));

    const res = await GET();

    expect(res.status).toBe(403);
    expect(mocks.estadoVinculo).not.toHaveBeenCalled();
  });

  it('devuelve el vínculo del tenant de la sesión', async () => {
    mocks.estadoVinculo.mockResolvedValue({
      vinculado: true,
      chatId: '646107192',
      desde: '2026-10-03T09:15:00.000Z',
      botUsername: 'volkern_demo_bot',
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      vinculado: true,
      chatId: '646107192',
      desde: '2026-10-03T09:15:00.000Z',
      botUsername: 'volkern_demo_bot',
    });
    expect(mocks.estadoVinculo).toHaveBeenCalledWith('t1');
  });

  it('sin bot conectado devuelve el estado vacío, no un error', async () => {
    mocks.estadoVinculo.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ vinculado: false, chatId: null, desde: null, botUsername: null });
  });

  it('un fallo inesperado no filtra el error interno', async () => {
    mocks.estadoVinculo.mockRejectedValue(new Error('password authentication failed'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
