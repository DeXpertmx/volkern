import { describe, it, expect } from 'vitest';
import { IntentClassifierAgent } from '@/lib/agents/intent-classifier';

describe('Clasificación frases gastos (regresión)', () => {
  const c = new IntentClassifierAgent() as any;
  const base = { userId: 'user-1', tenantId: 'tenant-1' };

  it('"autoriza todos los gastos" → autorizar_gastos', async () => {
    const r = await c.classify({ ...base, message: 'autoriza todos los gastos' });
    expect(r.intent).toBe('autorizar_gastos');
  });

  it('"dame los gastos por autorizar" → resumen_gastos_pendientes', async () => {
    const r = await c.classify({ ...base, message: 'dame los gastos por autorizar' });
    expect(r.intent).toBe('resumen_gastos_pendientes');
  });

  it('"qué gastos están pendientes de autorizar" → resumen_gastos_pendientes', async () => {
    const r = await c.classify({ ...base, message: 'qué gastos están pendientes de autorizar' });
    expect(r.intent).toBe('resumen_gastos_pendientes');
  });

  it('"aprueba todas las solicitudes de gasto" → autorizar_gastos', async () => {
    const r = await c.classify({ ...base, message: 'aprueba todas las solicitudes de gasto' });
    expect(r.intent).toBe('autorizar_gastos');
  });

  it('"cuántos gastos se autorizaron" responde resumen (nunca ejecuta autorización)', async () => {
    const r = await c.classify({ ...base, message: 'cuántos gastos se autorizaron' });
    expect(r.intent).not.toBe('autorizar_gastos');
    // El resumen de gastos pendientes es informativo y no ejecuta nada.
    expect(['resumen_gastos_pendientes', 'consulta_general']).toContain(r.intent);
  });
});
