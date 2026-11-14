import { describe, expect, it } from 'vitest';
import { intentClassifier } from '@/lib/agents/intent-classifier';

/**
 * Mensajes reales del chat de administración por Telegram (tenant DeXpert).
 * El del 13-nov pedía crear un lead con todos los datos en una sola frase y
 * quedó sin respuesta: la clasificación sí los extrae, así que la cobertura
 * protege que siga siendo determinista y completa.
 */
const base = { userId: 'telegram:646107192', tenantId: 'cms92n0ii0001mf83yr9grk30' };

describe('clasificación de mensajes reales de Telegram', () => {
  it('crear lead con nombre, empresa, teléfono y email en una frase', async () => {
    const r = await intentClassifier.classify({
      ...base,
      message:
        'Agrega un nuevo lead Estefanía Gutiérrez, empresa Gil-Morla servicios inmobiliarios, teléfono 692155565 email inmogilmorla@gmail.com, dirección Canalejas 26 bajo 29700 Vélez Málaga',
    });
    expect(r.intent).toBe('crear_lead');
    expect(r.needsMoreInfo).toBe(false);
    expect(r.extractedParams).toMatchObject({
      nombre: 'Estefanía Gutiérrez',
      email: 'inmogilmorla@gmail.com',
      telefono: '692155565',
      empresa: 'Gil-Morla servicios inmobiliarios',
      direccion: 'Canalejas 26 bajo 29700 Vélez Málaga',
    });
  });

  it('listar leads sin pedir más datos', async () => {
    const r = await intentClassifier.classify({ ...base, message: 'Dame la lista de leads' });
    expect(r.intent).toBe('listar_leads');
    expect(r.needsMoreInfo).toBe(false);
  });
});
