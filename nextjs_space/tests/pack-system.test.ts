import { describe, it, expect } from 'vitest';
import { PackSystem } from '@/lib/event-engine/pack-system';

// ─── getDefaultPack ──────────────────────────────────────────────────
describe('PackSystem.getDefaultPack', () => {
  const pack = PackSystem.getDefaultPack();

  it('debe tener pack=default y version=1.0', () => {
    expect(pack.pack).toBe('default');
    expect(pack.version).toBe('1.0');
  });

  it('debe tener pipeline con 8 etapas ordenadas', () => {
    expect(pack.pipeline).toHaveLength(8);
    expect(pack.pipeline[0]).toEqual({ id: 'lead_nuevo', name: 'Lead Nuevo', order: 1 });
    expect(pack.pipeline[7]).toEqual({ id: 'cerrado', name: 'Cerrado', order: 8 });
  });

  it('todas las etapas deben tener order incremental', () => {
    pack.pipeline.forEach((stage, i) => {
      expect(stage.order).toBe(i + 1);
    });
  });

  it('debe tener 3 triggers', () => {
    expect(pack.triggers).toHaveLength(3);
  });

  it('trigger lead_created debe tener 3 acciones', () => {
    const trigger = pack.triggers.find(t => t.trigger === 'lead_created');
    expect(trigger).toBeDefined();
    expect(trigger!.actions).toHaveLength(3);
    expect(trigger!.actions[0]).toEqual({ type: 'assign_owner' });
    expect(trigger!.actions[1]).toEqual({ type: 'send_whatsapp', config: { template: 'welcome' } });
    expect(trigger!.actions[2]).toEqual({ type: 'run_ai', config: { agent: 'lead_classifier' } });
  });

  it('trigger no_response_24h debe tener condiciones', () => {
    const trigger = pack.triggers.find(t => t.trigger === 'no_response_24h');
    expect(trigger).toBeDefined();
    expect(trigger!.conditions).toHaveLength(1);
    expect(trigger!.conditions![0]).toEqual({
      field: 'stage',
      operator: 'in',
      value: ['contactado', 'calificado']
    });
    expect(trigger!.actions).toHaveLength(2);
  });

  it('trigger deal_stage_changed debe tener condición equals', () => {
    const trigger = pack.triggers.find(t => t.trigger === 'deal_stage_changed');
    expect(trigger).toBeDefined();
    expect(trigger!.conditions).toHaveLength(1);
    expect(trigger!.conditions![0]).toEqual({
      field: 'stage',
      operator: 'equals',
      value: 'negociacion'
    });
    expect(trigger!.actions[0]).toEqual({ type: 'run_ai', config: { agent: 'deal_strategy' } });
  });

  it('debe ser determinista (misma referencia en llamadas consecutivas)', () => {
    const a = PackSystem.getDefaultPack();
    const b = PackSystem.getDefaultPack();
    // Debe devolver el mismo objeto cada vez (no necesariamente ===)
    expect(a.pack).toBe(b.pack);
    expect(a.pipeline).toEqual(b.pipeline);
    expect(a.triggers).toEqual(b.triggers);
  });
});

// ─── evaluateCondition ────────────────────────────────────────────────
describe('PackSystem.evaluateCondition', () => {
  describe('operator: equals', () => {
    it('debe devolver true si el valor coincide', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'equals', value: 'negociacion' },
        { stage: 'negociacion' }
      )).toBe(true);
    });

    it('debe devolver false si el valor no coincide', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'equals', value: 'negociacion' },
        { stage: 'calificado' }
      )).toBe(false);
    });

    it('debe devolver false si el campo no existe', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'missing', operator: 'equals', value: 'x' },
        { stage: 'negociacion' }
      )).toBe(false);
    });

    it('debe ser estricto (number vs string)', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'count', operator: 'equals', value: 5 },
        { count: '5' }
      )).toBe(false);
    });
  });

  describe('operator: not_equals', () => {
    it('debe devolver true si el valor es distinto', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'not_equals', value: 'cerrado' },
        { stage: 'negociacion' }
      )).toBe(true);
    });

    it('debe devolver false si el valor es igual', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'not_equals', value: 'negociacion' },
        { stage: 'negociacion' }
      )).toBe(false);
    });
  });

  describe('operator: in', () => {
    it('debe devolver true si el valor está en el array', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'in', value: ['contactado', 'calificado', 'negociacion'] },
        { stage: 'calificado' }
      )).toBe(true);
    });

    it('debe devolver false si el valor no está en el array', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'in', value: ['contactado', 'calificado'] },
        { stage: 'cerrado' }
      )).toBe(false);
    });

    it('debe devolver false si value no es un array', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'in', value: 'not-array' as any },
        { stage: 'calificado' }
      )).toBe(false);
    });
  });

  describe('operator: not_in', () => {
    it('debe devolver true si el valor no está en el array', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'not_in', value: ['cerrado', 'perdido'] },
        { stage: 'negociacion' }
      )).toBe(true);
    });

    it('debe devolver false si el valor está en el array', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'stage', operator: 'not_in', value: ['negociacion', 'cerrado'] },
        { stage: 'negociacion' }
      )).toBe(false);
    });
  });

  describe('operator: greater_than', () => {
    it('debe devolver true si fieldValue > value', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'amount', operator: 'greater_than', value: 1000 },
        { amount: 1500 }
      )).toBe(true);
    });

    it('debe devolver false si fieldValue <= value', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'amount', operator: 'greater_than', value: 1500 },
        { amount: 1500 }
      )).toBe(false);
    });

    it('debe devolver false si fieldValue no es number', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'amount', operator: 'greater_than', value: 1000 },
        { amount: '1500' }
      )).toBe(false);
    });
  });

  describe('operator: less_than', () => {
    it('debe devolver true si fieldValue < value', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'amount', operator: 'less_than', value: 2000 },
        { amount: 1500 }
      )).toBe(true);
    });

    it('debe devolver false si fieldValue >= value', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'amount', operator: 'less_than', value: 1500 },
        { amount: 1500 }
      )).toBe(false);
    });
  });

  describe('operator: contains', () => {
    it('debe devolver true si el string contiene el valor', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'name', operator: 'contains', value: 'Juan' },
        { name: 'Juan García López' }
      )).toBe(true);
    });

    it('debe devolver false si el string no contiene el valor', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'name', operator: 'contains', value: 'Pedro' },
        { name: 'Juan García López' }
      )).toBe(false);
    });

    it('debe devolver false si fieldValue no es string', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'name', operator: 'contains', value: 'a' },
        { name: 12345 }
      )).toBe(false);
    });

    it('debe ser case-sensitive', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'name', operator: 'contains', value: 'juan' },
        { name: 'Juan García' }
      )).toBe(false);
    });
  });

  describe('operator: exists', () => {
    it('debe devolver true si el campo existe con valor no null', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'email', operator: 'exists', value: true },
        { email: 'test@test.com' }
      )).toBe(true);
    });

    it('debe devolver true si el campo existe con valor 0', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'count', operator: 'exists', value: true },
        { count: 0 }
      )).toBe(true);
    });

    it('debe devolver true si el campo existe con string vacío', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'name', operator: 'exists', value: true },
        { name: '' }
      )).toBe(true);
    });

    it('debe devolver false si el campo es undefined', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'email', operator: 'exists', value: true },
        { name: 'Juan' }
      )).toBe(false);
    });

    it('debe devolver false si el campo es null', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'email', operator: 'exists', value: true },
        { email: null }
      )).toBe(false);
    });
  });

  describe('operator: unknown', () => {
    it('debe devolver false para operador desconocido', () => {
      expect(PackSystem.evaluateCondition(
        { field: 'x', operator: 'unknown_op' as any, value: 1 },
        { x: 1 }
      )).toBe(false);
    });
  });
});
