import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '@/lib/automation/condition-evaluator';
import type { ExecutionContext } from '@/lib/automation/types';

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    lead: {
      nombre: 'Juan Pérez',
      email: 'juan@example.com',
      telefono: '+34600000000',
      estado: 'nuevo',
      empresa: 'Acme Corp',
      origen: 'web',
      puntuacion: 85,
      fechaCreacion: '2024-01-15T10:00:00.000Z',
      tags: ['vip', 'urgente'],
      categoria: 'premium',
    },
    ...overrides,
  };
}

describe('Condition Evaluator — evaluateCondition', () => {
  describe('Operadores de igualdad', () => {
    it('igual: debe retornar true cuando coinciden', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'igual', value: 'Juan Pérez' },
        makeContext()
      )).toBe(true);
    });

    it('igual: debe retornar false cuando no coinciden', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'igual', value: 'María' },
        makeContext()
      )).toBe(false);
    });

    it('diferente: debe retornar true cuando no coinciden', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'diferente', value: 'María' },
        makeContext()
      )).toBe(true);
    });

    it('diferente: debe retornar false cuando coinciden', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'diferente', value: 'Juan Pérez' },
        makeContext()
      )).toBe(false);
    });
  });

  describe('Operadores de texto', () => {
    it('contiene: debe encontrar subcadena (case-insensitive)', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'contiene', value: 'juan' },
        makeContext()
      )).toBe(true);
    });

    it('contiene: debe retornar false si no contiene', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'contiene', value: 'xyz' },
        makeContext()
      )).toBe(false);
    });

    it('no_contiene: debe retornar true si no contiene', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'no_contiene', value: 'xyz' },
        makeContext()
      )).toBe(true);
    });

    it('no_contiene: debe retornar false si contiene', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'no_contiene', value: 'juan' },
        makeContext()
      )).toBe(false);
    });

    it('empieza_con: debe detectar prefijo', () => {
      expect(evaluateCondition(
        { field: 'email', operator: 'empieza_con', value: 'juan' },
        makeContext()
      )).toBe(true);
    });

    it('empieza_con: debe retornar false si no empieza', () => {
      expect(evaluateCondition(
        { field: 'email', operator: 'empieza_con', value: 'maria' },
        makeContext()
      )).toBe(false);
    });

    it('termina_con: debe detectar sufijo', () => {
      expect(evaluateCondition(
        { field: 'email', operator: 'termina_con', value: 'example.com' },
        makeContext()
      )).toBe(true);
    });

    it('termina_con: debe retornar false si no termina', () => {
      expect(evaluateCondition(
        { field: 'email', operator: 'termina_con', value: 'gmail.com' },
        makeContext()
      )).toBe(false);
    });
  });

  describe('Operadores de existencia', () => {
    it('vacio: debe detectar campo vacío (string vacío)', () => {
      expect(evaluateCondition(
        { field: 'noExiste', operator: 'vacio' },
        makeContext()
      )).toBe(true);
    });

    it('vacio: debe retornar false si el campo tiene valor', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'vacio' },
        makeContext()
      )).toBe(false);
    });

    it('no_vacio: debe retornar true si el campo tiene valor', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'no_vacio' },
        makeContext()
      )).toBe(true);
    });

    it('no_vacio: debe retornar false si el campo no existe', () => {
      expect(evaluateCondition(
        { field: 'campoInexistente', operator: 'no_vacio' },
        makeContext()
      )).toBe(false);
    });
  });

  describe('Operadores numéricos', () => {
    it('mayor_que: debe comparar correctamente', () => {
      expect(evaluateCondition(
        { field: 'puntuacion', operator: 'mayor_que', value: '80' },
        makeContext()
      )).toBe(true);
    });

    it('mayor_que: debe retornar false si es menor', () => {
      expect(evaluateCondition(
        { field: 'puntuacion', operator: 'mayor_que', value: '90' },
        makeContext()
      )).toBe(false);
    });

    it('menor_que: debe comparar correctamente', () => {
      expect(evaluateCondition(
        { field: 'puntuacion', operator: 'menor_que', value: '90' },
        makeContext()
      )).toBe(true);
    });

    it('mayor_igual: debe incluir el valor límite', () => {
      expect(evaluateCondition(
        { field: 'puntuacion', operator: 'mayor_igual', value: '85' },
        makeContext()
      )).toBe(true);
    });

    it('menor_igual: debe incluir el valor límite', () => {
      expect(evaluateCondition(
        { field: 'puntuacion', operator: 'menor_igual', value: '85' },
        makeContext()
      )).toBe(true);
    });
  });

  describe('Operadores de fecha', () => {
    it('antes_de: fecha pasada vs futura', () => {
      expect(evaluateCondition(
        { field: 'fechaCreacion', operator: 'antes_de', value: '2025-01-01' },
        makeContext()
      )).toBe(true);
    });

    it('antes_de: debe retornar false si es después', () => {
      expect(evaluateCondition(
        { field: 'fechaCreacion', operator: 'antes_de', value: '2020-01-01' },
        makeContext()
      )).toBe(false);
    });

    it('despues_de: fecha después de un punto', () => {
      expect(evaluateCondition(
        { field: 'fechaCreacion', operator: 'despues_de', value: '2020-01-01' },
        makeContext()
      )).toBe(true);
    });

    it('entre_fechas: debe detectar fecha en rango', () => {
      expect(evaluateCondition(
        { field: 'fechaCreacion', operator: 'entre_fechas', startDate: '2024-01-01', endDate: '2024-12-31' },
        makeContext()
      )).toBe(true);
    });

    it('entre_fechas: debe retornar false fuera de rango', () => {
      expect(evaluateCondition(
        { field: 'fechaCreacion', operator: 'entre_fechas', startDate: '2025-01-01', endDate: '2025-12-31' },
        makeContext()
      )).toBe(false);
    });

    it('ultimos_x_dias: debe detectar fecha reciente', () => {
      const today = new Date().toISOString();
      expect(evaluateCondition(
        { field: 'fechaCreacion', operator: 'ultimos_x_dias', value: '365' },
        makeContext({ lead: { fechaCreacion: today } })
      )).toBe(true);
    });
  });

  describe('Operadores de arrays y tags', () => {
    it('incluye: debe detectar elemento en array', () => {
      expect(evaluateCondition(
        { field: 'tags', operator: 'incluye', value: 'vip' },
        makeContext()
      )).toBe(true);
    });

    it('incluye: debe retornar false si no está en array', () => {
      expect(evaluateCondition(
        { field: 'tags', operator: 'incluye', value: 'no-existe' },
        makeContext()
      )).toBe(false);
    });

    it('incluye: debe funcionar con strings separados por coma', () => {
      expect(evaluateCondition(
        { field: 'origen', operator: 'incluye', value: 'web' },
        makeContext()
      )).toBe(true);
    });

    it('no_incluye: debe retornar true si no contiene', () => {
      expect(evaluateCondition(
        { field: 'tags', operator: 'no_incluye', value: 'no-existe' },
        makeContext()
      )).toBe(true);
    });

    it('no_incluye: debe retornar false si contiene', () => {
      expect(evaluateCondition(
        { field: 'tags', operator: 'no_incluye', value: 'vip' },
        makeContext()
      )).toBe(false);
    });
  });

  describe('Operadores booleanos', () => {
    it('es_verdadero: true literal', () => {
      expect(evaluateCondition(
        { field: 'activo', operator: 'es_verdadero' },
        makeContext({ lead: { activo: true } })
      )).toBe(true);
    });

    it('es_verdadero: string "true"', () => {
      expect(evaluateCondition(
        { field: 'activo', operator: 'es_verdadero' },
        makeContext({ lead: { activo: 'true' } })
      )).toBe(true);
    });

    it('es_verdadero: número 1', () => {
      expect(evaluateCondition(
        { field: 'activo', operator: 'es_verdadero' },
        makeContext({ lead: { activo: 1 } })
      )).toBe(true);
    });

    it('es_falso: false literal', () => {
      expect(evaluateCondition(
        { field: 'activo', operator: 'es_falso' },
        makeContext({ lead: { activo: false } })
      )).toBe(true);
    });

    it('es_falso: string "false"', () => {
      expect(evaluateCondition(
        { field: 'activo', operator: 'es_falso' },
        makeContext({ lead: { activo: 'false' } })
      )).toBe(true);
    });
  });

  describe('Entidades (conditionType)', () => {
    it('debe evaluar en lead por defecto', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'igual', value: 'Juan Pérez' },
        makeContext()
      )).toBe(true);
    });

    it('debe evaluar en estudiante si conditionType=estudiante', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'igual', value: 'Ana', conditionType: 'estudiante' },
        makeContext({ estudiante: { nombre: 'Ana', email: 'ana@test.com' } })
      )).toBe(true);
    });

    it('debe evaluar en curso si conditionType=curso', () => {
      expect(evaluateCondition(
        { field: 'titulo', operator: 'igual', value: 'React Avanzado', conditionType: 'curso' },
        makeContext({ curso: { titulo: 'React Avanzado' } })
      )).toBe(true);
    });

    it('debe evaluar en cita si conditionType=cita', () => {
      expect(evaluateCondition(
        { field: 'servicio', operator: 'igual', value: 'Consulta', conditionType: 'cita' },
        makeContext({ cita: { servicio: 'Consulta' } })
      )).toBe(true);
    });

    it('debe evaluar en inscripcion si conditionType=inscripcion', () => {
      expect(evaluateCondition(
        { field: 'estado', operator: 'igual', value: 'activa', conditionType: 'inscripcion' },
        makeContext({ inscripcion: { estado: 'activa' } })
      )).toBe(true);
    });

    it('debe retornar false si la entidad no existe en el contexto', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'igual', value: 'X', conditionType: 'estudiante' },
        makeContext() // sin estudiante
      )).toBe(false);
    });
  });

  describe('Operador desconocido', () => {
    it('debe retornar false para operador no reconocido', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'operador_inventado' as any, value: 'x' },
        makeContext()
      )).toBe(false);
    });
  });

  describe('Sin entidad', () => {
    it('debe retornar false si el contexto no tiene ninguna entidad', () => {
      expect(evaluateCondition(
        { field: 'nombre', operator: 'igual', value: 'x' },
        {} as ExecutionContext
      )).toBe(false);
    });
  });
});
