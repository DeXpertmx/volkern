import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretTokenDelBot } from '@/lib/telegram/webhook-secret';
import { estadoWebhookBot, registrarWebhookBot, URL_WEBHOOK_TELEGRAM } from '@/lib/telegram/webhook-registro';

const TOKEN = '123456:AAH-test-token';

function respuesta(payload: unknown) {
  return { json: async () => payload } as any;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registrarWebhookBot', () => {
  it('registra el webhook con el secret derivado del bot y confirma la URL', async () => {
    const llamadas: Array<{ url: string; body?: any }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        llamadas.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
        if (url.includes('getWebhookInfo')) {
          // Antes de registrar no hay webhook; después ya apunta al destino.
          const registrado = llamadas.some((l) => l.url.includes('/setWebhook'));
          return respuesta({ ok: true, result: { url: registrado ? URL_WEBHOOK_TELEGRAM : '' } });
        }
        return respuesta({ ok: true, result: true });
      })
    );

    const resultado = await registrarWebhookBot(TOKEN);

    expect(resultado.ok).toBe(true);
    const alta = llamadas.find((l) => l.url.includes('/setWebhook'));
    expect(alta?.body.url).toBe(URL_WEBHOOK_TELEGRAM);
    expect(alta?.body.secret_token).toBe(secretTokenDelBot(TOKEN));
    expect(alta?.body.allowed_updates).toEqual(['message', 'edited_message', 'callback_query']);
  });

  it('no pisa un webhook que apunta a otra aplicación', async () => {
    const fetchMock = vi.fn(async () =>
      respuesta({ ok: true, result: { url: 'https://otra-app.example/hook' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await registrarWebhookBot(TOKEN);

    expect(resultado.ok).toBe(false);
    expect(resultado.conflicto).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/getWebhookInfo');
  });

  it('con forzar sí re-registra aunque apunte a otro sitio', async () => {
    const llamadas: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        llamadas.push(url);
        if (url.includes('getWebhookInfo')) {
          const registro = llamadas.some((l) => l.includes('/setWebhook'));
          return respuesta({ ok: true, result: { url: registro ? URL_WEBHOOK_TELEGRAM : 'https://otra-app.example/hook' } });
        }
        return respuesta({ ok: true, result: true });
      })
    );

    const resultado = await registrarWebhookBot(TOKEN, { forzar: true });

    expect(resultado.ok).toBe(true);
    expect(llamadas.some((l) => l.includes('/setWebhook'))).toBe(true);
  });

  it('sin token no intenta nada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await registrarWebhookBot('');

    expect(resultado.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('estadoWebhookBot', () => {
  it('marca registrado cuando el bot apunta al endpoint de Volkern', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta({ ok: true, result: { url: URL_WEBHOOK_TELEGRAM, pending_update_count: 3 } })
      )
    );

    const estado = await estadoWebhookBot(TOKEN);

    expect(estado.registrado).toBe(true);
    expect(estado.pendientes).toBe(3);
    expect(estado.esperada).toBe(URL_WEBHOOK_TELEGRAM);
  });

  it('marca no registrado y expone el último error de Telegram', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta({
          ok: true,
          result: { url: '', pending_update_count: 12, last_error_message: 'Unauthorized', last_error_date: 1763000000 },
        })
      )
    );

    const estado = await estadoWebhookBot(TOKEN);

    expect(estado.registrado).toBe(false);
    expect(estado.url).toBeNull();
    expect(estado.ultimoError).toBe('Unauthorized');
    expect(estado.pendientes).toBe(12);
  });
});
