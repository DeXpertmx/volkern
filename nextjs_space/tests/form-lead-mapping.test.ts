import { describe, expect, it } from 'vitest';
import {
  inferStandardTarget,
  resolveLeadMapping,
  resolveFormFieldTarget,
} from '@/lib/marketing/form-lead-mapping';

describe('mapeo de campos de formularios a leads', () => {
  it('infiere campos estándar por su clave habitual', () => {
    expect(inferStandardTarget('email')).toBe('standard:email');
    expect(inferStandardTarget('telefono')).toBe('standard:telefono');
    expect(inferStandardTarget('campo_libre')).toBe('');
  });

  it('prioriza el destino explícito configurado por el formulario', () => {
    const config = { fieldMappings: { correo_cliente: 'standard:email' } };
    expect(resolveFormFieldTarget(config, 'correo_cliente')).toBe('standard:email');
  });

  it('mantiene compatibilidad con el mapping antiguo destino -> origen', () => {
    expect(resolveFormFieldTarget({ mapping: { email: 'correo_cliente' } }, 'correo_cliente')).toBe('standard:email');
  });

  it('separa campos estándar, personalizados y respuestas sin destino', () => {
    const result = resolveLeadMapping(
      {
        fieldMappings: {
          correo_cliente: 'standard:email',
          tipo_cliente: 'custom:tipo_cliente',
          comentario: 'ignore',
        },
      },
      {
        correo_cliente: 'ana@example.com',
        tipo_cliente: 'empresa',
        comentario: 'No guardar como campo',
        origen_campana: 'Facebook',
      },
      [{ fieldKey: 'tipo_cliente', activo: true }],
    );

    expect(result.standard).toEqual({ email: 'ana@example.com' });
    expect(result.custom).toEqual({ tipo_cliente: 'empresa' });
    expect(result.unmapped).toEqual([['origen_campana', 'Facebook']]);
  });

  it('enlaza automáticamente un fieldKey personalizado que coincide con el nombre del campo', () => {
    const result = resolveLeadMapping(
      {},
      { actividad_empresarial: 'Marketing Digital' },
      [{ fieldKey: 'actividad_empresarial', activo: true }],
    );

    expect(result.custom).toEqual({ actividad_empresarial: 'Marketing Digital' });
    expect(result.unmapped).toEqual([]);
  });

  it('prioriza los campos personalizados del tenant aunque coincidan con nombres estándar', () => {
    const result = resolveLeadMapping(
      {},
      {
        cargo_empresa: 'Directora',
        linkedin: 'https://linkedin.com/in/alejandra',
        comunidad_empresarial: 'No',
        contactos_empresariales: '25',
      },
      [
        { fieldKey: 'cargo_empresa', type: 'text', activo: true },
        { fieldKey: 'linkedin', type: 'text', activo: true },
        { fieldKey: 'comunidad_empresarial', type: 'boolean', activo: true },
        { fieldKey: 'contactos_empresariales', type: 'number', activo: true },
      ],
    );

    expect(result.standard).toEqual({});
    expect(result.custom).toEqual({
      cargo_empresa: 'Directora',
      linkedin: 'https://linkedin.com/in/alejandra',
      comunidad_empresarial: false,
      contactos_empresariales: '25',
    });
    expect(result.unmapped).toEqual([]);
  });

  it('conserva correctamente un valor booleano false recibido como boolean o como texto', () => {
    const definitions = [{ fieldKey: 'comunidad_empresarial', type: 'boolean', activo: true }];
    expect(resolveLeadMapping({}, { comunidad_empresarial: false }, definitions).custom)
      .toEqual({ comunidad_empresarial: false });
    expect(resolveLeadMapping({}, { comunidad_empresarial: 'Sí' }, definitions).custom)
      .toEqual({ comunidad_empresarial: true });
  });

  it('resuelve claves antiguas del formulario por la etiqueta del campo CRM', () => {
    // Mismo payload que el formulario publicado en producción: las claves
    // `cargo` y `numero_contactos` no existen en el CRM; deben resolverse
    // automáticamente a cargo_empresa y contactos_empresariales.
    const result = resolveLeadMapping(
      {},
      {
        cargo: 'Director',
        linkedin: 'https://linkedin.com/in/bruno',
        numero_contactos: '31-50',
        comunidad_empresarial: 'false',
      },
      [
        { fieldKey: 'cargo_empresa', label: 'Cargo', type: 'text', activo: true },
        { fieldKey: 'linkedin', label: 'LinkedIn', type: 'text', activo: true },
        { fieldKey: 'contactos_empresariales', label: 'Número aproximado de contactos empresariales', type: 'select', activo: true },
        { fieldKey: 'comunidad_empresarial', label: '¿Perteneces a alguna comunidad empresarial?', type: 'boolean', activo: true },
      ],
    );

    expect(result.standard).toEqual({});
    expect(result.custom).toEqual({
      cargo_empresa: 'Director',
      linkedin: 'https://linkedin.com/in/bruno',
      contactos_empresariales: '31-50',
      comunidad_empresarial: false,
    });
    expect(result.unmapped).toEqual([]);
  });

  it('resuelve claves antiguas usando el placeholder del formulario publicado', () => {
    // El formulario publicado manda `numero_contactos`; su placeholder en el
    // config del formulario coincide con la etiqueta del campo CRM.
    const config = {
      pages: [{
        elements: [
          { name: 'numero_contactos', title: '', placeholder: 'Número aproximado de contactos empresariales' },
          { name: 'cargo', title: '', placeholder: 'Cargo' },
        ],
      }],
    };
    const result = resolveLeadMapping(
      config,
      { numero_contactos: '11-30', cargo: 'CFO' },
      [
        { fieldKey: 'contactos_empresariales', label: 'Número aproximado de contactos empresariales', type: 'select', activo: true },
        { fieldKey: 'cargo_empresa', label: 'Cargo', type: 'text', activo: true },
      ],
    );

    expect(result.custom).toEqual({ contactos_empresariales: '11-30', cargo_empresa: 'CFO' });
    expect(result.unmapped).toEqual([]);
  });

  it('no escribe en un campo personalizado inexistente del tenant', () => {
    const result = resolveLeadMapping(
      { fieldMappings: { sector: 'custom:sector_inventado' } },
      { sector: 'Construcción' },
      [],
    );

    expect(result.custom).toEqual({});
    expect(result.unmapped).toEqual([['sector', 'Construcción']]);
  });
});
