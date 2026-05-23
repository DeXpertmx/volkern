import { describe, it, expect } from 'vitest';
import { PACK_TEMPLATES, getPackTemplate, listPackTemplates } from '@/lib/event-engine/pack-templates';

// ==================== PACK_TEMPLATES ====================
describe('PACK_TEMPLATES', () => {
  it('debe tener 3 packs: basic, high_ticket, enterprise', () => {
    const keys = Object.keys(PACK_TEMPLATES);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('basic');
    expect(keys).toContain('high_ticket');
    expect(keys).toContain('enterprise');
  });

  it('cada pack debe tener pack, version, pipeline, triggers', () => {
    for (const [id, pack] of Object.entries(PACK_TEMPLATES)) {
      expect(pack.pack).toBe(id);
      expect(pack.version).toBe('1.0');
      expect(Array.isArray(pack.pipeline)).toBe(true);
      expect(pack.pipeline.length).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(pack.triggers)).toBe(true);
      expect(pack.triggers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cada stage del pipeline debe tener id, name, order', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      for (const stage of pack.pipeline) {
        expect(stage.id).toBeTruthy();
        expect(stage.name).toBeTruthy();
        expect(typeof stage.order).toBe('number');
        expect(stage.order).toBeGreaterThan(0);
      }
    }
  });

  it('los stages deben tener IDs únicos por pack', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      const ids = pack.pipeline.map(s => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });

  it('los stages deben estar ordenados por order', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      for (let i = 1; i < pack.pipeline.length; i++) {
        expect(pack.pipeline[i].order).toBeGreaterThan(pack.pipeline[i - 1].order);
      }
    }
  });

  it('cada trigger debe tener trigger y actions', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      for (const trigger of pack.triggers) {
        expect(trigger.trigger).toBeTruthy();
        expect(typeof trigger.trigger).toBe('string');
        expect(Array.isArray(trigger.actions)).toBe(true);
        expect(trigger.actions.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('cada action debe tener type definido', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      for (const trigger of pack.triggers) {
        for (const action of trigger.actions) {
          expect(action.type).toBeTruthy();
          expect(typeof action.type).toBe('string');
        }
      }
    }
  });

  it('las condiciones deben tener field, operator, value si existen', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      for (const trigger of pack.triggers) {
        if (trigger.conditions) {
          for (const cond of trigger.conditions) {
            expect(cond.field).toBeTruthy();
            expect(cond.operator).toBeTruthy();
            const validOps = ['equals', 'not_equals', 'in', 'not_in', 'greater_than', 'less_than', 'contains', 'exists'];
            expect(validOps).toContain(cond.operator);
          }
        }
      }
    }
  });

  it('cada pack debe tener metadata con description y complexity', () => {
    for (const pack of Object.values(PACK_TEMPLATES)) {
      expect(pack.metadata).toBeDefined();
      expect(pack.metadata!.description).toBeTruthy();
      expect(pack.metadata!.complexity).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(pack.metadata!.complexity);
    }
  });

  it('basic debe tener 4 stages', () => {
    expect(PACK_TEMPLATES.basic.pipeline).toHaveLength(4);
  });

  it('high_ticket debe tener 8 stages', () => {
    expect(PACK_TEMPLATES.high_ticket.pipeline).toHaveLength(8);
  });

  it('enterprise debe tener 11 stages', () => {
    expect(PACK_TEMPLATES.enterprise.pipeline).toHaveLength(11);
  });
});

// ==================== getPackTemplate ====================
describe('getPackTemplate', () => {
  it('debe devolver el pack correcto por ID', () => {
    const pack = getPackTemplate('basic');
    expect(pack).not.toBeNull();
    expect(pack!.pack).toBe('basic');
  });

  it('debe devolver null para ID inexistente', () => {
    expect(getPackTemplate('nonexistent')).toBeNull();
  });

  it('debe devolver null para string vacío', () => {
    expect(getPackTemplate('')).toBeNull();
  });

  it('debe ser case-sensitive', () => {
    expect(getPackTemplate('BASIC')).toBeNull();
    expect(getPackTemplate('Basic')).toBeNull();
  });
});

// ==================== listPackTemplates ====================
describe('listPackTemplates', () => {
  it('debe devolver 3 templates', () => {
    const templates = listPackTemplates();
    expect(templates).toHaveLength(3);
  });

  it('cada template debe tener id, name, description, complexity', () => {
    const templates = listPackTemplates();
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(['low', 'medium', 'high']).toContain(t.complexity);
    }
  });

  it('debe incluir los 3 IDs', () => {
    const templates = listPackTemplates();
    const ids = templates.map(t => t.id);
    expect(ids).toContain('basic');
    expect(ids).toContain('high_ticket');
    expect(ids).toContain('enterprise');
  });
});
