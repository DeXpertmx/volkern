/**
 * Pruebas unitarias del writer de trazabilidad (P5).
 *
 * El saneo debe acotar lo que se guarda sin volcar el CRM entero ni exponer
 * secretos, y el registro no puede romper la operación cuando la tabla falla.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  creado: null as any,
  llamadas: 0,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    toolExecution: {
      create: async (args: any) => {
        h.llamadas += 1;
        h.creado = args;
        throw new Error('BD caída');
      },
    },
  },
  default: {},
  globalPrisma: {},
  getTenantDb: async () => ({}),
}));

import { registrarEjecucion, sanearParaTraza } from '@/lib/agents/tool-execution-log';

describe('sanearParaTraza', () => {
  it('trunca textos largos y oculta claves sensibles', () => {
    const saneado = sanearParaTraza({
      nombre: 'x'.repeat(600),
      password: 'secreto',
      apiKey: 'clave-real',
    }) as Record<string, unknown>;

    expect(String(saneado.nombre)).toHaveLength(501);
    expect(String(saneado.nombre).endsWith('…')).toBe(true);
    expect(saneado.password).toBe('[oculto]');
    expect(saneado.apiKey).toBe('[oculto]');
  });

  it('recorta listas y anida sin pasarse de profundidad', () => {
    const largo = Array.from({ length: 50 }, (_, i) => i);
    const profundo = { a: { b: { c: { d: { e: 1 } } } } };

    const lista = sanearParaTraza({ lista: largo }) as { lista: number[] };
    expect(lista.lista).toHaveLength(10);

    const anidado = sanearParaTraza(profundo) as Record<string, any>;
    expect(anidado.a.b.c.d).toBe('[recortado]');
  });

  it('convierte fechas a cadena ISO', () => {
    const fecha = new Date('2026-11-19T10:00:00.000Z');
    expect(sanearParaTraza({ fecha })).toEqual({ fecha: '2026-11-19T10:00:00.000Z' });
  });
});

describe('registrarEjecucion', () => {
  it('no lanza aunque la tabla no esté disponible', async () => {
    await expect(
      registrarEjecucion({
        tenantId: 'tenant-a',
        userId: 'u-1',
        conversationId: 'conv-1',
        herramienta: 'crear_nota',
        origen: 'crm',
        argumentos: { nombre: 'Ana' },
        resultado: { ok: true },
        duracionMs: 12,
        estado: 'ok',
      })
    ).resolves.toBeUndefined();

    expect(h.llamadas).toBe(1);
    expect(h.creado.data.toolName).toBe('crear_nota');
    expect(h.creado.data.status).toBe('ok');
    expect(h.creado.data.durationMs).toBe(12);
  });
});
