import { describe, it, expect } from 'vitest';
import { buildLeadNotas, CAMPOS_ESTANDAR } from '@/app/api/formularios/[id]/submit/route';

describe('buildLeadNotas — campos no estándar del formulario van a las notas', () => {
  it('incluye el nombre del formulario como contexto', () => {
    const notas = buildLeadNotas({ email: 'a@b.com' }, 'Formulario de Contacto');
    expect(notas).toContain('Formulario de Contacto');
  });

  it('agrega los campos personalizados que no tienen columna propia', () => {
    const notas = buildLeadNotas(
      { nombre: 'Ana', email: 'ana@x.com', pais: 'México', interes: 'Plan Pro', preferencias: ['email', 'tel'] },
      'Lead Magneto'
    );
    expect(notas).toContain('pais: México');
    expect(notas).toContain('interes: Plan Pro');
    expect(notas).toContain('preferencias: email, tel');
    // Los campos estándar NO se repiten en notas
    expect(notas).not.toContain('nombre: Ana');
    expect(notas).not.toContain('email: ana@x.com');
  });

  it('incluye las notas del solicitante cuando existen', () => {
    const notas = buildLeadNotas({ email: 'a@b.com' }, 'Form', 'Quiero info de precios');
    expect(notas).toContain('Quiero info de precios');
  });

  it('ignora campos vacíos o nulos', () => {
    const notas = buildLeadNotas(
      { email: 'a@b.com', empresa_extra: '', vacio: null, indefinido: undefined, ok: 'si' },
      'Form'
    );
    expect(notas).not.toContain('empresa_extra');
    expect(notas).not.toContain('vacio');
    expect(notas).not.toContain('indefinido');
    expect(notas).toContain('ok: si');
  });

  it('respeta las variantes de mayúsculas de los campos estándar', () => {
    const notas = buildLeadNotas(
      { Email: 'a@b.com', Nombre: 'Ana', Telefono: '555', Empresa: 'ACME', Notas: 'x', custom: 'y' },
      'Form'
    );
    expect(notas).not.toContain('Email:');
    expect(notas).not.toContain('Nombre:');
    expect(notas).not.toContain('Telefono:');
    expect(notas).not.toContain('Empresa:');
    expect(notas).not.toContain('Notas:');
    expect(notas).toContain('custom: y');
  });

  it('CAMPOS_ESTANDAR cubre email, nombre, teléfono, empresa y notas en sus variantes', () => {
    for (const k of ['email', 'Email', 'correo', 'nombre', 'name', 'Nombre', 'telefono', 'phone', 'Telefono', 'empresa', 'company', 'Empresa', 'notas', 'notes', 'Notas']) {
      expect(CAMPOS_ESTANDAR.has(k)).toBe(true);
    }
  });
});
