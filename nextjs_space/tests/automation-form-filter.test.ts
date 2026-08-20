import { describe, it, expect } from 'vitest';
import { filterAutomationsByForm, filterAutomationsByTrigger } from '@/lib/automation-engine';

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

describe('Regresión: el trigger del NODO del canvas es la fuente de verdad (bug Preregistro)', () => {
  // El builder podía guardar 'nuevo_lead' en la columna mientras el nodo del
  // canvas decía 'formulario_enviado'. El motor NO debe depender de la columna
  // desnormalizada: debe derivar el trigger del nodo trigger del flowData.
  it('encuentra la automatización aunque la columna esté desincronizada', () => {
    const automations = [
      {
        id: 'auto-preregistro',
        trigger: 'nuevo_lead', // columna desincronizada (bug histórico)
        activo: true,
        flowData: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', data: { trigger: 'formulario_enviado', config: { formId: 'wf-1' } } },
            { id: 'action-1', type: 'action', data: {} },
          ],
        },
      },
    ];

    const porTrigger = filterAutomationsByTrigger(automations, 'formulario_enviado');
    expect(porTrigger).toHaveLength(1);
    expect(porTrigger[0].id).toBe('auto-preregistro');

    // Y el filtro por formulario sigue aplicando después.
    const result = filterAutomationsByForm(porTrigger, 'formulario_enviado', 'wf-1');
    expect(result).toHaveLength(1);
  });

  it('cae a la columna cuando el nodo no define trigger', () => {
    const automations = [
      { id: 'auto-col', trigger: 'nuevo_lead', activo: true, flowData: { nodes: [{ id: 't', type: 'trigger', data: {} }] } },
    ];
    expect(filterAutomationsByTrigger(automations, 'nuevo_lead')).toHaveLength(1);
    expect(filterAutomationsByTrigger(automations, 'formulario_enviado')).toHaveLength(0);
  });

  it('no incluye automatizaciones de otros triggers', () => {
    const automations = [
      { id: 'a1', trigger: 'formulario_enviado', activo: true, flowData: { nodes: [{ id: 't', type: 'trigger', data: { trigger: 'formulario_enviado' } }] } },
      { id: 'a2', trigger: 'cita_agendada', activo: true, flowData: { nodes: [{ id: 't', type: 'trigger', data: { trigger: 'cita_agendada' } }] } },
    ];
    const result = filterAutomationsByTrigger(automations, 'cita_agendada');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
  });
});
