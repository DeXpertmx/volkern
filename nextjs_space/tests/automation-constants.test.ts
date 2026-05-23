import { describe, it, expect } from 'vitest';
import { VALID_TRIGGERS } from '@/lib/automation/constants';

describe('automation/constants — VALID_TRIGGERS', () => {
  it('debe tener triggers de CRM/Leads', () => {
    expect(VALID_TRIGGERS.nuevo_lead).toBe('Nuevo Lead Creado');
    expect(VALID_TRIGGERS.lead_actualizado).toBe('Lead Actualizado');
    expect(VALID_TRIGGERS.lead_etiquetado).toBe('Lead Etiquetado');
    expect(VALID_TRIGGERS.lead_sin_respuesta).toBe('Lead Sin Respuesta (24h)');
  });

  it('debe tener triggers de Citas', () => {
    expect(VALID_TRIGGERS.cita_agendada).toBe('Cita Agendada');
    expect(VALID_TRIGGERS.cita_confirmada).toBe('Cita Confirmada');
    expect(VALID_TRIGGERS.cita_cancelada).toBe('Cita Cancelada');
  });

  it('debe tener triggers de Academia', () => {
    expect(VALID_TRIGGERS.estudiante_inscrito).toBe('Estudiante Inscrito');
    expect(VALID_TRIGGERS.estudiante_completa_curso).toBe('Completa Curso');
    expect(VALID_TRIGGERS.leccion_completada).toBe('Lección Completada');
  });

  it('debe tener triggers de Pagos', () => {
    expect(VALID_TRIGGERS.pago_recibido).toBe('Pago Recibido');
    expect(VALID_TRIGGERS.pago_fallido).toBe('Pago Fallido');
  });

  it('debe tener triggers de Externos/n8n', () => {
    expect(VALID_TRIGGERS.webhook_recibido).toBe('Webhook Recibido');
    expect(VALID_TRIGGERS.n8n_workflow_completado).toBe('Workflow n8n Completado');
    expect(VALID_TRIGGERS.n8n_workflow_fallido).toBe('Workflow n8n Fallido');
    expect(VALID_TRIGGERS.evento_externo).toBe('Evento Externo');
  });

  it('debe tener exactamente 16 triggers', () => {
    const keys = Object.keys(VALID_TRIGGERS);
    expect(keys).toHaveLength(16);
  });

  it('todas las claves deben ser strings no vacíos', () => {
    for (const key of Object.keys(VALID_TRIGGERS)) {
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    }
  });

  it('todos los valores deben ser strings no vacíos', () => {
    for (const value of Object.values(VALID_TRIGGERS)) {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
    }
  });

  it('no debe haber claves duplicadas', () => {
    const keys = Object.keys(VALID_TRIGGERS);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('no debe haber valores duplicados', () => {
    const values = Object.values(VALID_TRIGGERS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('cada clave debe seguir el patrón snake_case', () => {
    for (const key of Object.keys(VALID_TRIGGERS)) {
      expect(key).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });
});
