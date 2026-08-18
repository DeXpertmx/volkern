import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withBreaker, _resetCircuitBreakerForTests } from '@/lib/assistant/openrouter-client';

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
});