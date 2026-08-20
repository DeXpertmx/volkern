import { describe, it, expect } from 'vitest';
import { replaceVariables } from '@/lib/automation/variables-parser';

const baseContext: any = {
  tenantId: 't1',
  lead: {
    id: 'lead-1',
    nombre: 'Bruno Hess',
    email: 'bruno@empresa.com',
    telefono: '+34664702631',
    empresa: 'DeXpert',
    estado: 'nuevo',
  },
};

describe('replaceVariables — variables de lead', () => {
  it('resuelve {{nombre}} y {{lead.nombre}}', () => {
    const out = replaceVariables('Hola {{nombre}} / {{lead.nombre}}', baseContext);
    expect(out).toBe('Hola Bruno Hess / Bruno Hess');
  });

  it('resuelve {{contact.first_name}} y {{contact.firstName}} (plantillas de email)', () => {
    const out = replaceVariables('Hola {{contact.first_name}} y {{contact.firstName}}', baseContext);
    expect(out).toBe('Hola Bruno Hess y Bruno Hess');
  });

  it('resuelve email, teléfono y empresa', () => {
    const out = replaceVariables('{{email}} | {{lead.telefono}} | {{empresa}}', baseContext);
    expect(out).toBe('bruno@empresa.com | +34664702631 | DeXpert');
  });

  it('deja intactos los placeholders desconocidos', () => {
    const out = replaceVariables('Hola {{otro.campo}}', baseContext);
    expect(out).toBe('Hola {{otro.campo}}');
  });

  it('sin lead devuelve el texto sin reemplazar', () => {
    const out = replaceVariables('Hola {{nombre}}', { tenantId: 't1' });
    expect(out).toBe('Hola {{nombre}}');
  });
});
