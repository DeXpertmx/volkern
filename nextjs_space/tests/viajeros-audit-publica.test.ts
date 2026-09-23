/**
 * Guardia de auditoría del alta pública de viajeros.
 *
 * El guardado desde el enlace firmado es una escritura hecha por un actor
 * externo (el viajero) sobre datos sensibles: debe quedar auditado al mismo
 * nivel que las acciones internas del registro de viajeros.
 *
 * Detalle fino que esta guardia fija: AuditLog.userId es una FK real a User,
 * así que el actor sintético NO puede ir ahí (una violación haría fallar el
 * INSERT y se perdería la auditoría en silencio). Debe omitirse y documentarse
 * en metadata.actor — mismo patrón que usan los crons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prisma, actualizarViajero, registrarRespuestaEnlace, verificarTokenEnlace } = vi.hoisted(() => ({
  prisma: {
    hospitalityTraveler: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  actualizarViajero: vi.fn(),
  registrarRespuestaEnlace: vi.fn(),
  verificarTokenEnlace: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/hospitality/compliance-link', () => ({ verificarTokenEnlace }));
vi.mock('@/lib/hospitality/compliance-store', () => ({ actualizarViajero, registrarRespuestaEnlace }));

import { POST } from '@/app/api/public/viajeros/[token]/route';

const VIAJERO = {
  id: 'tr-lucia',
  tenantId: 't-demo',
  nombre: 'Lucía',
  apellido1: 'Mendoza',
  apellido2: null,
  tipoDocumento: null,
  numeroDocumento: null,
  soporteDocumento: null,
  fechaNacimiento: null,
  nacionalidad: null,
  // El parte de viajeros exige el domicilio: si el viajero ya lo guardó, el
  // formulario no lo pide de nuevo.
  direccion: null,
  municipio: null,
  codigoMunicipio: null,
  codigoPostal: null,
  paisDireccion: null,
  reservation: {
    tenantId: 't-demo',
    externalBookingId: 'DEMO-GRUPO-001',
    compliance: { estadoViajeros: 'pendiente' },
  },
};

function peticion() {
  return new NextRequest('https://volkern.app/api/public/viajeros/tok-123', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      'user-agent': 'Mozilla/5.0 (viajero)',
    },
    body: JSON.stringify({
      tipoDocumento: 'DNI',
      numeroDocumento: '87654321B',
      soporteDocumento: 'B',
      fechaNacimiento: '1985-04-12',
      // El domicilio es obligatorio desde el interface v3.0.0: el formulario
      // lo envía junto con el documento.
      direccion: 'Calle de la Palma 4',
      codigoPostal: '28004',
      paisDireccion: 'ESP',
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verificarTokenEnlace.mockReturnValue({ ok: true, viajeroId: 'tr-lucia' });
  prisma.hospitalityTraveler.findUnique.mockResolvedValue(VIAJERO);
  prisma.auditLog.create.mockResolvedValue({});
  actualizarViajero.mockResolvedValue({ id: 'tr-lucia', estado: 'pendiente_envio' });
  registrarRespuestaEnlace.mockResolvedValue(undefined);
});

describe('POST /api/public/viajeros/[token] — auditoría', () => {
  it('escribe una entrada de auditoría sin userId (FK-safe) y con el actor en metadata', async () => {
    const respuesta = await POST(peticion(), { params: { token: 'tok-123' } });
    expect(respuesta.status).toBe(200);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const llamada = prisma.auditLog.create.mock.calls[0][0];

    // La FK de userId no puede recibir un actor sintético.
    expect(llamada.data.userId).toBeUndefined();

    expect(llamada.data.tenantId).toBe('t-demo');
    expect(llamada.data.accion).toBe('editar'); // mismo verbo que la edición interna del viajero
    expect(llamada.data.entidad).toBe('hospitality_traveler');
    expect(llamada.data.entidadId).toBe('tr-lucia');
    expect(llamada.data.descripcion).toContain('DEMO-GRUPO-001');

    // Actor documentado en metadata + solo los campos que el viajero escribió.
    expect(llamada.data.metadata.actor).toBe('viajero-enlace-publico');
    expect(llamada.data.metadata.campos).toEqual(
      expect.arrayContaining(['tipoDocumento', 'numeroDocumento', 'soporteDocumento', 'fechaNacimiento'])
    );
    // El nombre venía prellenado y bloqueado: nunca lo tocó el viajero.
    expect(llamada.data.metadata.campos).not.toContain('nombre');
    expect(llamada.data.metadata.campos).not.toContain('apellido1');

    // Contexto de la petición externa.
    expect(llamada.data.ipAddress).toBe('203.0.113.9');
    expect(llamada.data.userAgent).toBe('Mozilla/5.0 (viajero)');
  });

  it('si la auditoría falla, el guardado sigue OK (la auditoría no bloquea al viajero)', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('FK violation simulada'));

    const respuesta = await POST(peticion(), { params: { token: 'tok-123' } });
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.estado).toBe('pendiente_envio');
  });

  it('no audita cuando el token no es válido (no hubo escritura)', async () => {
    verificarTokenEnlace.mockReturnValueOnce({ ok: false, motivo: 'firma_invalida' });

    const respuesta = await POST(peticion(), { params: { token: 'tok-123' } });
    expect(respuesta.status).toBe(403);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(actualizarViajero).not.toHaveBeenCalled();
  });
});
