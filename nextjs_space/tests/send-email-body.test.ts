import { describe, it, expect, vi } from 'vitest';

// Evita instanciar Prisma al importar lib/skills (el helper no toca BD)
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { buildEmailBody } from '@/lib/skills';

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