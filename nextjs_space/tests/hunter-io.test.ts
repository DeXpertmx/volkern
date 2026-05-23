import { describe, it, expect } from 'vitest';
import { transformHunterToLead } from '@/lib/hunter-io';

const makeHunterEmail = (overrides: Record<string, any> = {}) => ({
  value: 'juan@empresa.com',
  type: 'professional',
  confidence: 95,
  firstName: 'Juan',
  lastName: 'Pérez',
  position: 'CEO',
  department: 'Executive',
  linkedin: 'https://linkedin.com/in/juanperez',
  twitter: 'https://twitter.com/juanperez',
  phoneNumber: '+525512345678',
  sources: [
    { domain: 'empresa.com', uri: 'https://empresa.com/team', extracted_on: '2024-01-15' },
  ],
  ...overrides,
});

describe('transformHunterToLead', () => {
  const domain = 'empresa.com';

  it('debe transformar un HunterEmail completo a formato lead', () => {
    const email = makeHunterEmail();
    const result = transformHunterToLead(email, domain);

    expect(result.nombre).toBe('Juan');
    expect(result.apellido).toBe('Pérez');
    expect(result.email).toBe('juan@empresa.com');
    expect(result.telefono).toBe('+525512345678');
    expect(result.empresa).toBe(domain);
    expect(result.cargo).toBe('CEO');
    expect(result.source).toBe('hunter.io');
  });

  it('debe incluir metadata completa', () => {
    const email = makeHunterEmail();
    const result = transformHunterToLead(email, domain);

    expect(result.metadata).toEqual({
      confidence: 95,
      department: 'Executive',
      linkedin: 'https://linkedin.com/in/juanperez',
      twitter: 'https://twitter.com/juanperez',
      sources: email.sources,
      type: 'professional',
    });
  });

  it('debe manejar firstName vacío', () => {
    const result = transformHunterToLead(makeHunterEmail({ firstName: '' }), domain);
    expect(result.nombre).toBe('');
  });

  it('debe manejar lastName vacío', () => {
    const result = transformHunterToLead(makeHunterEmail({ lastName: '' }), domain);
    expect(result.apellido).toBe('');
  });

  it('debe manejar sin phoneNumber', () => {
    const result = transformHunterToLead(makeHunterEmail({ phoneNumber: undefined }), domain);
    expect(result.telefono).toBeNull();
  });

  it('debe manejar phoneNumber null', () => {
    const result = transformHunterToLead(makeHunterEmail({ phoneNumber: null }), domain);
    expect(result.telefono).toBeNull();
  });

  it('debe manejar sin position', () => {
    const result = transformHunterToLead(makeHunterEmail({ position: undefined }), domain);
    expect(result.cargo).toBeNull();
  });

  it('debe manejar sin department', () => {
    const result = transformHunterToLead(makeHunterEmail({ department: undefined }), domain);
    expect(result.metadata.department).toBeUndefined();
  });

  it('debe manejar sin linkedin ni twitter', () => {
    const result = transformHunterToLead(makeHunterEmail({ linkedin: undefined, twitter: undefined }), domain);
    expect(result.metadata.linkedin).toBeUndefined();
    expect(result.metadata.twitter).toBeUndefined();
  });

  it('debe manejar sources vacío', () => {
    const result = transformHunterToLead(makeHunterEmail({ sources: [] }), domain);
    expect(result.metadata.sources).toEqual([]);
  });

  it('debe usar el dominio como empresa siempre', () => {
    const result = transformHunterToLead(makeHunterEmail(), 'otra-empresa.com');
    expect(result.empresa).toBe('otra-empresa.com');
  });

  it('debe ser determinista', () => {
    const email = makeHunterEmail();
    const r1 = transformHunterToLead(email, domain);
    const r2 = transformHunterToLead(email, domain);
    expect(r1).toEqual(r2);
  });

  it('debe manejar email mínimo (solo value)', () => {
    const result = transformHunterToLead({
      value: 'min@test.com',
      type: 'generic',
      confidence: 50,
      sources: [],
    } as any, domain);
    expect(result.email).toBe('min@test.com');
    expect(result.nombre).toBe('');
    expect(result.source).toBe('hunter.io');
  });
});
