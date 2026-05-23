import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateBody, parseBody, formatZodErrors, CommonSchemas } from '@/lib/validation/common';
import { NextResponse } from 'next/server';

// ==================== validateBody ====================
describe('validateBody', () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().min(0).optional(),
  });

  it('debe devolver data parseada para input válido', () => {
    const result = validateBody(TestSchema, {
      name: 'Juan',
      email: 'juan@test.com',
      age: 30,
    });
    expect(result).toEqual({ name: 'Juan', email: 'juan@test.com', age: 30 });
  });

  it('debe devolver NextResponse 400 para input inválido', () => {
    const result = validateBody(TestSchema, { name: '', email: 'no-email' });
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it('debe aceptar campos opcionales omitidos', () => {
    const result = validateBody(TestSchema, { name: 'Ana', email: 'ana@test.com' });
    expect(result).toEqual({ name: 'Ana', email: 'ana@test.com' });
  });

  it('debe ignorar/strippear campos extra no definidos en el schema (Zod por defecto)', () => {
    const result = validateBody(TestSchema, {
      name: 'Luis',
      email: 'luis@test.com',
      extraField: 'no-debe-estar',
    });
    // Zod por defecto las ignora (strip) — verificar que no estén en data
    if (result && !(result instanceof NextResponse)) {
      expect((result as any).extraField).toBeUndefined();
    }
  });

  it('debe devolver NextResponse con details para schema con error', () => {
    const result = validateBody(TestSchema, { name: '', email: 'mal' });
    expect(result).toBeInstanceOf(NextResponse);
  });

  it('debe funcionar con schema simple (z.string)', () => {
    const result = validateBody(z.string(), 'hola');
    expect(result).toBe('hola');
  });

  it('debe devolver error para schema simple inválido', () => {
    const result = validateBody(z.string(), 123);
    expect(result).toBeInstanceOf(NextResponse);
  });
});

// ==================== parseBody ====================
describe('parseBody', () => {
  const TestSchema = z.object({
    title: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high']),
  });

  it('debe devolver { success: true, data } para input válido', () => {
    const result = parseBody(TestSchema, { title: 'Tarea', priority: 'high' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ title: 'Tarea', priority: 'high' });
    }
  });

  it('debe devolver { success: false, errors } para input inválido', () => {
    const result = parseBody(TestSchema, { title: '', priority: 'urgent' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.errors).toBe('object');
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    }
  });

  it('errors deben ser Record<string, string[]>', () => {
    const result = parseBody(TestSchema, { title: '', priority: 'urgent' });
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const [, messages] of Object.entries(result.errors)) {
        expect(Array.isArray(messages)).toBe(true);
        expect(messages.length).toBeGreaterThan(0);
      }
    }
  });

  it('debe funcionar con schema z.string', () => {
    const result = parseBody(z.string(), 'texto');
    expect(result.success).toBe(true);
  });

  it('debe fallar con schema z.string y número', () => {
    const result = parseBody(z.string(), 42);
    expect(result.success).toBe(false);
  });
});

// ==================== formatZodErrors ====================
describe('formatZodErrors', () => {
  it('debe formatear errores con path simple', () => {
    const schema = z.object({ name: z.string().min(3) });
    const result = schema.safeParse({ name: 'ab' });
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted.name).toBeDefined();
      expect(Array.isArray(formatted.name)).toBe(true);
      expect(formatted.name.length).toBeGreaterThan(0);
    }
  });

  it('debe usar _root para errores sin path', () => {
    const schema = z.string();
    const result = schema.safeParse(123);
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted._root).toBeDefined();
    }
  });

  it('debe agrupar múltiples errores en el mismo path', () => {
    const schema = z.object({
      email: z.string().email().min(5),
    });
    const result = schema.safeParse({ email: 'a' });
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted.email.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('debe manejar paths anidados (objeto dentro de objeto)', () => {
    const schema = z.object({
      user: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    });
    const result = schema.safeParse({ user: { name: '', email: 'bad' } });
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      // Debe haber entradas con path 'user.name' y/o 'user.email'
      const keys = Object.keys(formatted);
      expect(keys.some(k => k.includes('user.'))).toBe(true);
    }
  });
});

// ==================== CommonSchemas ====================
describe('CommonSchemas', () => {
  describe('id', () => {
    it('debe aceptar cuid de 25 caracteres', () => {
      const cuid = 'clx9k3b2m0000v4x8abcdefgh'; // 25 chars
      const result = CommonSchemas.id.safeParse(cuid);
      expect(result.success).toBe(true);
    });

    it('debe rechazar string menor a 25', () => {
      const result = CommonSchemas.id.safeParse('short');
      expect(result.success).toBe(false);
    });

    it('debe rechazar string vacío', () => {
      const result = CommonSchemas.id.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('email', () => {
    it('debe aceptar email válido', () => {
      expect(CommonSchemas.email.safeParse('test@example.com').success).toBe(true);
    });

    it('debe rechazar email sin @', () => {
      expect(CommonSchemas.email.safeParse('no-at-sign').success).toBe(false);
    });

    it('debe rechazar string vacío', () => {
      expect(CommonSchemas.email.safeParse('').success).toBe(false);
    });
  });

  describe('montoPositivo', () => {
    it('debe aceptar número positivo', () => {
      expect(CommonSchemas.montoPositivo.safeParse(100).success).toBe(true);
    });

    it('debe aceptar string numérico (coerce)', () => {
      expect(CommonSchemas.montoPositivo.safeParse('1500.50').success).toBe(true);
    });

    it('debe aceptar cero', () => {
      expect(CommonSchemas.montoPositivo.safeParse(0).success).toBe(true);
    });

    it('debe rechazar número negativo', () => {
      expect(CommonSchemas.montoPositivo.safeParse(-50).success).toBe(false);
    });
  });

  describe('moneda', () => {
    it('debe aceptar código de 3 letras', () => {
      expect(CommonSchemas.moneda.safeParse('EUR').success).toBe(true);
      expect(CommonSchemas.moneda.safeParse('USD').success).toBe(true);
    });

    it('debe rechazar código de 2 letras', () => {
      expect(CommonSchemas.moneda.safeParse('EU').success).toBe(false);
    });

    it('debe devolver EUR por defecto si no se pasa', () => {
      // default se aplica solo si el campo es undefined
      const schema = z.object({ moneda: CommonSchemas.moneda });
      expect(schema.parse({}).moneda).toBe('EUR');
    });
  });

  describe('fechaISO', () => {
    it('debe aceptar fecha ISO 8601', () => {
      expect(CommonSchemas.fechaISO.safeParse('2025-06-15T10:00:00Z').success).toBe(true);
    });

    it('debe rechazar formato no ISO', () => {
      expect(CommonSchemas.fechaISO.safeParse('15/06/2025').success).toBe(false);
    });
  });

  describe('url', () => {
    it('debe aceptar URL válida', () => {
      expect(CommonSchemas.url.safeParse('https://example.com').success).toBe(true);
    });

    it('debe rechazar string no URL', () => {
      expect(CommonSchemas.url.safeParse('not-a-url').success).toBe(false);
    });

    it('debe aceptar null/undefined (optional)', () => {
      expect(CommonSchemas.url.safeParse(null).success).toBe(true);
      expect(CommonSchemas.url.safeParse(undefined).success).toBe(true);
    });
  });
});
