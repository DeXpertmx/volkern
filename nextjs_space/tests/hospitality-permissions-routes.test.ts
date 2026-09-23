import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Permisos por acción, de punta a punta.
 *
 * No basta con que la capacidad exista y se resuelva bien (eso está en
 * hospitality-permissions.test.ts) ni con que cada ruta la exija (guardia): aquí
 * se llama al endpoint real y se comprueba que devuelve 403 con la causa exacta
 * antes de tocar la base de datos.
 */

const hoisted = vi.hoisted(() => ({
  auth: null as unknown,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: { findMany: vi.fn().mockResolvedValue([]) },
    hospitalityUnit: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn(async () => hoisted.auth),
}));

import { GET as reservasGET } from '@/app/api/hospitality/reservations/route';
import { GET as finanzasGET } from '@/app/api/hospitality/finanzas/route';
import { GET as reportesGET } from '@/app/api/hospitality/reportes/route';
import { POST as tareasPOST } from '@/app/api/hospitality/tasks/route';

/** Sesión con un rol concreto, como la construye `authenticateRequest`. */
function sesionCon(permisos: Record<string, unknown>) {
  return {
    valid: true,
    tenant: { id: 'tenant_a', moneda: 'EUR' },
    user: {
      id: 'user_a',
      email: 'user@volkern.app',
      roleId: 'role_x',
      role: { id: 'role_x', nombre: 'Personalizado', permisos },
    },
  };
}

const ROL_LIMPIEZA = {
  hospitality_operaciones: { ver: true, gestionar: true },
  hospitality_mantenimiento: { ver: true, gestionar: true },
};

const ROL_SOLO_LECTURA_FINANCIERA = { hospitality_finanzas: { ver: true } };

const pedir = (url: string, init?: RequestInit) =>
  new Request(`https://volkern.app${url}`, init) as unknown as import('next/server').NextRequest;

beforeEach(() => {
  hoisted.auth = null;
});

describe('un rol de limpieza no entra donde no le toca', () => {
  beforeEach(() => {
    hoisted.auth = sesionCon(ROL_LIMPIEZA);
  });

  it('no puede listar reservas', async () => {
    const respuesta = await reservasGET(pedir('/api/hospitality/reservations'));
    expect(respuesta.status).toBe(403);

    const cuerpo = await respuesta.json();
    expect(cuerpo.permisoRequerido).toBe('hospitality_reservas.ver');
  });

  it('no puede ver finanzas', async () => {
    const respuesta = await finanzasGET(pedir('/api/hospitality/finanzas'));
    expect(respuesta.status).toBe(403);
    expect((await respuesta.json()).permisoRequerido).toBe('hospitality_finanzas.ver');
  });

  it('sí puede abrir una limpieza (su trabajo)', async () => {
    const respuesta = await tareasPOST(
      pedir('/api/hospitality/tasks', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'cleaning', unitId: 'u1' }),
      })
    );
    // La unidad no existe en el mock, pero lo importante es que el permiso no
    // bloqueó la petición.
    expect(respuesta.status).toBe(404);
  });

  it('puede abrir una incidencia porque también tiene mantenimiento', async () => {
    const respuesta = await tareasPOST(
      pedir('/api/hospitality/tasks', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'maintenance', unitId: 'u1', incidencia: 'Aire roto' }),
      })
    );
    expect(respuesta.status).toBe(404);
  });
});

describe('un rol de limpieza sin mantenimiento no puede abrir incidencias', () => {
  beforeEach(() => {
    hoisted.auth = sesionCon({ hospitality_operaciones: { ver: true, gestionar: true } });
  });

  it('el tipo de tarea es lo que decide el permiso', async () => {
    const limpieza = await tareasPOST(
      pedir('/api/hospitality/tasks', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'cleaning', unitId: 'u1' }),
      })
    );
    expect(limpieza.status).toBe(404);

    const incidencia = await tareasPOST(
      pedir('/api/hospitality/tasks', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'maintenance', unitId: 'u1', incidencia: 'Aire roto' }),
      })
    );
    expect(incidencia.status).toBe(403);
    expect((await incidencia.json()).permisoRequerido).toBe('hospitality_mantenimiento.gestionar');
  });
});

describe('exportar no es lo mismo que ver', () => {
  it('ver los reportes no autoriza a descargarlos', async () => {
    hoisted.auth = sesionCon(ROL_SOLO_LECTURA_FINANCIERA);

    const respuesta = await reportesGET(pedir('/api/hospitality/reportes?formato=csv'));
    expect(respuesta.status).toBe(403);
    expect((await respuesta.json()).permisoRequerido).toBe('hospitality_finanzas.exportar');
  });
});

describe('sin sesión válida no se pasa de la puerta', () => {
  it('devuelve 401, no 403, cuando no hay credencial', async () => {
    hoisted.auth = { valid: false, error: 'API key no proporcionada' };
    const respuesta = await reservasGET(pedir('/api/hospitality/reservations'));
    expect(respuesta.status).toBe(401);
  });
});
