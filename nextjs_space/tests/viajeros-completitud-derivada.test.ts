/**
 * Guardia de la completitud del viajero: una sola verdad.
 *
 * El fallo que la origina es real y se vio en producción: la completitud de un
 * viajero vivía en dos sitios a la vez —la columna `estado` y el cálculo sobre sus
 * datos— y mientras la lista de campos obligatorios no cambió, ambas dijeron lo
 * mismo. Al pasar el domicilio a obligatorio (el parte de viajeros, interface
 * v3.0.0 no lo construye sin él) los viajeros que ya estaban «completos»
 * conservaron su `pendiente_envio` guardado, y el registro empezó a contar dos
 * verdades: la bandeja decía «3 viajeros · 0 registrados · 3 pendientes» y el botón
 * de pedir datos por WhatsApp respondía «No hay viajeros incompletos a quienes
 * pedirles datos».
 *
 * Lo que se fija aquí, en una frase: **a quién le falta algo se decide con sus
 * datos**, no con una foto guardada el día que se escribió.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  camposFaltantes,
  estadoDeViajero,
  resumenDeReserva,
  estadoViajerosVigente,
  viajerosAQuienesPedirDatos,
} from '../lib/hospitality/compliance';

const { prisma } = vi.hoisted(() => ({
  prisma: { hospitalityReservation: { findFirst: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/core/crypto', () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: vi.fn() }));

import { detalleRegistro } from '../lib/hospitality/compliance-store';

/** Viajero con todo lo obligatorio salvo el domicilio, que es justo el que engaña. */
const SIN_DOMICILIO = {
  id: 'tr-carlos',
  nombre: 'Carlos',
  apellido1: 'Mendoza',
  apellido2: null,
  tipoDocumento: 'Pasaporte',
  numeroDocumento: 'X1234567',
  soporteDocumento: null,
  fechaNacimiento: new Date('1988-02-03'),
  nacionalidad: 'ES',
  direccion: null,
  municipio: null,
  codigoMunicipio: null,
  codigoPostal: null,
  paisDireccion: null,
  // La columna guardada, que se quedó atrás cuando el domicilio pasó a obligatorio.
  estado: 'pendiente_envio',
};

const COMPLETO = {
  ...SIN_DOMICILIO,
  id: 'tr-maria',
  nombre: 'María',
  direccion: 'Calle Mayor 4',
  codigoPostal: '28013',
  municipio: 'Madrid',
  estado: 'pendiente_envio',
};

describe('la completitud del viajero se deriva de los datos', () => {
  it('un viajero sin domicilio está incompleto, diga lo que diga la columna', () => {
    expect(camposFaltantes(SIN_DOMICILIO)).toEqual(['direccion', 'codigoPostal']);
    expect(estadoDeViajero(SIN_DOMICILIO)).toBe('datos_pendientes');
    expect(SIN_DOMICILIO.estado).toBe('pendiente_envio');
  });

  it('un viajero con el domicilio completo está listo para comunicar', () => {
    expect(camposFaltantes(COMPLETO)).toEqual([]);
    expect(estadoDeViajero(COMPLETO)).toBe('pendiente_envio');
  });

  it('a quién se le pide por WhatsApp sale de los datos, no de la columna', () => {
    const objetivo = viajerosAQuienesPedirDatos([SIN_DOMICILIO, COMPLETO]);

    expect(objetivo.map((v) => v.id)).toEqual(['tr-carlos']);
  });

  it('un viajero incompleto que además arrastra una columna vieja no se pierde', () => {
    // El caso exacto del fallo: la columna dice «listo» y los datos dicen que no.
    const conColumnaObsoleta = { ...SIN_DOMICILIO, estado: 'enviado' };

    expect(viajerosAQuienesPedirDatos([conColumnaObsoleta])).toHaveLength(1);
  });
});

describe('el resumen de la reserva no se contradice a sí mismo', () => {
  it('una foto guardada de completitud cede ante los datos', () => {
    // El caso del fallo: la etiqueta contaba 3 pendientes y la insignia, leyendo la
    // foto guardada, decía «Pendiente de envío» en la misma fila.
    const resumen = resumenDeReserva([SIN_DOMICILIO, SIN_DOMICILIO, SIN_DOMICILIO], {
      estadoReserva: 'pendiente_envio',
      estadoViajeros: 'pendiente_envio',
    });

    expect(resumen.pendientes).toBe(3);
    expect(resumen.estado).toBe('datos_pendientes');
    expect(resumen.listoParaEnviar).toBe(false);
  });

  it('lo que el Ministerio ya aceptó sigue mandando sobre los datos', () => {
    const resumen = resumenDeReserva([{ ...COMPLETO, direccion: null, codigoPostal: null }], {
      estadoReserva: 'completo',
      estadoViajeros: 'completo',
    });

    expect(resumen.estado).toBe('completo');
    expect(resumen.listoParaEnviar).toBe(false);
  });

  it('un rechazo del Ministerio no se tapa con un estado derivado', () => {
    expect(estadoViajerosVigente('error', 'datos_pendientes')).toBe('error');
    expect(estadoViajerosVigente('enviado', 'datos_pendientes')).toBe('enviado');
  });

  it('los datos completos devuelven el registro a listo para enviar', () => {
    expect(estadoViajerosVigente('datos_pendientes', 'pendiente_envio')).toBe('pendiente_envio');
    expect(estadoViajerosVigente(null, 'pendiente_envio')).toBe('pendiente_envio');
  });
});

describe('la ficha del viajero dice lo mismo que la bandeja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detalleRegistro deriva el estado de cada viajero de sus datos', async () => {
    prisma.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'res-demo',
      tenantId: 't-demo',
      externalBookingId: 'DEMO-GRUPO-001',
      estado: 'confirmed',
      channel: 'DIRECT',
      checkIn: new Date('2026-09-14T15:00:00Z'),
      checkOut: new Date('2026-09-19T15:00:00Z'),
      travelers: [SIN_DOMICILIO, COMPLETO],
      compliance: null,
      property: { id: 'p-1', nombre: 'Loft Marina' },
      unit: { id: 'u-1', nombre: 'Loft 1' },
      contact: { id: 'c-1', nombre: 'Carlos Mendoza', email: null, telefono: '+34600000001' },
    });

    const detalle = await detalleRegistro('t-demo', 'res-demo');

    // La ficha no puede decir «Listo» de quien aún no tiene domicilio: si lo dijera,
    // escondería el botón de pedirle los datos y el registro no se podría cerrar.
    const porId = Object.fromEntries(detalle!.reserva.travelers.map((v) => [v.id, v.estado]));
    expect(porId['tr-carlos']).toBe('datos_pendientes');
    expect(porId['tr-maria']).toBe('pendiente_envio');

    // Y el resumen de la reserva coincide con la ficha y con la bandeja.
    expect(detalle!.resumen.estado).toBe('datos_pendientes');
    expect(detalle!.resumen.pendientes).toBe(1);
    expect(detalle!.resumen.registrados).toBe(1);
  });
});
