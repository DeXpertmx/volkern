import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withBreaker, _resetCircuitBreakerForTests, isDeepSeekEnabled } from '@/lib/assistant/openrouter-client';

describe('circuit breaker de la cadena LLM', () => {
  beforeEach(() => {
    _resetCircuitBreakerForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('un acierto no abre el circuito y resuelve el valor', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withBreaker('modelo-a', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('el 402 (saldo insuficiente) abre el circuito al PRIMER fallo y salta el modelo', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('DeepSeek V4 Flash error: 402 - Insufficient Balance'));
    await expect(withBreaker('deepseek-chat', fn)).rejects.toThrow('402');
    // Segundo intento: circuito abierto → no se llama al modelo
    await expect(withBreaker('deepseek-chat', fn)).rejects.toThrow('circuito abierto');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('un timeout abre el circuito tras 2 fallos consecutivos', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('DOMException [AbortError]: This operation was aborted'));
    // Fallo 1: aún abierto no está, se llama al modelo
    await expect(withBreaker('dots-studio/dots-3-note-preview:free', fn)).rejects.toThrow('aborted');
    // Fallo 2: abre el circuito
    await expect(withBreaker('dots-studio/dots-3-note-preview:free', fn)).rejects.toThrow('aborted');
    // Fallo 3: circuito abierto → se salta sin llamar
    await expect(withBreaker('dots-studio/dots-3-note-preview:free', fn)).rejects.toThrow('circuito abierto');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('un acierto cierra el circuito y limpia el historial', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withBreaker('modelo-b', failing)).rejects.toThrow('boom');
    await expect(withBreaker('modelo-b', failing)).rejects.toThrow('boom'); // abre
    await expect(withBreaker('modelo-b', failing)).rejects.toThrow('circuito abierto');

    // El modelo se recupera: el acierto cierra el circuito
    const ok = vi.fn().mockResolvedValue('recuperado');
    await expect(withBreaker('modelo-b', ok)).rejects.toThrow('circuito abierto'); // sigue abierto
    // (simulamos cooldown expirado)
    vi.useFakeTimers();
    vi.advanceTimersByTime(6 * 60 * 1000);
    const result = await withBreaker('modelo-b', ok);
    expect(result).toBe('recuperado');
    // Ya cerrado: el siguiente fallo vuelve a empezar el contador desde 1
    await expect(withBreaker('modelo-b', failing)).rejects.toThrow('boom');
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it('el error de circuito abierto se marca con circuitOpen=true', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('error: 402 - Insufficient Balance'));
    await expect(withBreaker('deepseek-chat', fn)).rejects.toThrow('402');
    try {
      await withBreaker('deepseek-chat', fn);
    } catch (e: any) {
      expect(e.circuitOpen).toBe(true);
    }
  });

  describe('isDeepSeekEnabled (interruptor DEEPSEEK_DISABLED)', () => {
    const original = process.env.DEEPSEEK_DISABLED;
    const originalKey = process.env.DEEPSEEK_API_KEY;

    // La función solo puede estar habilitada si hay clave: en CI no existe
    // .env, así que se fija aquí una para aislar el interruptor que se prueba.
    beforeEach(() => {
      process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    });

    afterEach(() => {
      if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = originalKey;
      if (original === undefined) delete process.env.DEEPSEEK_DISABLED;
      else process.env.DEEPSEEK_DISABLED = original;
    });

    it('está habilitado por defecto (sin la variable)', () => {
      delete process.env.DEEPSEEK_DISABLED;
      expect(isDeepSeekEnabled()).toBe(true);
    });

    it('sin clave queda deshabilitado aunque el interruptor no esté puesto', () => {
      delete process.env.DEEPSEEK_DISABLED;
      delete process.env.DEEPSEEK_API_KEY;
      expect(isDeepSeekEnabled()).toBe(false);
    });

    it('se desactiva con DEEPSEEK_DISABLED=1', () => {
      process.env.DEEPSEEK_DISABLED = '1';
      expect(isDeepSeekEnabled()).toBe(false);
    });

    it('se desactiva con DEEPSEEK_DISABLED=true', () => {
      process.env.DEEPSEEK_DISABLED = 'true';
      expect(isDeepSeekEnabled()).toBe(false);
    });
  });
});