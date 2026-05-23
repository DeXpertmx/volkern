import { describe, it, expect } from 'vitest';
import { CostControl } from '@/lib/event-engine/cost-control';

describe('CostControl', () => {
  // ============================================================
  // generateFallbackResponse
  // ============================================================
  describe('generateFallbackResponse', () => {
    it('debe devolver respuesta para lead_classifier', () => {
      const resp = CostControl.generateFallbackResponse('lead_classifier');
      expect(resp).toContain('"score"');
      expect(resp).toContain('"category"');
      const parsed = JSON.parse(resp);
      expect(parsed.score).toBe(50);
      expect(parsed.category).toBe('C');
    });

    it('debe devolver respuesta para followup_generator', () => {
      const resp = CostControl.generateFallbackResponse('followup_generator');
      expect(resp).toContain('interesado');
      expect(resp).toContain('platiquemos');
    });

    it('debe devolver respuesta para ghosting_recovery', () => {
      const resp = CostControl.generateFallbackResponse('ghosting_recovery');
      expect(resp).toContain('contacto');
      expect(resp).toContain('ayudarte');
    });

    it('debe devolver respuesta para deal_strategy', () => {
      const resp = CostControl.generateFallbackResponse('deal_strategy');
      expect(resp).toContain('"steps"');
      const parsed = JSON.parse(resp);
      expect(parsed.steps).toHaveLength(3);
      expect(parsed.steps).toContain('Agendar llamada');
      expect(parsed.steps).toContain('Enviar propuesta');
      expect(parsed.steps).toContain('Hacer follow-up');
    });

    it('debe devolver respuesta para response_assistant', () => {
      const resp = CostControl.generateFallbackResponse('response_assistant');
      expect(resp).toContain('brevedad');
    });

    it('debe devolver "Respuesta automática" para agentes desconocidos', () => {
      const resp = CostControl.generateFallbackResponse('agente_inexistente');
      expect(resp).toBe('Respuesta automática');
    });

    it('debe devolver respuesta genérica para string vacío', () => {
      const resp = CostControl.generateFallbackResponse('');
      expect(resp).toBe('Respuesta automática');
    });
  });

  // ============================================================
  // Cobertura de todos los agentes permitidos
  // ============================================================
  describe('todos los agentes permitidos tienen fallback no genérico', () => {
    it('debe tener los 5 agentes permitidos', () => {
      // Verificamos los fallbacks cubren todos los allowed_agents
      const agents = [
        'lead_classifier',
        'followup_generator',
        'ghosting_recovery',
        'deal_strategy',
        'response_assistant',
      ];

      for (const agent of agents) {
        const resp = CostControl.generateFallbackResponse(agent);
        expect(resp).toBeTruthy();
        expect(resp).not.toBe('Respuesta automática');
      }
    });
  });
});
