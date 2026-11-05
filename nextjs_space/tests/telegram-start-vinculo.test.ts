// @vitest-environment node

/**
 * `/start` en el webhook unificado.
 *
 * Lo que se cierra aquí: el chat de administración se vincula solo con el token
 * de un solo uso del panel (`a_<token>`). Ni el `tenantId` en claro ni un
 * `/start` a secas crean un vínculo —cualquiera puede escribirle al bot de una
 * empresa—; el `/start` sin argumentos solo reafirma uno que ya existe.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verificar: vi.fn(),
  requiere: vi.fn(),
  resolverContexto: vi.fn(),
  tokenBotDelTenant: vi.fn(),
  vinculosDelChat: vi.fn(),
  vincularChatComoAdmin: vi.fn(),
  desvincularChatDeOtrosTenants: vi.fn(),
  isChatRateLimited: vi.fn(),
  processMessage: vi.fn(),
  sendBotMessage: vi.fn(),
  ipDeRequest: vi.fn(),
  ipBloqueada: vi.fn(),
  registrarFalloSecret: vi.fn(),
  resolverVinculoAdminPorToken: vi.fn(),
  consumirTokenVinculoAdmin: vi.fn(),
  auditar: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const prisma = new Proxy(
    {},
    {
      get: () => ({
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
      }),
    }
  );
  return { prisma, default: prisma };
});

vi.mock('@/lib/telegram/webhook-secret', () => ({
  TELEGRAM_SECRET_HEADER: 'x-telegram-bot-api-secret-token',
  requiereSecret: (...args: unknown[]) => mocks.requiere(...args),
  verificarCabeceraSecret: (...args: unknown[]) => mocks.verificar(...args),
}));

vi.mock('@/lib/telegram/admin-link', () => ({
  TOKEN_ADMIN_PREFIJO: 'a_',
  resolverVinculoAdminPorToken: (...args: unknown[]) => mocks.resolverVinculoAdminPorToken(...args),
  consumirTokenVinculoAdmin: (...args: unknown[]) => mocks.consumirTokenVinculoAdmin(...args),
}));

vi.mock('@/lib/telegram/admin-chat-audit', () => ({
  auditarChatAdmin: (...args: unknown[]) => mocks.auditar(...args),
}));

vi.mock('@/lib/telegram/context-resolver', () => ({
  resolverContextoTelegram: (...args: unknown[]) => mocks.resolverContexto(...args),
  tokenBotDelTenant: (...args: unknown[]) => mocks.tokenBotDelTenant(...args),
  vinculosDelChat: (...args: unknown[]) => mocks.vinculosDelChat(...args),
  tenantsConBotPropio: vi.fn(),
  vincularChatComoAdmin: (...args: unknown[]) => mocks.vincularChatComoAdmin(...args),
  desvincularChatDeOtrosTenants: (...args: unknown[]) =>
    mocks.desvincularChatDeOtrosTenants(...args),
  chatVinculadoSoloA: vi.fn(),
}));

vi.mock('@/lib/telegram/chat-rate-limit', () => ({
  isChatRateLimited: (...args: unknown[]) => mocks.isChatRateLimited(...args),
}));

vi.mock('@/lib/telegram/webhook-secret-rate-limit', () => ({
  ipDeRequest: (...args: unknown[]) => mocks.ipDeRequest(...args),
  ipBloqueada: (...args: unknown[]) => mocks.ipBloqueada(...args),
  registrarFalloSecret: (...args: unknown[]) => mocks.registrarFalloSecret(...args),
  segundosBloqueo: () => 600,
}));

vi.mock('@/lib/telegram/quick-replies', () => ({
  parseQuickReplyCallback: () => null,
  buildQuickReplyMarkup: vi.fn(() => ({ inline_keyboard: [] })),
  clearReplyMarkup: vi.fn(),
  sendBotMessage: (...args: unknown[]) => mocks.sendBotMessage(...args),
}));

vi.mock('@/lib/chat/chatbot-service', () => ({
  processMessage: (...args: unknown[]) => mocks.processMessage(...args),
}));

vi.mock('@/lib/s3', () => ({ getDownloadUrl: vi.fn() }));
vi.mock('@/app/api/erp/expenses/scan/route', () => ({ callVision: vi.fn() }));
vi.mock('@/lib/finance/expense-inbox', () => ({ createExpenseInboxDocument: vi.fn() }));

const { POST } = await import('@/app/api/webhooks/telegram/route');

const HEADER = 'x-telegram-bot-api-secret-token';

const updateStart = (updateId: number, texto: string) => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    date: 0,
    chat: { id: 555, type: 'private' },
    from: { id: 555, first_name: 'Ana' },
    text: texto,
  },
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://test.local/api/webhooks/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  );

/** Texto del último mensaje enviado al chat, para afirmar sobre lo que lee la persona. */
function textoEnviado(): string {
  const llamadas = mocks.sendBotMessage.mock.calls;
  return String(llamadas[llamadas.length - 1]?.[1] ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requiere.mockReturnValue(false);
  mocks.verificar.mockResolvedValue({ estado: 'sin_cabecera' });
  mocks.isChatRateLimited.mockResolvedValue(false);
  mocks.processMessage.mockResolvedValue({ success: true, response: 'respuesta ok' });
  mocks.sendBotMessage.mockResolvedValue({ success: true });
  mocks.resolverContexto.mockResolvedValue(null);
  mocks.tokenBotDelTenant.mockResolvedValue('BOT:TOKEN');
  mocks.vinculosDelChat.mockResolvedValue([]);
  mocks.vincularChatComoAdmin.mockResolvedValue(true);
  mocks.resolverVinculoAdminPorToken.mockResolvedValue(null);
  mocks.ipDeRequest.mockReturnValue('203.0.113.9');
  mocks.ipBloqueada.mockResolvedValue(false);
  mocks.registrarFalloSecret.mockResolvedValue({ fallos: 1, bloqueada: false });
  mocks.consumirTokenVinculoAdmin.mockResolvedValue(undefined);
  mocks.auditar.mockResolvedValue(true);
});

describe('/start <tenantId> — formato antiguo', () => {
  it('no vincula y explica cómo conseguir el enlace', async () => {
    mocks.vinculosDelChat.mockResolvedValue([{ tenantId: 't1' }]);
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 't1',
      botToken: 'BOT:TOKEN',
    });

    const res = await post(updateStart(1, '/start t1'), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).not.toHaveBeenCalled();
    expect(mocks.consumirTokenVinculoAdmin).not.toHaveBeenCalled();
    expect(textoEnviado()).toContain('ya no vincula');
  });

  it('tampoco cuando el bot está identificado por secret', async () => {
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 't1',
      botToken: 'BOT:TOKEN',
    });

    const res = await post(updateStart(2, '/start t1'), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).not.toHaveBeenCalled();
    expect(textoEnviado()).toContain('ya no vincula');
  });

  it('sin bot identificado no hay a quién contestar, pero tampoco vincula', async () => {
    const res = await post(updateStart(9, '/start una-empresa-cualquiera'));

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).not.toHaveBeenCalled();
  });
});

describe('/start a_<token> — token de un solo uso', () => {
  it('un token que no existe no vincula nada', async () => {
    mocks.resolverVinculoAdminPorToken.mockResolvedValue(null);
    mocks.verificar.mockResolvedValue({ estado: 'valida', tenantId: 't1', botToken: 'BOT:TOKEN' });

    const res = await post(updateStart(3, '/start a_' + 'f'.repeat(32)), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.resolverVinculoAdminPorToken).toHaveBeenCalledWith('f'.repeat(32));
    expect(mocks.vincularChatComoAdmin).not.toHaveBeenCalled();
    expect(mocks.auditar).not.toHaveBeenCalled();
    expect(textoEnviado()).toContain('ya no es válido');
  });

  it('un token vigente vincula el chat y se gasta', async () => {
    mocks.resolverVinculoAdminPorToken.mockResolvedValue({ tenantId: 't1', solicitadoPor: 'u-admin' });
    mocks.verificar.mockResolvedValue({ estado: 'valida', tenantId: 't1', botToken: 'BOT:TOKEN' });

    const res = await post(updateStart(4, '/start a_' + 'c'.repeat(32)), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).toHaveBeenCalledWith('555', 't1');
    expect(mocks.consumirTokenVinculoAdmin).toHaveBeenCalledWith('t1');
    expect(textoEnviado()).toContain('Chat vinculado');
  });

  it('deja en el audit log el tenant, quién pidió el enlace y la cuenta que lo pulsó', async () => {
    mocks.resolverVinculoAdminPorToken.mockResolvedValue({ tenantId: 't1', solicitadoPor: 'u-admin' });
    mocks.verificar.mockResolvedValue({ estado: 'valida', tenantId: 't1', botToken: 'BOT:TOKEN' });

    await post(updateStart(10, '/start a_' + 'a'.repeat(32)), { [HEADER]: 'secret' });

    expect(mocks.auditar).toHaveBeenCalledTimes(1);
    expect(mocks.auditar).toHaveBeenCalledWith({
      accion: 'vinculado',
      tenantId: 't1',
      userId: 'u-admin',
      chatId: '555',
      actorTelegram: { id: 555, username: null, nombre: 'Ana' },
    });
  });

  it('si la auditoría falla, el vínculo ya guardado sigue en pie', async () => {
    mocks.resolverVinculoAdminPorToken.mockResolvedValue({ tenantId: 't1', solicitadoPor: 'u-admin' });
    mocks.verificar.mockResolvedValue({ estado: 'valida', tenantId: 't1', botToken: 'BOT:TOKEN' });
    mocks.auditar.mockRejectedValue(new Error('audit down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await post(updateStart(11, '/start a_' + 'b'.repeat(32)), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).toHaveBeenCalledWith('555', 't1');
    expect(mocks.consumirTokenVinculoAdmin).toHaveBeenCalledWith('t1');
    expect(textoEnviado()).toContain('Chat vinculado');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('si el bot es de otra cuenta, no vincula al tenant del token', async () => {
    mocks.resolverVinculoAdminPorToken.mockResolvedValue({ tenantId: 't-ajeno', solicitadoPor: null });
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 't-bot',
      botToken: 'BOT:TOKEN',
    });

    const res = await post(updateStart(5, '/start a_' + 'd'.repeat(32)), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).not.toHaveBeenCalled();
    expect(mocks.consumirTokenVinculoAdmin).not.toHaveBeenCalled();
    expect(textoEnviado()).toContain('otro espacio de trabajo');
  });

  it('si el vínculo no se pudo guardar, el token no se consume', async () => {
    mocks.resolverVinculoAdminPorToken.mockResolvedValue({ tenantId: 't1', solicitadoPor: 'u-admin' });
    mocks.vincularChatComoAdmin.mockResolvedValue(false);
    mocks.verificar.mockResolvedValue({ estado: 'valida', tenantId: 't1', botToken: 'BOT:TOKEN' });

    const res = await post(updateStart(6, '/start a_' + 'e'.repeat(32)), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.consumirTokenVinculoAdmin).not.toHaveBeenCalled();
    expect(textoEnviado()).toContain('No se encontró');
  });
});

describe('/start sin argumentos', () => {
  it('no crea un vínculo nuevo, ni siquiera con el bot identificado', async () => {
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 't-bot',
      botToken: 'BOT:TOKEN',
    });
    mocks.vinculosDelChat.mockResolvedValue([]);

    const res = await post(updateStart(7, '/start'), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).not.toHaveBeenCalled();
    expect(textoEnviado()).toContain('enlace de un solo uso');
  });

  it('reafirma el vínculo que ya existe', async () => {
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 't-bot',
      botToken: 'BOT:TOKEN',
    });
    mocks.vinculosDelChat.mockResolvedValue([{ tenantId: 't-bot' }]);

    const res = await post(updateStart(8, '/start'), { [HEADER]: 'secret' });

    expect(res.status).toBe(200);
    expect(mocks.vincularChatComoAdmin).toHaveBeenCalledWith('555', 't-bot');
    expect(textoEnviado()).toContain('Configuración completa');
  });
});
