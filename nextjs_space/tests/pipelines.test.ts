import { describe, it, expect } from 'vitest';
import {
  MODULE_PIPELINES,
  getStagesForCategory,
  DEFAULT_STAGES,
  type PipelineDefinition,
} from '@/lib/pipelines';

// ─── Gather all pipeline definitions (flattened from module map) ──────────

function getAllPipelines(): PipelineDefinition[] {
  const all: PipelineDefinition[] = [];
  const seen = new Set<string>();

  for (const moduleName of Object.keys(MODULE_PIPELINES)) {
    const pipes = MODULE_PIPELINES[moduleName] || [];
    for (const pipe of pipes) {
      // Deduplicate by categoria (same pipeline can appear in multiple modules)
      if (!seen.has(pipe.categoria)) {
        seen.add(pipe.categoria);
        all.push({ ...pipe });
      }
    }
  }
  return all;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('MODULE_PIPELINES', () => {
  const allPipelines = getAllPipelines();

  it('debe tener al menos 7 pipelines', () => {
    expect(allPipelines.length).toBeGreaterThanOrEqual(7);
  });

  it('todos los pipelines deben tener los campos obligatorios', () => {
    allPipelines.forEach(pipe => {
      expect(pipe.nombre).toBeTruthy();
      expect(typeof pipe.nombre).toBe('string');
      expect(pipe.categoria).toBeTruthy();
      expect(typeof pipe.categoria).toBe('string');
      expect(typeof pipe.orden).toBe('number');
      expect(pipe.orden).toBeGreaterThan(0);
      expect(typeof pipe.icono).toBe('string');
      expect(pipe.icono.length).toBeGreaterThan(0);
    });
  });

  it('categorías (categoria) deben ser únicas', () => {
    const categorias = allPipelines.map(p => p.categoria);
    expect(new Set(categorias).size).toBe(categorias.length);
  });

  it('órdenes (orden) no deben tener duplicados', () => {
    const ordenes = allPipelines.map(p => p.orden);
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });

  it('órdenes deben ser secuenciales (sin huecos) empezando en 1', () => {
    const sorted = [...allPipelines].sort((a, b) => a.orden - b.orden);
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i].orden).toBe(i + 1);
    }
  });

  it('cada pipeline debe tener stages (custom o DEFAULT_STAGES)', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      expect(Array.isArray(stages)).toBe(true);
      expect(stages.length).toBeGreaterThanOrEqual(5);
    });
  });

  it('los stages por categoría deben tener exactamente 2 etapas finales (ganado + perdido)', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      const finalStages = stages.filter(s => s.esEtapaFinal);
      expect(finalStages.length).toBe(2);
      expect(finalStages.some(s => s.tipoEtapaFinal === 'ganado')).toBe(true);
      expect(finalStages.some(s => s.tipoEtapaFinal === 'perdido')).toBe(true);
    });
  });

  it('los stages deben tener órdenes secuenciales sin huecos', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      const sorted = [...stages].sort((a, b) => a.orden - b.orden);
      for (let i = 0; i < sorted.length; i++) {
        expect(sorted[i].orden).toBe(i + 1);
      }
    });
  });

  it('los stages deben tener probabilidades crecientes (excepto la final de perdido)', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      const nonPerdido = stages.filter(s => s.tipoEtapaFinal !== 'perdido');
      const sorted = [...nonPerdido].sort((a, b) => a.orden - b.orden);

      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].probabilidad).toBeGreaterThan(sorted[i - 1].probabilidad);
      }
    });
  });

  it('la etapa perdido debe tener probabilidad 0', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      const perdido = stages.find(s => s.tipoEtapaFinal === 'perdido');
      expect(perdido).toBeTruthy();
      expect(perdido!.probabilidad).toBe(0);
    });
  });

  it('la etapa ganado debe tener probabilidad 100', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      const ganado = stages.find(s => s.tipoEtapaFinal === 'ganado');
      expect(ganado).toBeTruthy();
      expect(ganado!.probabilidad).toBe(100);
    });
  });

  it('cada stage debe tener un color en formato hex válido', () => {
    allPipelines.forEach(pipe => {
      const stages = getStagesForCategory(pipe.categoria);
      stages.forEach(stage => {
        expect(stage.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  });

  it('DEFAULT_STAGES debe tener órdenes secuenciales sin huecos', () => {
    const sorted = [...DEFAULT_STAGES].sort((a, b) => a.orden - b.orden);
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i].orden).toBe(i + 1);
    }
  });

  it('pipelines específicos deben estar presentes', () => {
    const categorias = allPipelines.map(p => p.categoria);
    expect(categorias).toContain('ventas');
    expect(categorias).toContain('rrhh');
    expect(categorias).toContain('proyectos');
    expect(categorias).toContain('captacion');
    expect(categorias).toContain('compra');
    expect(categorias).toContain('finanzas');
    expect(categorias).toContain('logistica');
  });
});
