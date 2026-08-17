// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { DESTRUCTIVE_INTENT_LABELS } from '@/lib/agents/destructive-labels';

// Solo importamos el clasificador (sin mocks de BD: isDestructive y classify
// determinista no tocan la base).
const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');

const TENANT = 'tenant-seg';

function makeClassifier() {
  return new IntentClassifierAgent() as any;
}

describe('Reglas de seguridad — flags destructive', () => {
  const classifier = makeClassifier();

  it('CANCELAR ≠ BORRAR: cancelar_cita NO es destructivo', () => {
    expect(classifier.isDestructive('cancelar_cita')).toBe(false);
  });

  it('CANCELAR ≠ BORRAR: reagendar_cita NO es destructivo', () => {
    expect(classifier.isDestructive('reagendar_cita')).toBe(false);
  });

  it('verificar_mermas es trazabilidad (registro), no destructivo', () => {
    expect(classifier.isDestructive('verificar_mermas')).toBe(false);
  });

  it('borrar/eliminar SÍ es destructivo', () => {
    expect(classifier.isDestructive('eliminar_horario')).toBe(true);
  });

  it('acciones irreversibles SÍ son destructivas', () => {
    for (const intent of ['declarar_ganador', 'ajustar_stock', 'consumir_inventario', 'cancelar_factura', 'rectificar_factura']) {
      expect(classifier.isDestructive(intent)).toBe(true);
    }
  });

  it('todos los intents destructivos tienen etiqueta legible para la confirmación', () => {
    const destructivos = (classifier as any).intentsSchema
      .filter((i: any) => i.destructive)
      .map((i: any) => i.name);
    expect(destructivos.length).toBeGreaterThan(0);
    for (const intent of destructivos) {
      expect(DESTRUCTIVE_INTENT_LABELS[intent], `falta label para ${intent}`).toBeTruthy();
    }
  });
});

describe('Reglas de seguridad — clasificación sin confirmación para cancelar', () => {
  const classifier = makeClassifier();
  const base = { message: '', userId: 'user-1', tenantId: TENANT };

  it('"cancela la cita de Alejandra" → cancelar_cita (flujo permitido)', async () => {
    const r = await classifier.classify({ ...base, message: 'cancela la cita de Alejandra Velázquez' });
    expect(r.intent).toBe('cancelar_cita');
  });

  it('"reagenda la cita de Juan al viernes" → reagendar_cita (flujo permitido)', async () => {
    const r = await classifier.classify({ ...base, message: 'reagenda la cita de Juan al viernes a las 4pm' });
    expect(r.intent).toBe('reagendar_cita');
  });

  it('"elimina el horario de anuncios de las 9" → eliminar_horario (requiere confirmación)', async () => {
    const r = await classifier.classify({ ...base, message: 'elimina el horario de anuncios de las 9' });
    expect(r.intent).toBe('eliminar_horario');
    expect(classifier.isDestructive(r.intent)).toBe(true);
  });

  it('"saca 10 unidades de stock del jabón" → ajustar_stock (requiere confirmación)', async () => {
    const r = await classifier.classify({ ...base, message: 'saca 10 unidades de stock del jabón de baño' });
    expect(r.intent).toBe('ajustar_stock');
    expect(classifier.isDestructive(r.intent)).toBe(true);
  });
});