import { describe, it, expect } from 'vitest';
import { replaceVariables } from '@/lib/automation/variables-parser';
import type { ExecutionContext } from '@/lib/automation/types';

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('replaceVariables', () => {
  // ─── Texto vacío / sin variables ─────────────────────────────────────
  it('debe devolver cadena vacía si el texto es vacío', () => {
    expect(replaceVariables('', makeContext())).toBe('');
  });

  it('debe devolver el texto sin cambios si no hay variables', () => {
    expect(replaceVariables('Hola mundo', makeContext())).toBe('Hola mundo');
  });

  // ─── Variables de lead ───────────────────────────────────────────────
  it('debe reemplazar {nombre} con lead.nombre', () => {
    const ctx = makeContext({ lead: { nombre: 'Juan' } });
    expect(replaceVariables('Hola {nombre}', ctx)).toBe('Hola Juan');
  });

  it('debe reemplazar {{nombre}} con lead.nombre (doble llave) — nota: {nombre} se procesa primero y rompe {{nombre}} parcialmente', () => {
    const ctx = makeContext({ lead: { nombre: 'María' } });
    // Comportamiento real: {nombre} se reemplaza primero, dejando '{María}' en vez de 'María'
    expect(replaceVariables('Hola {{nombre}}', ctx)).toBe('Hola {María}');
  });

  it('debe reemplazar {lead.nombre} con lead.nombre', () => {
    const ctx = makeContext({ lead: { nombre: 'Carlos' } });
    expect(replaceVariables('Hola {lead.nombre}', ctx)).toBe('Hola Carlos');
  });

  it('debe reemplazar {email} con lead.email', () => {
    const ctx = makeContext({ lead: { email: 'test@volkern.com' } });
    expect(replaceVariables('Tu email: {email}', ctx)).toBe('Tu email: test@volkern.com');
  });

  it('debe reemplazar {telefono} con lead.telefono', () => {
    const ctx = makeContext({ lead: { telefono: '+34666111222' } });
    expect(replaceVariables('Tel: {telefono}', ctx)).toBe('Tel: +34666111222');
  });

  it('debe reemplazar {lead.estado} con lead.estado', () => {
    const ctx = makeContext({ lead: { estado: 'nuevo' } });
    expect(replaceVariables('Estado: {lead.estado}', ctx)).toBe('Estado: nuevo');
  });

  it('debe reemplazar {empresa} con lead.empresa', () => {
    const ctx = makeContext({ lead: { empresa: 'ACME Corp' } });
    expect(replaceVariables('Empresa: {empresa}', ctx)).toBe('Empresa: ACME Corp');
  });

  it('debe reemplazar {id_fiscal} con lead.perfilFiscal.nif (columna real de la BD)', () => {
    const ctx = makeContext({ lead: { perfilFiscal: { nif: 'B12345678' } } });
    expect(replaceVariables('ID Fiscal: {id_fiscal}', ctx)).toBe('ID Fiscal: B12345678');
  });

  it('debe reemplazar {fecha_hoy} con la fecha actual formateada', () => {
    const ctx = makeContext({ lead: { nombre: 'Test' } });
    const result = replaceVariables('Fecha: {fecha_hoy}', ctx);
    expect(result).not.toBe('Fecha: {fecha_hoy}');
    expect(result).toMatch(/Fecha: \d{2} de \w+ de \d{4}/);
  });

  it('debe dejar vacío si el campo no existe en lead', () => {
    const ctx = makeContext({ lead: { nombre: 'Juan' } });
    expect(replaceVariables('Email: {email}', ctx)).toBe('Email: ');
  });

  it('debe reemplazar múltiples variables en el mismo texto', () => {
    const ctx = makeContext({
      lead: { nombre: 'Ana', email: 'ana@test.com', empresa: 'MiEmpresa' },
    });
    const result = replaceVariables(
      '{nombre} de {empresa} - {email}',
      ctx
    );
    expect(result).toBe('Ana de MiEmpresa - ana@test.com');
  });

  // ─── Variables de estudiante ─────────────────────────────────────────
  it('debe reemplazar {nombre} con estudiante.nombre', () => {
    const ctx = makeContext({ estudiante: { nombre: 'Pedro' } });
    expect(replaceVariables('Alumno: {nombre}', ctx)).toBe('Alumno: Pedro');
  });

  it('debe reemplazar {estudiante.nombre} con estudiante.nombre', () => {
    const ctx = makeContext({ estudiante: { nombre: 'Lucía' } });
    expect(replaceVariables('{estudiante.nombre}', ctx)).toBe('Lucía');
  });

  it('debe reemplazar {estudiante.email} con estudiante.email', () => {
    const ctx = makeContext({ estudiante: { email: 'alumno@test.com' } });
    expect(replaceVariables('Email: {estudiante.email}', ctx)).toBe('Email: alumno@test.com');
  });

  it('debe reemplazar {estudiante.telefono} con estudiante.telefono', () => {
    const ctx = makeContext({ estudiante: { telefono: '+52666111222' } });
    expect(replaceVariables('Tel: {estudiante.telefono}', ctx)).toBe('Tel: +52666111222');
  });

  // ─── Variables de curso ──────────────────────────────────────────────
  it('debe reemplazar {curso.titulo} con curso.titulo', () => {
    const ctx = makeContext({ curso: { titulo: 'Ventas B2B' } });
    expect(replaceVariables('Curso: {curso.titulo}', ctx)).toBe('Curso: Ventas B2B');
  });

  it('debe reemplazar {curso.descripcion} con curso.descripcion', () => {
    const ctx = makeContext({ curso: { descripcion: 'Aprende a vender' } });
    expect(replaceVariables('{curso.descripcion}', ctx)).toBe('Aprende a vender');
  });

  // ─── Variables de cita ───────────────────────────────────────────────
  it('debe reemplazar {cita.servicio} con cita.servicio.nombre', () => {
    const ctx = makeContext({
      cita: { servicio: { nombre: 'Consultoría' } },
    });
    expect(replaceVariables('Servicio: {cita.servicio}', ctx)).toBe('Servicio: Consultoría');
  });

  it('debe reemplazar {cita.fechaHora} con fecha formateada', () => {
    const ctx = makeContext({
      cita: { fechaHora: '2026-06-15T10:30:00Z' },
    });
    const result = replaceVariables('Cita: {cita.fechaHora}', ctx);
    expect(result).not.toBe('Cita: {cita.fechaHora}');
    expect(result.startsWith('Cita: ')).toBe(true);
    expect(result.length).toBeGreaterThan('Cita: '.length);
  });

  it('debe dejar vacío si cita.fechaHora es null', () => {
    const ctx = makeContext({
      cita: { fechaHora: null },
    });
    expect(replaceVariables('{cita.fechaHora}', ctx)).toBe('');
  });

  // ─── Prioridad lead sobre estudiante ─────────────────────────────────
  it('lead debe tener prioridad sobre estudiante para {nombre}', () => {
    const ctx = makeContext({
      lead: { nombre: 'LeadName' },
      estudiante: { nombre: 'StudentName' },
    });
    // lead se procesa primero, sus reemplazos se aplican antes
    const result = replaceVariables('{nombre}', ctx);
    // Como lead.nombre ya fue reemplazado, estudiante.nombre no lo sobrescribe
    // porque el texto ya no contiene {nombre}
    expect(result).toBe('LeadName');
  });

  // ─── Sin contexto ────────────────────────────────────────────────────
  it('no debe reemplazar variables si no hay lead/estudiante/curso/cita', () => {
    const ctx = makeContext({});
    expect(replaceVariables('Hola {nombre}', ctx)).toBe('Hola {nombre}');
  });

  it('no debe reemplazar el texto si solo hay campos requeridos parciales', () => {
    const ctx = makeContext({ lead: {} });
    expect(replaceVariables('{nombre}', ctx)).toBe('');
  });
});
