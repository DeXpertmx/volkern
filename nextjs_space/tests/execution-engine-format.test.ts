import { describe, it, expect, vi } from 'vitest';

// Evita instanciar Prisma al importar el motor (los formateadores no lo usan)
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { ExecutionEngine } from '@/lib/agents/execution-engine';

describe('ExecutionEngine.formatSkillResult — Ventas (listados y búsqueda)', () => {
  it('find_lead_by_email muestra los datos del lead encontrado', () => {
    const msg = ExecutionEngine.formatSkillResult('find_lead_by_email', {
      nombre: 'Juan Pérez',
      email: 'juan@test.com',
      telefono: '+525511223344',
      empresa: 'Acme Corp',
      cargo: 'Gerente',
      estado: 'nuevo',
      notas: 'Interesado en software',
    });
    expect(msg).toContain('Juan Pérez');
    // El email va escapado para Markdown de Telegram (juan\@test\.com)
    expect(msg.replace(/\\/g, '')).toContain('juan@test.com');
    expect(msg).toContain('Acme Corp');
    expect(msg).toContain('Gerente');
  });

  it('find_lead_by_email con data null devuelve cadena vacía (el wrapper lanza el error)', () => {
    expect(ExecutionEngine.formatSkillResult('find_lead_by_email', null)).toBe('');
  });

  it('list_leads lista hasta 5 leads con total y sufijo', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      nombre: `Lead ${i + 1}`,
      email: `lead${i + 1}@test.com`,
      estado: 'nuevo',
    }));
    const msg = ExecutionEngine.formatSkillResult('list_leads', { items, total: 7 });
    expect(msg).toContain('Leads (7)');
    expect(msg).toContain('Lead 1');
    expect(msg).toContain('Lead 5');
    expect(msg).not.toContain('Lead 6');
    expect(msg).toContain('y 2 más');
  });

  it('list_leads vacío muestra mensaje de ausencia', () => {
    const msg = ExecutionEngine.formatSkillResult('list_leads', { items: [], total: 0 });
    expect(msg).toBe('👥 No hay leads registrados.');
  });

  it('list_contacts marca empresas con 🏢 y lista el total', () => {
    const items = [
      { nombre: 'Laura Gómez', email: 'laura@test.com', tipo: 'person' },
      { nombre: 'Acme Corp', email: 'acme@test.com', tipo: 'company' },
    ];
    const msg = ExecutionEngine.formatSkillResult('list_contacts', { items, total: 2 });
    expect(msg).toContain('Contactos (2)');
    expect(msg).toContain('Laura Gómez');
    expect(msg).toContain('Acme Corp');
    expect(msg).toContain('🏢 Empresa');
  });

  it('list_contacts vacío muestra mensaje de ausencia', () => {
    const msg = ExecutionEngine.formatSkillResult('list_contacts', { items: [], total: 0 });
    expect(msg).toBe('📇 No hay contactos registrados.');
  });

  it('create_deal muestra título, valor y etapa', () => {
    const msg = ExecutionEngine.formatSkillResult('create_deal', {
      titulo: 'Paquete empresarial',
      valor: 5000,
      moneda: 'EUR',
      etapa: 'calificacion',
    });
    expect(msg).toContain('Negocio creado');
    expect(msg).toContain('Paquete empresarial');
    expect(msg).toContain('5000');
    expect(msg).toContain('calificacion');
  });

  it('update_deal muestra los campos actualizados', () => {
    const msg = ExecutionEngine.formatSkillResult('update_deal', {
      titulo: 'Negocio - Juan',
      etapa: 'negociación',
      valor: 7000,
      moneda: 'EUR',
      prioridad: 'alta',
    });
    expect(msg).toContain('Negocio actualizado');
    expect(msg).toContain('negociación');
    expect(msg).toContain('7000');
    expect(msg).toContain('alta');
  });

  it('list_deals lista hasta 5 deals con lead, valor y etapa', () => {
    const deals = [
      { titulo: 'Consultoría', valor: 3000, moneda: 'EUR', etapa: 'propuesta', lead: { nombre: 'María' } },
      { titulo: 'Licencias', valor: 1200, moneda: 'EUR', etapa: 'calificacion' },
    ];
    const msg = ExecutionEngine.formatSkillResult('list_deals', { deals, total: 2 });
    expect(msg).toContain('Pipeline (2)');
    expect(msg).toContain('Consultoría');
    expect(msg).toContain('María');
    expect(msg).toContain('Licencias');
  });

  it('list_deals vacío muestra mensaje de ausencia', () => {
    const msg = ExecutionEngine.formatSkillResult('list_deals', { deals: [], total: 0 });
    expect(msg).toBe('📊 No hay negocios en el pipeline.');
  });

  it('registrar_interaccion muestra tipo y contenido', () => {
    const msg = ExecutionEngine.formatSkillResult('registrar_interaccion', {
      tipo: 'llamada',
      contenido: 'Hablamos sobre el presupuesto',
    });
    expect(msg).toContain('Interacción registrada');
    expect(msg).toContain('llamada');
    expect(msg).toContain('Hablamos sobre el presupuesto');
  });
});
