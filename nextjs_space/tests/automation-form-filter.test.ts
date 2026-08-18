import { describe, it, expect } from 'vitest';
import { filterAutomationsByForm } from '@/lib/automation-engine';

function automationWithForm(formId: string | undefined) {
  return {
    id: formId ? `auto-${formId}` : 'auto-generico',
    trigger: 'formulario_enviado',
    activo: true,
    flowData: {
      nodes: [
        { id: 'trigger-1', type: 'trigger', data: { trigger: 'formulario_enviado', config: { formId } } },
        { id: 'action-1', type: 'action', data: {} },
      ],
    },
  };
}

describe('filterAutomationsByForm — formulario específico en el trigger', () => {
  it('sin formulario configurado aplica a cualquier formulario', () => {
    const automations = [automationWithForm(undefined)];
    expect(filterAutomationsByForm(automations, 'formulario_enviado', 'wf-1')).toHaveLength(1);
  });

  it('solo ejecuta la automatización del formulario que coincide', () => {
    const automations = [automationWithForm('wf-1'), automationWithForm('wf-2')];
    const result = filterAutomationsByForm(automations, 'formulario_enviado', 'wf-2');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('auto-wf-2');
  });

  it('no ejecuta ninguna si el formulario no coincide', () => {
    const automations = [automationWithForm('wf-1')];
    expect(filterAutomationsByForm(automations, 'formulario_enviado', 'wf-999')).toHaveLength(0);
  });

  it('mezcla: formulario concreto + genérico (ambos corren si coincide)', () => {
    const automations = [automationWithForm('wf-1'), automationWithForm(undefined)];
    const result = filterAutomationsByForm(automations, 'formulario_enviado', 'wf-1');
    expect(result).toHaveLength(2);
  });

  it('otros triggers no se filtran por formulario', () => {
    const automations = [{ trigger: 'nuevo_lead', flowData: { nodes: [] } }];
    expect(filterAutomationsByForm(automations, 'nuevo_lead', 'wf-1')).toHaveLength(1);
  });

  it('tolera nodes vacíos o flowData sin nodes', () => {
    const automations = [{ trigger: 'formulario_enviado', flowData: { nodes: [] } }];
    expect(filterAutomationsByForm(automations, 'formulario_enviado', 'wf-1')).toHaveLength(1);
    expect(filterAutomationsByForm([{ trigger: 'formulario_enviado' }], 'formulario_enviado', 'wf-1')).toHaveLength(1);
  });
});
