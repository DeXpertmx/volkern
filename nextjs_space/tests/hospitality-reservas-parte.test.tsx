// @vitest-environment jsdom
//
// El aviso del parte de viajeros en la pantalla de reservas (RD 933/2021).
//
// Lo que se vigila es la decisión, no el color: la reserva a la que le faltan
// los datos del huésped avisa (y con lo que falta), la que ya está comunicada y
// la cancelada NO avisan, y desde el propio aviso se puede completar el parte
// sin salir de la pantalla.

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { toast } from 'sonner';
import { olvidarRolCacheado } from '@/hooks/use-capacidades-hospitality';

// Polyfill PointerEvent para Radix UI en jsdom (mismo apaño que el resto de
// tests de páginas con Select).
beforeAll(() => {
  if (!global.PointerEvent) {
    (global as any).PointerEvent = class PointerEvent extends Event {
      button = 0;
      pointerType = 'mouse';
      isPrimary = true;
      hasPointerCapture() {
        return false;
      }
      releasePointerCapture() {}
      constructor(type: string, init?: any) {
        super(type, init);
      }
    } as any;
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import HospitalityReservasPage from '@/app/dashboard/hospitality/reservas/page';

/** Una reserva de la lista, con lo que devuelve la API de reservas. */
function reserva(extra: Record<string, unknown>) {
  return {
    id: 'r1',
    propertyId: 'p1',
    unitId: 'u1',
    channel: 'Airbnb',
    externalBookingId: 'AB-1',
    estado: 'confirmed',
    checkIn: '2026-07-01T15:00:00.000Z',
    checkOut: '2026-07-05T11:00:00.000Z',
    amountAfterTax: 500,
    currency: 'EUR',
    specialRequests: null,
    occupancyAdults: 2,
    occupancyChildren: 0,
    unit: { id: 'u1', nombre: 'Apto 1', codigo: null },
    property: { id: 'p1', nombre: 'Casa del Mar' },
    contact: null,
    guestData: {},
    parteViajeros: null,
    ...extra,
  };
}

/** Reserva sin documentación: el parte no se puede emitir. */
const SIN_DATOS = reserva({
  id: 'r1',
  externalBookingId: 'AB-1',
  guestData: { firstName: 'Ana', lastName: 'Pérez' },
  parteViajeros: {
    aplica: true,
    completo: false,
    faltan: ['numeroDocumento', 'fechaNacimiento'],
    recomendados: [],
    estado: 'datos_incompletos',
    comunicada: false,
  },
});

/** Reserva ya comunicada: no hay nada que avisar. */
const COMUNICADA = reserva({
  id: 'r2',
  externalBookingId: 'BD-2',
  channel: 'Booking.com',
  guestData: { firstName: 'Bruno', lastName: 'Gómez' },
  parteViajeros: {
    aplica: true,
    completo: true,
    faltan: [],
    recomendados: [],
    estado: 'aceptada',
    comunicada: true,
  },
});

/** Cancelada sin datos: nunca entró al establecimiento, así que no hay parte. */
const CANCELADA = reserva({
  id: 'r3',
  externalBookingId: 'EX-3',
  channel: 'Expedia',
  estado: 'cancelled',
  guestData: { firstName: 'Carla', lastName: 'Ruiz' },
  parteViajeros: {
    aplica: false,
    completo: false,
    faltan: ['numeroDocumento'],
    recomendados: [],
    estado: null,
    comunicada: false,
  },
});

/**
 * Reserva con el parte RECHAZADO por el Ministerio por un dato del huésped.
 *
 * Los datos están completos (el formulario no tiene nada «que falta»): lo que
 * falla es el documento, y eso solo lo sabe la respuesta del servicio.
 */
const RECHAZADO_DATOS = reserva({
  id: 'r4',
  externalBookingId: 'AB-4',
  guestData: { firstName: 'Dora', lastName: 'López' },
  parteViajeros: {
    aplica: true,
    completo: true,
    faltan: [],
    recomendados: [],
    estado: 'rechazada',
    comunicada: false,
    rechazado: true,
    // El barrido todavía tiene intentos: sigue insistiendo por su cuenta.
    intentos: 1,
    abandonado: false,
    rechazo: {
      codigo: '10130',
      motivo: 'El campo persona[0].numeroDocumento no tiene un formato válido de NIF o NIE',
      campos: ['numeroDocumento'],
      ambito: 'datos',
    },
  },
});

/**
 * Rechazo que el barrido YA NO reintenta: agotó sus intentos.
 *
 * Sin nadie que lo pulse, este parte se queda sin comunicar; el aviso tiene que
 * decirlo en vez de dejar creer que el producto sigue insistiendo.
 */
const RECHAZADO_SIN_REINTENTO = reserva({
  id: 'r6',
  externalBookingId: 'AB-6',
  guestData: { firstName: 'Fina', lastName: 'Núñez' },
  parteViajeros: {
    aplica: true,
    completo: true,
    faltan: [],
    recomendados: [],
    estado: 'rechazada',
    comunicada: false,
    rechazado: true,
    intentos: 5,
    abandonado: true,
    rechazo: {
      codigo: '10103',
      motivo: 'El código de arrendador no existe en el sistema',
      campos: [],
      ambito: 'configuracion',
    },
  },
});

/**
 * Parte que NO llegó al Ministerio: el servicio no respondió.
 *
 * No es un rechazo (el Ministerio no ha visto el parte) ni «faltan datos» (los
tiene): la única salida es reintentar. Y como agotó sus intentos, el reintento
ya no lo hace el producto.
 */
const SIN_ENTREGAR = reserva({
  id: 'r7',
  externalBookingId: 'AB-7',
  guestData: { firstName: 'Gala', lastName: 'Ibáñez' },
  parteViajeros: {
    aplica: true,
    completo: true,
    faltan: [],
    recomendados: [],
    estado: 'error',
    comunicada: false,
    rechazado: false,
    rechazo: null,
    sinEntregar: true,
    fallo: {
      desenlace: 'sin_entregar',
      codigo: null,
      motivo: 'No se pudo entregar la comunicación: fetch failed',
      campos: [],
      ambito: 'envio',
    },
    intentos: 5,
    abandonado: true,
  },
});

/** Rechazo de configuración: completar datos no arregla nada. */
const RECHAZADO_CONFIG = reserva({
  id: 'r5',
  externalBookingId: 'BD-5',
  channel: 'Booking.com',
  guestData: { firstName: 'Elsa', lastName: 'Márquez' },
  parteViajeros: {
    aplica: true,
    completo: true,
    faltan: [],
    recomendados: [],
    estado: 'rechazada',
    comunicada: false,
    rechazado: true,
    intentos: 2,
    abandonado: false,
    rechazo: {
      codigo: '10103',
      motivo: 'El código de arrendador no existe en el sistema',
      campos: [],
      ambito: 'configuracion',
    },
  },
});

function montarFetch(reservas: unknown[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    // La pantalla decide qué acciones ofrece según el rol de la sesión
    // (`useCapacidadesHospitality`). Aquí el operador puede todo: esta prueba
    // vigila el aviso del parte, no los permisos (de eso se encargan las
    // guardias de permisos).
    if (String(url).includes('/api/users/me')) {
      return {
        ok: true,
        json: async () => ({ role: { id: 'rol-1', nombre: 'Admin', permisos: { all: true } } }),
      };
    }
    if (String(url).includes('/api/hospitality/reservations')) {
      return { ok: true, json: async () => ({ reservations: reservas }) };
    }
    if (String(url).includes('/api/hospitality/properties')) {
      return { ok: true, json: async () => ({ properties: [] }) };
    }
    if (String(url).includes('/api/hospitality/units')) {
      return { ok: true, json: async () => ({ units: [] }) };
    }
    if (String(url).includes('/api/hospitality/registro-viajeros')) {
      return { ok: true, json: async () => ({ ok: true, url: 'https://volkern.app/checkin/tok-ana' }) };
    }
    throw new Error(`petición no esperada: ${url}`);
  });
}

describe('Pantalla de reservas: aviso del parte de viajeros', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // El rol se cachea en el módulo del hook: cada prueba parte sin rol.
    olvidarRolCacheado();
    global.fetch = montarFetch([SIN_DATOS, COMUNICADA, CANCELADA]) as unknown as typeof fetch;
  });

  it('avisa de cuántas reservas están sin los datos del huésped', async () => {
    render(<HospitalityReservasPage />);

    expect(
      await screen.findByText(/1 reserva\(s\) sin los datos del huésped para el parte de viajeros/)
    ).toBeTruthy();
    // La obligación legal y quién puede completarlos, no solo un número.
    expect(screen.getByText(/RD 933\/2021/)).toBeTruthy();
  });

  it('dice al operador QUÉ falta y solo en la fila que lo necesita', async () => {
    render(<HospitalityReservasPage />);
    await screen.findByText('Ana Pérez');

    const avisos = screen.getAllByText(/Falta para el parte:/);
    expect(avisos).toHaveLength(1);
    // Los campos, en el idioma del formulario del huésped.
    expect(avisos[0].textContent).toContain('Número de documento');
    expect(avisos[0].textContent).toContain('Fecha de nacimiento');
  });

  it('no avisa en la reserva ya comunicada ni en la cancelada', async () => {
    render(<HospitalityReservasPage />);
    await screen.findByText('Bruno Gómez');
    await screen.findByText('Carla Ruiz');

    // El aviso de cabecera cuenta una sola reserva de las tres.
    expect(screen.getAllByText(/sin los datos del huésped para el parte de viajeros/)).toHaveLength(1);
    expect(screen.getAllByText(/Falta para el parte:/)).toHaveLength(1);
  });

  it('abre el formulario del parte desde la propia fila', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityReservasPage />);
    await screen.findByText('Ana Pérez');

    await usuario.click(
      screen.getByTitle('Completar los datos del huésped para el parte de viajeros')
    );

    expect(await screen.findByText('Datos del viajero')).toBeTruthy();
    expect(screen.getByText(/Reserva AB-1/)).toBeTruthy();
    // Los campos que el Ministerio exige están en el formulario.
    expect(screen.getByText('Número de documento')).toBeTruthy();
    expect(screen.getByText('Número de soporte')).toBeTruthy();
    expect(screen.getByText('Fecha de nacimiento (AAAA-MM-DD)')).toBeTruthy();
  });

  it('avisa del parte RECHAZADO con el motivo del Ministerio y qué corregir', async () => {
    global.fetch = montarFetch([RECHAZADO_DATOS]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);

    expect(
      await screen.findByText(/1 parte\(s\) rechazado\(s\) por el Ministerio/)
    ).toBeTruthy();
    // El motivo es el del servicio, sin reescribirlo: en el aviso y en la fila.
    expect(screen.getAllByText(/no tiene un formato válido de NIF o NIE/)).toHaveLength(2);
    // Y qué corregir, con el nombre del campo tal como lo llama el formulario.
    expect(screen.getByText(/Corrige estos datos y vuelve a guardar: Número de documento/)).toBeTruthy();
    // En la fila, para que se vea cuál es sin leer el aviso entero.
    expect(screen.getByText(/Parte rechazado: /)).toBeTruthy();
  });

  it('el rechazo no se cuenta como «faltan datos» del huésped', async () => {
    global.fetch = montarFetch([RECHAZADO_DATOS]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);
    await screen.findByText(/rechazado\(s\) por el Ministerio/);

    // Los datos están completos: el aviso ámbar no tiene nada que decir.
    expect(screen.queryByText(/sin los datos del huésped para el parte de viajeros/)).toBeNull();
    expect(screen.queryByText(/Falta para el parte:/)).toBeNull();
  });

  it('desde el rechazo de un dato se abre el formulario para corregirlo', async () => {
    const usuario = userEvent.setup();
    global.fetch = montarFetch([RECHAZADO_DATOS]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);
    await screen.findByText(/rechazado\(s\) por el Ministerio/);

    // Nombre exacto: el botón de la fila lleva el mismo texto y algo más.
    await usuario.click(screen.getByRole('button', { name: 'Corregir los datos' }));

    // El mismo formulario del parte: es donde se corrige el documento.
    expect(await screen.findByText('Datos del viajero')).toBeTruthy();
    expect(screen.getByText(/Reserva AB-4/)).toBeTruthy();
  });

  it('un rechazo de configuración NO manda al hotel a rellenar datos del huésped', async () => {
    global.fetch = montarFetch([RECHAZADO_CONFIG]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);

    await screen.findByText(/1 parte\(s\) rechazado\(s\) por el Ministerio/);
    expect(screen.getAllByText(/El código de arrendador no existe en el sistema/).length).toBeGreaterThan(0);
    expect(screen.getByText(/No es un problema del huésped/)).toBeTruthy();
    // Las acciones son las que sirven: reintentar el envío y mirar la configuración.
    expect(screen.getByRole('button', { name: 'Reintentar el envío' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Registro de viajeros/ }).getAttribute('href')).toBe(
      '/dashboard/hospitality/registro-viajeros'
    );
    expect(screen.queryByRole('button', { name: 'Corregir los datos' })).toBeNull();
    // En la fila, la acción es el reintento (y no el formulario del huésped).
    expect(screen.getByTitle('Reintentar el envío del parte rechazado')).toBeTruthy();
    expect(
      screen.queryByTitle('Corregir los datos del huésped y reenviar el parte rechazado')
    ).toBeNull();
  });

  it('avisa de que el barrido ya no reintenta el parte (intentos agotados)', async () => {
    global.fetch = montarFetch([RECHAZADO_SIN_REINTENTO]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);

    await screen.findByText(/1 parte\(s\) rechazado\(s\) por el Ministerio/);
    // El aviso de cabecera lo cuenta y la reserva lo dice con sus intentos.
    expect(screen.getByText(/1 de ellos agotaron sus 5 intentos/)).toBeTruthy();
    expect(screen.getByText(/5 intentos agotados: el barrido ya no lo reintenta solo/)).toBeTruthy();
    expect(screen.getByText(/sin reintentos automáticos/)).toBeTruthy();
    // Y la acción cambia de nombre: ya no es «reintentar» lo que hace el producto
    // por su cuenta, es el hotel el que reenvía.
    expect(screen.getByRole('button', { name: 'Reenviar el parte' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar el envío' })).toBeNull();
  });

  it('avisa del parte que NO llegó al Ministerio, con su motivo y sin culpar a los datos', async () => {
    global.fetch = montarFetch([SIN_ENTREGAR]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);

    expect(await screen.findByText(/1 parte\(s\) sin entregar al Ministerio/)).toBeTruthy();
    // El motivo es el del cliente (el error de entrega), tal cual.
    expect(screen.getAllByText(/No se pudo entregar la comunicación: fetch failed/)).toHaveLength(2);
    expect(screen.getByText(/No es un problema de los datos del huésped/)).toBeTruthy();
    // Agotados los intentos, el reintento es del hotel: el botón lo dice.
    expect(screen.getByText(/5 intentos agotados: el barrido ya no lo reintenta solo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reenviar el parte' })).toBeTruthy();
    // Y NO se ofrece el formulario del huésped: el dato no tiene nada que ver.
    expect(screen.queryByRole('button', { name: 'Corregir los datos' })).toBeNull();
    // En la fila, para no tener que leer el aviso entero.
    expect(screen.getByText(/Parte sin entregar: /)).toBeTruthy();
    expect(screen.getByText(/sin reintentos automáticos/)).toBeTruthy();
  });

  it('una no-entrega no se cuenta como rechazo del Ministerio', async () => {
    global.fetch = montarFetch([SIN_ENTREGAR]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);
    await screen.findByText(/sin entregar al Ministerio/);

    expect(screen.queryByText(/rechazado\(s\) por el Ministerio/)).toBeNull();
    expect(screen.queryByText(/Parte rechazado: /)).toBeNull();
    expect(screen.queryByText(/sin los datos del huésped para el parte de viajeros/)).toBeNull();
  });

  it('un rechazo con intentos de sobra no anuncia ningún abandono', async () => {
    global.fetch = montarFetch([RECHAZADO_CONFIG]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);
    await screen.findByText(/rechazado\(s\) por el Ministerio/);

    expect(screen.queryByText(/agotaron sus/)).toBeNull();
    expect(screen.queryByText(/sin reintentos automáticos/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar el envío' })).toBeTruthy();
  });

  it('el reintento del envío llama a la acción que reenvía el parte', async () => {
    const usuario = userEvent.setup();
    global.fetch = montarFetch([RECHAZADO_CONFIG]) as unknown as typeof fetch;
    render(<HospitalityReservasPage />);
    await screen.findByText(/rechazado\(s\) por el Ministerio/);

    await usuario.click(screen.getByRole('button', { name: 'Reintentar el envío' }));

    await waitFor(() => {
      // El GET de montaje (preguntas del check-in) no lleva init: solo vale el
      // POST del reenvío.
      const reenvio = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
        String(c[0]).includes('/api/hospitality/registro-viajeros') && c[1] !== undefined
      );
      expect(reenvio).toBeTruthy();
      expect(JSON.parse(reenvio![1].body)).toEqual({ accion: 'enviar', reservaId: 'r5' });
    });
  });

  // El portapapeles no se comprueba aquí: en jsdom `navigator.clipboard` es de
  // otro objeto que el que ve la página, así que la aserción mentiría. Lo que
  // se vigila es lo que el producto decide: pedir el enlace real del huésped
  // (la API lo genera si no existía) y confirmarlo al operador.
  it('pide el enlace de check-in del huésped para que lo rellene él', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityReservasPage />);
    await screen.findByText('Ana Pérez');

    await usuario.click(await screen.findByTitle('Copiar el enlace de check-in del huésped'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Enlace de check-in copiado')));
    // El GET de montaje (preguntas del check-in) no lleva init: solo vale el
    // POST que pide el enlace.
    const enlace = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/hospitality/registro-viajeros') && c[1] !== undefined
    );
    expect(enlace).toBeTruthy();
    expect(enlace![1].method).toBe('POST');
    expect(JSON.parse(enlace![1].body)).toEqual({ accion: 'enlace', reservaId: 'r1' });
  });
});
