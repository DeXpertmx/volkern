import { describe, it, expect, vi } from 'vitest';

// Evita instanciar Prisma al importar lib/skills (el helper no toca BD)
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { buildEmailBody, cleanEmailBody } from '@/lib/skills';

describe('buildEmailBody — composición del email desde Telegram', () => {
  it('incluye el mensaje, la firma y el link de calendario cuando hay booking', () => {
    const body = buildEmailBody({
      contenido: 'Gracias por la reunión de la semana pasada.',
      firmaNombre: 'Bruno Hess',
      bookingTitle: 'Asesoría contable',
      tenantNombre: 'Dimension Expert',
      bookingUrl: 'https://volkern.app/booking/bruno-hess',
    });

    expect(body).toContain('Gracias por la reunión');
    expect(body).toContain('Bruno Hess');
    expect(body).toContain('Asesoría contable');
    expect(body).toContain('Dimension Expert');
    expect(body).toContain('📅 Agenda una reunión conmigo: https://volkern.app/booking/bruno-hess');
  });

  it('omite el link de calendario si no hay booking activo', () => {
    const body = buildEmailBody({
      contenido: 'Hola',
      firmaNombre: 'Bruno Hess',
    });

    expect(body).toContain('Bruno Hess');
    expect(body).not.toContain('📅 Agenda una reunión');
    expect(body).not.toContain('/booking/');
  });

  it('no duplica el nombre de empresa si coincide con la firma', () => {
    const body = buildEmailBody({
      contenido: 'Hola',
      firmaNombre: 'Dimension Expert',
      tenantNombre: 'Dimension Expert',
    });

    const ocurrencias = body.split('Dimension Expert').length - 1;
    expect(ocurrencias).toBe(1);
  });
});

describe('cleanEmailBody — limpieza de placeholders inventados por el LLM', () => {
  it('elimina "[Link de Calendario]" y el separador previo', () => {
    const limpio = cleanEmailBody(
      'Te comparto el link a mi calendario para agendar: [Link de Calendario]',
    );
    expect(limpio).toBe('Te comparto el link a mi calendario para agendar');
  });

  it('elimina variantes en minúsculas y con/sin separador', () => {
    expect(cleanEmailBody('Nos vemos pronto [link de calendario]')).toBe('Nos vemos pronto');
    expect(cleanEmailBody('[Link] te espero')).toBe('te espero');
    expect(cleanEmailBody('Mi correo: [email]')).toBe('Mi correo');
  });

  it('no toca corchetes que no son placeholders (texto legítimo)', () => {
    const original = 'Factura [2026] y nota [A-123] pendientes';
    expect(cleanEmailBody(original)).toBe(original);
  });

  it('colapsa espacios y saltos de línea residuales', () => {
    const limpio = cleanEmailBody('Hola  a   todos\n\n\n\nun saludo');
    expect(limpio).toBe('Hola a todos\n\nun saludo');
  });

  it('devuelve cadena vacía para entrada vacía/null', () => {
    expect(cleanEmailBody('')).toBe('');
    expect(cleanEmailBody(null as unknown as string)).toBe('');
  });
});