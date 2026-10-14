// @vitest-environment jsdom
//
// Bloquear fechas y volver a abrirlas desde el Planning, ejercido sobre la
// pantalla real (no sobre su código fuente).
//
// Lo que se vigila es la decisión completa del operador:
//  1. cerrar un rango de una unidad (el POST del diálogo «Bloquear unidad»),
//  2. LIBERAR unas fechas sin borrar el bloqueo (PATCH `cancelado`), y
//  3. REACTIVAR un bloqueo liberado (PATCH `activo`), también cuando el bloqueo
//     no cae en la semana que se está mirando —que es el caso en el que la
//     rejilla no lo dibuja y el listado es la única puerta—.
//
// El mecanismo puro (qué acción toca y a qué estado lleva) tiene su guardia en
// `hospitality-block-ui-guard.test.ts`; aquí se comprueba el pegamento: que los
// botones existan, que disparen la petición correcta y que el aviso lo diga.

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { olvidarRolCacheado } from '@/hooks/use-capacidades-hospitality';
import { currentWeekRange, toIsoDate } from '@/lib/hospitality/calendar';

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

import HospitalityCalendar from '@/app/dashboard/hospitality/calendar/page';

const DIA = 24 * 60 * 60 * 1000;

/** Un día del calendario, a `offset` días del lunes de la semana visible. */
function diaDeLaSemana(offset: number): string {
  return toIsoDate(new Date(currentWeekRange().start.getTime() + offset * DIA));
}

/**
 * Los tres casos que el operador tiene delante: un bloqueo que cierra fechas
 * esta semana, uno ya liberado, y uno que cierra fechas el mes que viene (fuera
 * de la rejilla, solo alcanzable desde el listado).
 */
const BLOQUEO_ACTIVO = {
  id: 'block-activo',
  unitId: 'u1',
  fechaInicio: diaDeLaSemana(1),
  fechaFin: diaDeLaSemana(3),
  tipo: 'propietario',
  motivo: 'Uso del propietario',
  estado: 'activo',
  unit: { id: 'u1', nombre: 'Apto 1', codigo: 'A1', propertyId: 'p1' },
};

const BLOQUEO_LIBERADO = {
  id: 'block-liberado',
  unitId: 'u2',
  fechaInicio: diaDeLaSemana(2),
  fechaFin: diaDeLaSemana(4),
  tipo: 'mantenimiento',
  motivo: 'Avería del aire',
  estado: 'cancelado',
  unit: { id: 'u2', nombre: 'Apto 2', codigo: 'A2', propertyId: 'p1' },
};

const BLOQUEO_FUERA_DE_LA_SEMANA = {
  id: 'block-fuera',
  unitId: 'u1',
  fechaInicio: diaDeLaSemana(60),
  fechaFin: diaDeLaSemana(63),
  tipo: 'administrativo',
  motivo: 'Cierre de temporada',
  estado: 'activo',
  unit: { id: 'u1', nombre: 'Apto 1', codigo: 'A1', propertyId: 'p1' },
};

function montarFetch(
  bloqueos: unknown[],
  opciones: { reservas?: unknown[]; conflictoPost?: unknown[] } = {}
) {
  const { reservas = [], conflictoPost } = opciones;
  return vi.fn(async (url: string, init?: RequestInit) => {
    const href = String(url);
    if (href.includes('/api/users/me')) {
      // El operador puede todo: esta prueba vigila el flujo de bloqueos, no los
      // permisos (de eso se encargan las guardias de permisos).
      return {
        ok: true,
        json: async () => ({ role: { id: 'rol-1', nombre: 'Admin', permisos: { all: true } } }),
      };
    }
    if (href.includes('/api/hospitality/properties')) {
      return { ok: true, json: async () => ({ properties: [{ id: 'p1', nombre: 'Villa Sol', fotos: [] }] }) };
    }
    if (href.includes('/api/hospitality/units')) {
      return {
        ok: true,
        json: async () => ({
          units: [
            { id: 'u1', nombre: 'Apto 1', codigo: 'A1', propertyId: 'p1', capacidad: 2, tarifaBase: 100, moneda: 'EUR' },
            { id: 'u2', nombre: 'Apto 2', codigo: 'A2', propertyId: 'p1', capacidad: 4, tarifaBase: 150, moneda: 'EUR' },
          ],
        }),
      };
    }
    if (href.includes('/api/hospitality/rateplans')) {
      return { ok: true, json: async () => ({ ratePlans: [] }) };
    }
    if (href.includes('/api/hospitality/reservations')) {
      return { ok: true, json: async () => ({ reservations: reservas }) };
    }
    if (href.includes('/api/hospitality/blocks')) {
      if (init?.method === 'POST') {
        // El servidor rechaza el cierre cuando pisa noches vendidas: devuelve el
        // texto y las reservas que están en medio.
        if (conflictoPost) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: 'No se puede cerrar ese rango: ya hay una reserva en esas fechas.',
              conflicto: conflictoPost,
            }),
          };
        }
        return { ok: true, json: async () => ({ block: { ...BLOQUEO_ACTIVO, id: 'block-nuevo' } }) };
      }
      if (init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ block: { ...BLOQUEO_ACTIVO, estado: 'cancelado' } }) };
      }
      if (init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({ blocks: bloqueos }) };
    }
    throw new Error(`petición no esperada: ${href}`);
  });
}

/** Las llamadas que escriben: las únicas con `init`. */
function mutaciones() {
  return (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => c[1] !== undefined
  );
}

describe('Planning — bloquear fechas, liberarlas y reactivarlas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    olvidarRolCacheado();
    global.fetch = montarFetch([
      BLOQUEO_ACTIVO,
      BLOQUEO_LIBERADO,
      BLOQUEO_FUERA_DE_LA_SEMANA,
    ]) as unknown as typeof fetch;
  });

  it('el listado reúne lo que cierra fechas y lo liberado, aunque no esté en la semana', async () => {
    render(<HospitalityCalendar />);

    // Dos activos (el de esta semana y el del mes que viene) y uno liberado.
    expect(await screen.findByText('Bloqueos de fechas (2 activos)')).toBeTruthy();

    // El liberado no se esconde: la rejilla lo dibuja en trazo discontinuo y su
    // fila dice «liberado».
    expect(screen.getAllByText(/liberado/).length).toBeGreaterThan(0);

    // Los tres bloqueos ofrecen la acción que les toca: liberar los dos que
    // cierran fechas —incluido el que NO está en la semana visible— y reactivar
    // el que ya se liberó.
    expect(await screen.findAllByRole('button', { name: 'Liberar fechas' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reactivar bloqueo' })).toHaveLength(1);
  });

  it('liberar manda el PATCH al bloqueo correcto y lo confirma al operador', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    // El listado va por fecha, los que cierran fechas primero: el segundo botón
    // es el del mes que viene, que la rejilla no dibuja.
    const botones = await screen.findAllByRole('button', { name: 'Liberar fechas' });
    await usuario.click(botones[1]);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Fechas liberadas'))
    );
    const patch = mutaciones().find((c) => String(c[0]).includes('/api/hospitality/blocks/'));
    expect(patch).toBeTruthy();
    expect(String(patch![0])).toContain('block-fuera');
    expect(patch![1].method).toBe('PATCH');
    expect(JSON.parse(patch![1].body)).toEqual({ estado: 'cancelado' });
  });

  it('reactivar un bloqueo liberado lo vuelve a cerrar (PATCH activo)', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click(await screen.findByRole('button', { name: 'Reactivar bloqueo' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Fechas bloqueadas otra vez'))
    );
    const patch = mutaciones().find((c) => String(c[0]).includes('/api/hospitality/blocks/'));
    expect(String(patch![0])).toContain('block-liberado');
    expect(JSON.parse(patch![1].body)).toEqual({ estado: 'activo' });
  });

  it('la barra de la rejilla abre el detalle y desde ahí se libera', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click(screen.getByTitle('Bloqueo: Propietario · pulsa para liberar o eliminar'));

    const detalle = await screen.findByRole('dialog');
    expect(within(detalle).getByText('Fechas bloqueadas')).toBeTruthy();
    expect(within(detalle).getByText('Apto 1')).toBeTruthy();
    expect(within(detalle).getByText('Uso del propietario')).toBeTruthy();
    // Las dos salidas: reabrir las fechas o borrar la fila.
    expect(within(detalle).getByRole('button', { name: 'Liberar fechas' })).toBeTruthy();
    expect(within(detalle).getByRole('button', { name: 'Eliminar' })).toBeTruthy();

    await usuario.click(within(detalle).getByRole('button', { name: 'Liberar fechas' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Fechas liberadas'))
    );
    const patch = mutaciones().find((c) => String(c[0]).includes('/api/hospitality/blocks/'));
    expect(String(patch![0])).toContain('block-activo');
    expect(JSON.parse(patch![1].body)).toEqual({ estado: 'cancelado' });
  });

  it('la barra del bloqueo liberado se dibuja «liberada» y su detalle ofrece reactivar', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click(screen.getByTitle('Bloqueo liberado: Mantenimiento · pulsa para reactivar'));

    const detalle = await screen.findByRole('dialog');
    expect(within(detalle).getByText('Bloqueo liberado')).toBeTruthy();
    // Y dice el estado real de esas noches, que es lo que decide el operador.
    expect(within(detalle).getByText(/otra vez a la venta/)).toBeTruthy();
    expect(within(detalle).getByRole('button', { name: 'Reactivar bloqueo' })).toBeTruthy();
  });

  it('eliminar sigue siendo borrar la fila, y avisa de que no se podrá reactivar', async () => {
    const usuario = userEvent.setup();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click(screen.getByTitle('Bloqueo: Propietario · pulsa para liberar o eliminar'));
    const detalle = await screen.findByRole('dialog');
    await usuario.click(within(detalle).getByRole('button', { name: 'Eliminar' }));

    expect(String(confirmar.mock.calls[0][0])).toContain('no se podrá reactivar');
    await waitFor(() =>
      expect(
        mutaciones().some(
          (c) => String(c[0]).includes('/api/hospitality/blocks/block-activo') && c[1].method === 'DELETE'
        )
      ).toBe(true)
    );
    confirmar.mockRestore();
  });

  it('cerrar un rango sigue estando en la fila de la unidad (POST del diálogo)', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click((await screen.findAllByTitle('Bloquear fechas de esta unidad'))[0]);
    expect(await screen.findByText('Bloquear unidad')).toBeTruthy();

    await usuario.type(
      screen.getByLabelText('Motivo (queda registrado)'),
      'Visita de un familiar'
    );
    await usuario.click(await screen.findByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Bloqueo creado'))
    );
    const post = mutaciones().find((c) => c[1].method === 'POST');
    expect(post).toBeTruthy();
    const cuerpo = JSON.parse(post![1].body);
    expect(cuerpo.unitId).toBe('u1');
    expect(cuerpo.tipo).toBe('propietario');
    // El intervalo [inicio, fin) viaja tal cual: es lo que cierra las noches.
    expect(cuerpo.fechaInicio).toBeTruthy();
    expect(cuerpo.fechaFin).toBeTruthy();
    // Y la razón, escrita: es lo que quedará documentado con el cierre.
    expect(cuerpo.motivo).toBe('Visita de un familiar');
  });

  it('no se cierra un rango sin escribir la razón', async () => {
    const usuario = userEvent.setup();
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click((await screen.findAllByTitle('Bloquear fechas de esta unidad'))[0]);
    await screen.findByText('Bloquear unidad');
    await usuario.click(await screen.findByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Escribe el motivo')));
    // Y no se llama a la API: el bloqueo sin razón no existe.
    expect(mutaciones().some((c) => c[1].method === 'POST')).toBe(false);
  });

  it('el diálogo sugiere razones frecuentes, las del tipo elegido', async () => {
    const usuario = userEvent.setup();
    const { container } = render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click((await screen.findAllByTitle('Bloquear fechas de esta unidad'))[0]);
    await screen.findByText('Bloquear unidad');

    const razones = () =>
      Array.from(container.querySelectorAll('#razones-bloqueo option')).map((o) =>
        o.getAttribute('value')
      );
    expect(razones()).toContain('Visita de un familiar');

    await usuario.selectOptions(screen.getByLabelText('Tipo de bloqueo'), 'administrativo');
    expect(razones()).toContain('Noches vendidas a una empresa (fuera de canal)');
    expect(razones()).not.toContain('Visita de un familiar');
  });

  it('avisa ANTES de enviar cuando las noches ya están vendidas', async () => {
    const usuario = userEvent.setup();
    const venta = {
      id: 'res-1',
      unitId: 'u2',
      channel: 'booking.com',
      externalBookingId: '5084548141',
      estado: 'confirmed',
      checkIn: new Date(`${diaDeLaSemana(0)}T15:00:00`).toISOString(),
      checkOut: new Date(`${diaDeLaSemana(3)}T11:00:00`).toISOString(),
      checkOutReal: null,
      guestData: { firstName: 'Mohamed', lastName: 'Bouchama' },
      contact: null,
      unit: { id: 'u2', nombre: 'Apto 2', codigo: 'A2' },
    };
    global.fetch = montarFetch(
      [BLOQUEO_ACTIVO, BLOQUEO_LIBERADO, BLOQUEO_FUERA_DE_LA_SEMANA],
      { reservas: [venta] }
    ) as unknown as typeof fetch;
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    // El diálogo abre con el rango de la semana para la unidad Apto 2, que es la
    // que tiene la estancia vendida encima.
    await usuario.click((await screen.findAllByTitle('Bloquear fechas de esta unidad'))[1]);
    await screen.findByText('Bloquear unidad');

    expect(await screen.findByText('Esas noches ya están vendidas')).toBeTruthy();
    // La referencia aparece en el texto del aviso y en su lista de reservas.
    expect(screen.getAllByText(/5084548141/).length).toBeGreaterThan(0);

    await usuario.type(screen.getByLabelText('Motivo (queda registrado)'), 'Uso del propietario');
    await usuario.click(await screen.findByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No se puede cerrar')));
    expect(mutaciones().some((c) => c[1].method === 'POST')).toBe(false);
  });

  it('si el servidor encuentra un choque que la pantalla no veía, lo enseña', async () => {
    const usuario = userEvent.setup();
    const choque = {
      id: 'res-fuera',
      etiqueta: 'booking.com · 6017284583 · Eva Ferrer',
      canal: 'booking.com',
      referencia: '6017284583',
      huesped: 'Eva Ferrer',
      desde: diaDeLaSemana(5),
      hasta: diaDeLaSemana(8),
      estado: 'confirmed',
    };
    // La reserva que choca NO está entre las cargadas (está fuera de la semana
    // visible): el aviso previo no puede verla y es el servidor quien la caza.
    global.fetch = montarFetch(
      [BLOQUEO_ACTIVO, BLOQUEO_LIBERADO, BLOQUEO_FUERA_DE_LA_SEMANA],
      { conflictoPost: [choque] }
    ) as unknown as typeof fetch;
    render(<HospitalityCalendar />);
    await screen.findByText('Bloqueos de fechas (2 activos)');

    await usuario.click((await screen.findAllByTitle('Bloquear fechas de esta unidad'))[0]);
    await screen.findByText('Bloquear unidad');
    await usuario.type(screen.getByLabelText('Motivo (queda registrado)'), 'Uso del propietario');
    await usuario.click(await screen.findByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No se puede cerrar')));
    // Y queda en el diálogo, con la reserva concreta, para poder resolverlo.
    expect(await screen.findByText('Esas noches ya están vendidas')).toBeTruthy();
    expect(screen.getAllByText(/6017284583/).length).toBeGreaterThan(0);
  });
});
