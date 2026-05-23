import { describe, it, expect } from 'vitest';
import { hrIntents } from '@/lib/agents/intents/hr-intents';
import { financeIntents } from '@/lib/agents/intents/finance-intents';
import type { IntentSchema } from '@/lib/agents/intents/types';

// ─── hrIntents ────────────────────────────────────────────────────────────────

describe('hrIntents', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(hrIntents)).toBe(true);
  });

  it('debe tener 3 intents', () => {
    expect(hrIntents.length).toBe(3);
  });

  it('cada intent debe tener estructura IntentSchema completa', () => {
    for (const intent of hrIntents) {
      expect(typeof intent.name).toBe('string');
      expect(typeof intent.description).toBe('string');
      expect(Array.isArray(intent.requiredParams)).toBe(true);
      expect(Array.isArray(intent.optionalParams)).toBe(true);
      expect(Array.isArray(intent.examples)).toBe(true);
      expect(typeof intent.destructive).toBe('boolean');
    }
  });

  it('debe incluir resumen_rrhh', () => {
    const intent = hrIntents.find(i => i.name === 'resumen_rrhh');
    expect(intent).toBeDefined();
    expect(intent!.destructive).toBe(false);
    expect(intent!.requiredParams).toEqual([]);
    expect(intent!.examples.length).toBeGreaterThanOrEqual(2);
  });

  it('debe incluir aprobar_vacaciones con requiredParams solicitudId', () => {
    const intent = hrIntents.find(i => i.name === 'aprobar_vacaciones');
    expect(intent).toBeDefined();
    expect(intent!.requiredParams).toContain('solicitudId');
    expect(intent!.optionalParams).toContain('nota');
    expect(intent!.destructive).toBe(false);
  });

  it('debe incluir riesgo_rotacion', () => {
    const intent = hrIntents.find(i => i.name === 'riesgo_rotacion');
    expect(intent).toBeDefined();
    expect(intent!.optionalParams).toContain('empleadoId');
    expect(intent!.destructive).toBe(false);
  });

  it('los nombres de intents deben ser únicos', () => {
    const names = hrIntents.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ningún intent de RRHH debe ser destructive', () => {
    for (const intent of hrIntents) {
      expect(intent.destructive).toBe(false);
    }
  });
});

// ─── financeIntents ───────────────────────────────────────────────────────────

describe('financeIntents', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(financeIntents)).toBe(true);
  });

  it('debe tener al menos 7 intents', () => {
    expect(financeIntents.length).toBeGreaterThanOrEqual(7);
  });

  it('cada intent debe tener estructura IntentSchema completa', () => {
    for (const intent of financeIntents) {
      expect(typeof intent.name).toBe('string');
      expect(typeof intent.description).toBe('string');
      expect(Array.isArray(intent.requiredParams)).toBe(true);
      expect(Array.isArray(intent.optionalParams)).toBe(true);
      expect(Array.isArray(intent.examples)).toBe(true);
      expect(typeof intent.destructive).toBe('boolean');
      expect(intent.examples.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('debe incluir crear_factura', () => {
    const intent = financeIntents.find(i => i.name === 'crear_factura');
    expect(intent).toBeDefined();
    expect(intent!.requiredParams).toContain('leadId');
    expect(intent!.optionalParams).toContain('monto');
    expect(intent!.optionalParams).toContain('concepto');
  });

  it('debe incluir estado_fiscal', () => {
    const intent = financeIntents.find(i => i.name === 'estado_fiscal');
    expect(intent).toBeDefined();
    expect(intent!.requiredParams).toContain('invoiceId');
  });

  it('rectificar_factura debe ser destructive', () => {
    const intent = financeIntents.find(i => i.name === 'rectificar_factura');
    expect(intent).toBeDefined();
    expect(intent!.destructive).toBe(true);
    expect(intent!.requiredParams).toContain('invoiceId');
    expect(intent!.requiredParams).toContain('razon');
  });

  it('debe incluir registrar_gasto con requiredParams monto y concepto', () => {
    const intent = financeIntents.find(i => i.name === 'registrar_gasto');
    expect(intent).toBeDefined();
    expect(intent!.requiredParams).toContain('monto');
    expect(intent!.requiredParams).toContain('concepto');
    expect(intent!.optionalParams).toContain('categoria');
    expect(intent!.optionalParams).toContain('fotoUrl');
  });

  it('debe incluir crear_proveedor', () => {
    const intent = financeIntents.find(i => i.name === 'crear_proveedor');
    expect(intent).toBeDefined();
    expect(intent!.requiredParams).toContain('nombre');
  });

  it('intents de análisis financiero no deben requerir params', () => {
    const analyticsIntents = financeIntents.filter(i =>
      ['analizar_gastos', 'proyeccion_financiera', 'analizar_rentabilidad_global'].includes(i.name)
    );
    expect(analyticsIntents.length).toBe(3);
    for (const intent of analyticsIntents) {
      expect(intent.requiredParams).toEqual([]);
      expect(intent.destructive).toBe(false);
    }
  });

  it('los nombres de intents deben ser únicos', () => {
    const names = financeIntents.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('solo rectificar_factura debe ser destructive', () => {
    const destructiveIntents = financeIntents.filter(i => i.destructive);
    expect(destructiveIntents.length).toBe(1);
    expect(destructiveIntents[0].name).toBe('rectificar_factura');
  });
});
