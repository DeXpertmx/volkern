import { describe, it, expect } from 'vitest';
import { transformApolloContactToLead } from '@/lib/apollo-io';

const makeContact = (overrides: Record<string, any> = {}) => ({
  id: 'apollo-123',
  first_name: 'Juan',
  last_name: 'Pérez',
  name: 'Juan Pérez',
  title: 'CEO',
  email: 'juan@empresa.com',
  phone_numbers: [{ raw_number: '+525512345678', sanitized_number: '525512345678' }],
  organization: {
    id: 'org-456',
    name: 'Empresa SA',
    website_url: 'https://empresa.com',
    industry: 'Software',
    linkedin_url: 'https://linkedin.com/company/empresa',
  },
  city: 'Ciudad de México',
  state: 'CDMX',
  country: 'México',
  linkedin_url: 'https://linkedin.com/in/juanperez',
  ...overrides,
});

describe('transformApolloContactToLead', () => {
  it('debe transformar un contacto completo a formato lead', () => {
    const contact = makeContact();
    const result = transformApolloContactToLead(contact);

    expect(result.nombre).toBe('Juan');
    expect(result.apellido).toBe('Pérez');
    expect(result.email).toBe('juan@empresa.com');
    expect(result.telefono).toBe('525512345678');
    expect(result.empresa).toBe('Empresa SA');
    expect(result.cargo).toBe('CEO');
    expect(result.pais).toBe('México');
    expect(result.ciudad).toBe('Ciudad de México');
    expect(result.estado).toBe('CDMX');
    expect(result.sitioWeb).toBe('https://empresa.com');
    expect(result.linkedinUrl).toBe('https://linkedin.com/in/juanperez');
    expect(result.industria).toBe('Software');
  });

  it('debe marcar la fuente como apollo', () => {
    const result = transformApolloContactToLead(makeContact());
    expect(result.fuente).toBe('apollo');
  });

  it('debe incluir metadata con apollo_id y organization_linkedin', () => {
    const result = transformApolloContactToLead(makeContact());
    expect(result.metadata).toEqual({
      apollo_id: 'apollo-123',
      organization_linkedin: 'https://linkedin.com/company/empresa',
    });
  });

  it('debe manejar first_name vacío', () => {
    const result = transformApolloContactToLead(makeContact({ first_name: '' }));
    expect(result.nombre).toBe('');
  });

  it('debe manejar last_name vacío', () => {
    const result = transformApolloContactToLead(makeContact({ last_name: '' }));
    expect(result.apellido).toBe('');
  });

  it('debe manejar email vacío', () => {
    const result = transformApolloContactToLead(makeContact({ email: '' }));
    expect(result.email).toBe('');
  });

  it('debe manejar sin phone_numbers', () => {
    const result = transformApolloContactToLead(makeContact({ phone_numbers: undefined }));
    expect(result.telefono).toBe('');
  });

  it('debe manejar lista de phone_numbers vacía', () => {
    const result = transformApolloContactToLead(makeContact({ phone_numbers: [] }));
    expect(result.telefono).toBe('');
  });

  it('debe manejar sin organización', () => {
    const result = transformApolloContactToLead(makeContact({ organization: undefined }));
    expect(result.empresa).toBe('');
    expect(result.sitioWeb).toBe('');
    expect(result.industria).toBe('');
    expect(result.metadata.organization_linkedin).toBeUndefined();
  });

  it('debe manejar organización sin website ni industry ni linkedin', () => {
    const result = transformApolloContactToLead(makeContact({
      organization: { id: 'org-456', name: 'Empresa SA' },
    }));
    expect(result.empresa).toBe('Empresa SA');
    expect(result.sitioWeb).toBe('');
    expect(result.industria).toBe('');
    expect(result.metadata.organization_linkedin).toBeUndefined();
  });

  it('debe manejar campos opcionales vacíos (city, state, country)', () => {
    const result = transformApolloContactToLead(makeContact({ city: '', state: '', country: '' }));
    expect(result.pais).toBe('');
    expect(result.ciudad).toBe('');
    expect(result.estado).toBe('');
  });

  it('debe manejar linkedin_url vacío', () => {
    const result = transformApolloContactToLead(makeContact({ linkedin_url: '' }));
    expect(result.linkedinUrl).toBe('');
  });

  it('debe manejar title/cargo vacío', () => {
    const result = transformApolloContactToLead(makeContact({ title: '' }));
    expect(result.cargo).toBe('');
  });

  it('debe ser determinista', () => {
    const contact = makeContact();
    const r1 = transformApolloContactToLead(contact);
    const r2 = transformApolloContactToLead(contact);
    expect(r1).toEqual(r2);
  });

  it('debe manejar contacto mínimo (solo id y name)', () => {
    const result = transformApolloContactToLead({
      id: 'min-001',
      first_name: '',
      last_name: '',
      name: '',
      title: '',
    } as any);
    expect(result.nombre).toBe('');
    expect(result.email).toBe('');
    expect(result.empresa).toBe('');
    expect(result.fuente).toBe('apollo');
  });
});
