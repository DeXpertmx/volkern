// @vitest-environment node

/**
 * Guardia de la ruta legacy de Telegram (`app/api/telegram/webhook`).
 *
 * Su `GET` no es un webhook: es una acción de administración sobre el bot de un
 * tenant. Antes no pedía sesión —solo el `tenantId` de la URL— y `setWebhook`
 * re-registraba el webhook del bot apuntándolo a esta misma ruta, con lo que
 * cualquiera que conociera el id podía dejar al pipeline unificado sin recibir
 * updates. Ahora exige superadmin y el registro desde aquí está retirado.
 *
 * Se comprueba sobre la respuesta HTTP: 401 sin sesión, 403 con un rol que no
 * es de plataforma, 409 al pedir el registro (sin escribir nada) y el estado
 * con el token enmascarado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  configFindUnique: vi.fn(),
  configUpdate: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const prisma = {
    user: { findUnique: mocks.userFindUnique },
    telegramChatbotConfig: {
      findUnique: mocks.configFindUnique,
      update: mocks.configUpdate,
    },
  };
  return { prisma, default: prisma };
});
vi.mock('@/lib/agents/telegram-chatbot', () => ({ handleTelegramWebhook: vi.fn() }));
vi.mock('@/lib/agents/rate-limiter', () => ({ rateLimiter: { checkLimit: vi.fn() } }));
vi.mock('@/lib/agents/orchestrator', () => ({ orchestrator: { process: vi.fn() } }));

const { GET } = await import('@/app/api/telegram/webhook/route');

const CONFIG = {
  tenantId: 't1',
  isActive: true,
  botToken: '123456789:AAF-token-de-prueba-zzzz',
  webhookUrl: 'https://volkern.app/api/telegram/webhook?tenantId=t1&token=1700000000000',
  welcomeMessage: null,
  fallbackMessage: null,
  maxContextMessages: 10,
  sessionTimeoutMinutes: 30,
};

function peticion(action: string) {
  return new Request(`https://volkern.app/api/telegram/webhook?tenantId=t1&action=${action}`) as any;
}

function sesion(rol = 'Admin') {
  mocks.getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  mocks.userFindUnique.mockResolvedValue({ id: 'u1', role: { nombre: rol } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configFindUnique.mockResolvedValue(CONFIG);
  mocks.configUpdate.mockResolvedValue(CONFIG);
});

describe('GET /api/telegram/webhook — exige superadmin', () => {
  it('sin sesión responde 401 y no toca la configuración del bot', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const res = await GET(peticion('setWebhook'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('No autorizado');
    expect(mocks.configFindUnique).not.toHaveBeenCalled();
    expect(mocks.configUpdate).not.toHaveBeenCalled();
  });

  it('con sesión que no es Superadmin responde 403', async () => {
    sesion('Admin');

    const res = await GET(peticion('status'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Acceso denegado');
    expect(mocks.configFindUnique).not.toHaveBeenCalled();
  });

  it('un usuario inexistente o sin rol tampoco pasa', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'u-borrado' } });
    mocks.userFindUnique.mockResolvedValue(null);

    const res = await GET(peticion('status'));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/telegram/webhook — el registro desde esta ruta está retirado', () => {
  it('setWebhook responde 409 con el motivo y no re-registra nada', async () => {
    sesion('Superadmin');

    const res = await GET(peticion('setWebhook'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('desactivado');
    expect(body.detalle).toContain('register-telegram-webhooks.ts');
    // Lo que no puede pasar: cambiar el enrutamiento del bot desde aquí.
    expect(mocks.configUpdate).not.toHaveBeenCalled();
  });

  it('ni siquiera necesita token configurado para explicar el motivo', async () => {
    sesion('Superadmin');
    mocks.configFindUnique.mockResolvedValue({ ...CONFIG, botToken: null });

    const res = await GET(peticion('setWebhook'));

    expect(res.status).toBe(409);
    expect(mocks.configUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/telegram/webhook — estado de diagnóstico', () => {
  it('status devuelve el token enmascarado', async () => {
    sesion('Superadmin');

    const res = await GET(peticion('status'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isActive).toBe(true);
    expect(body.botToken).toBe('***zzzz');
    expect(body.botToken).not.toContain('AAF-token-de-prueba');
    expect(body.webhookUrl).toBe(CONFIG.webhookUrl);
  });

  it('status de un tenant sin configuración responde 404', async () => {
    sesion('Superadmin');
    mocks.configFindUnique.mockResolvedValue(null);

    const res = await GET(peticion('status'));

    expect(res.status).toBe(404);
  });
});
