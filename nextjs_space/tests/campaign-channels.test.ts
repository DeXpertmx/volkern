import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAMPAIGN_CHANNEL_IDS, getCanalesDisponibles } from '@/lib/campaign-channels';

describe('Catálogo compartido de canales de campaña', () => {
  it('el catálogo de UI coincide exactamente con CAMPAIGN_CHANNEL_IDS', () => {
    const canales = getCanalesDisponibles();
    expect(canales.map((c) => c.id)).toEqual([...CAMPAIGN_CHANNEL_IDS]);
    // Sin duplicados y con nombre legible
    expect(new Set(canales.map((c) => c.id)).size).toBe(canales.length);
    for (const c of canales) {
      expect(c.nombre.trim().length).toBeGreaterThan(0);
    }
  });

  it('todo canal del catálogo tiene método de envío en el motor (campaign-engine.ts)', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/campaign-engine.ts'), 'utf8');
    const handled = new Set<string>();

    // sendDirectMessage: switch (canal) { case 'whatsapp': ...
    const directRe = /case\s+'([a-z_]+)':/g;
    let m: RegExpExecArray | null;
    while ((m = directRe.exec(engine)) !== null) handled.add(m[1]);

    // sendMessage: if (canal === 'email') ... if (canal === 'facebook' || canal === 'instagram')
    const ifRe = /canal\s*===\s*'([a-z_]+)'/g;
    while ((m = ifRe.exec(engine)) !== null) handled.add(m[1]);

    for (const id of CAMPAIGN_CHANNEL_IDS) {
      expect(handled.has(id), `El canal '${id}' no tiene método de envío en lib/campaign-engine.ts`).toBe(true);
    }
  });
});