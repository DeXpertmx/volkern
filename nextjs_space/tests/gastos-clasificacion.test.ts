// @vitest-environment node

/**
 * Clasificación de frases de gastos — REGRESIÓN y DETERMINISMO.
 *
 * Estas frases deben clasificarse SIEMPRE por la ruta determinista (regex),
 * sin caer al fallback LLM: bajo paralelismo el fallback tarda o clasifica
 * mal (el flake «cuántos gastos se autorizaron» → analizar_gastos venía de
 * aquí). El mock hoisted hace que tocar el LLM FALLE el test con el motivo.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callAssistantWithFallback: vi.fn(),
}));

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithFallback: mocks.callAssistantWithFallback,
}));

import { IntentClassifierAgent } from '@/lib/agents/intent-classifier';

describe('Clasificación frases gastos (regresión)', () => {
  const c = new IntentClassifierAgent() as any;
  const base = { userId: 'user-1', tenantId: 'tenant-1' };

  it.each([
    ['autoriza todos los gastos', 'autorizar_gastos'],
    ['aprueba todas las solicitudes de gasto', 'autorizar_gastos'],
    ['dame los gastos por autorizar', 'resumen_gastos_pendientes'],
    ['qué gastos están pendientes de autorizar', 'resumen_gastos_pendientes'],
    // La frase del flake: pregunta informativa sobre lo YA autorizado — nunca
    // autorizar_gastos, nunca LLM. Determinista → resumen informativo.
    ['cuántos gastos se autorizaron', 'resumen_gastos_pendientes'],
    ['qué gastos se aprobaron este mes', 'resumen_gastos_pendientes'],
  ])('%s → %s', async (message, esperado) => {
    const r = await c.classify({ ...base, message });
    expect(r.intent).toBe(esperado);
    // Nunca se tocó el fallback LLM: la clasificación fue determinista.
    expect(mocks.callAssistantWithFallback).not.toHaveBeenCalled();
  });

  it('la autorización sigue siendo autorización aunque mencione cantidades', async () => {
    const r = await c.classify({ ...base, message: 'autoriza los 5 gastos pendientes' });
    expect(r.intent).toBe('autorizar_gastos');
    expect(mocks.callAssistantWithFallback).not.toHaveBeenCalled();
  });
});
