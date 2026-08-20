import { describe, it, expect } from 'vitest';
import { getTriggerFromFlow } from '@/lib/automation/flow-trigger';

describe('getTriggerFromFlow — el trigger del nodo del canvas es la fuente de verdad', () => {
  it('devuelve el trigger del nodo trigger aunque la columna difiera', () => {
    const flowData = {
      nodes: [
        { id: 'trigger-1', type: 'trigger', data: { trigger: 'formulario_enviado', config: { formId: 'wf-1' } } },
        { id: 'action-1', type: 'action', data: {} },
      ],
    };
    expect(getTriggerFromFlow(flowData, 'nuevo_lead')).toBe('formulario_enviado');
  });

  it('cae al fallback cuando no hay nodo trigger', () => {
    expect(getTriggerFromFlow({ nodes: [{ id: 'a', type: 'action', data: {} }] }, 'nuevo_lead')).toBe('nuevo_lead');
    expect(getTriggerFromFlow({ nodes: [] }, undefined)).toBe('manual');
  });

  it('tolera flowData inválido o vacío', () => {
    expect(getTriggerFromFlow(null, 'cita_agendada')).toBe('cita_agendada');
    expect(getTriggerFromFlow(undefined, 'cita_agendada')).toBe('cita_agendada');
    expect(getTriggerFromFlow({}, 'cita_agendada')).toBe('cita_agendada');
  });

  it('ignora un nodo trigger sin data.trigger', () => {
    const flowData = { nodes: [{ id: 't', type: 'trigger', data: { config: {} } }] };
    expect(getTriggerFromFlow(flowData, 'pago_recibido')).toBe('pago_recibido');
  });
});
