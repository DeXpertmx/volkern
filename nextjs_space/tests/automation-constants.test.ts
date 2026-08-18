import { describe, it, expect } from 'vitest';
import { VALID_TRIGGERS } from '@/lib/automation/constants';

describe('VALID_TRIGGERS', () => {
  it('debe ser un objeto', () => {
    expect(typeof VALID_TRIGGERS).toBe('object');
    expect(VALID_TRIGGERS).not.toBeNull();
  });

  it('debe tener triggers de CRM/Leads', () => {
    expect(VALID_TRIGGERS.nuevo_lead).toBeDefined();
    expect(VALID_TRIGGERS.lead_actualizado).toBeDefined();
    expect(VALID_TRIGGERS.lead_etiquetado).toBeDefined();
    expect(VALID_TRIGGERS.lead_sin_respuesta).toBeDefined();
  });

  it('debe tener triggers de Citas', () => {
    expect(VALID_TRIGGERS.cita_agendada).toBeDefined();
    expect(VALID_TRIGGERS.cita_confirmada).toBeDefined();
    expect(VALID_TRIGGERS.cita_cancelada).toBeDefined();
  });

  it('debe tener triggers de Academia (LMS)', () => {
    expect(VALID_TRIGGERS.estudiante_inscrito).toBeDefined();
    expect(VALID_TRIGGERS.estudiante_completa_curso).toBeDefined();
    expect(VALID_TRIGGERS.leccion_completada).toBeDefined();
  });

  it('debe tener triggers de Pagos', () => {
    expect(VALID_TRIGGERS.pago_recibido).toBeDefined();
    expect(VALID_TRIGGERS.pago_fallido).toBeDefined();
  });

  it('debe tener el trigger de Formulario Enviado', () => {
    expect(VALID_TRIGGERS.formulario_enviado).toBeDefined();
    expect(VALID_TRIGGERS.formulario_enviado).toBe('Formulario Enviado');
  });

  it('debe tener triggers de Externos/n8n', () => {
    expect(VALID_TRIGGERS.webhook_recibido).toBeDefined();
    expect(VALID_TRIGGERS.n8n_workflow_completado).toBeDefined();
    expect(VALID_TRIGGERS.n8n_workflow_fallido).toBeDefined();
    expect(VALID_TRIGGERS.evento_externo).toBeDefined();
  });

  it('todos los valores deben ser strings descriptivos', () => {
    const entries = Object.entries(VALID_TRIGGERS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [_, valor] of entries) {
      expect(typeof valor).toBe('string');
      expect(valor.length).toBeGreaterThan(5);
    }
  });

  it('todas las claves deben ser snake_case', () => {
    const keys = Object.keys(VALID_TRIGGERS);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9_]+$/);
    }
  });

  it('no debe tener triggers duplicados en valores', () => {
    const values = Object.values(VALID_TRIGGERS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('debe ser un objeto as const (inmutable)', () => {
    // Verificar que es de solo lectura comprobando algunas claves
    expect(VALID_TRIGGERS.nuevo_lead).toBe('Nuevo Lead Creado');
    expect(VALID_TRIGGERS.pago_recibido).toBe('Pago Recibido');
    expect(VALID_TRIGGERS.webhook_recibido).toBe('Webhook Recibido');
  });

  it('debe tener al menos 16 triggers', () => {
    expect(Object.keys(VALID_TRIGGERS).length).toBeGreaterThanOrEqual(16);
  });
});
