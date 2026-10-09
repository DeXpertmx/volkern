// @vitest-environment jsdom
//
// Guardia del ASISTENTE de reserva directa (BookingWizard): renderiza el
// componente real con la MISMA forma que devuelve `POST
// /api/public/booking/[slug]/cotizar` y mira qué enseña el paso 2.
//
// Lo que protege: cuando el plan tiene estacionalidad el motor manda
// `desgloseNoches` y el asistente enseña el precio de CADA noche —la noche
// cuesta la tarifa de su fecha—; la línea «N noches × tarifa media»
// desaparece, porque esa media no es ningún precio que el huésped vaya a
// pagar. Sin estacionalidad (`desgloseNoches: null`) se enseña exactamente lo
// de siempre, y los importes siguen saliendo del servidor.

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BookingWizard } from '@/components/hospitality/booking/BookingWizard';

const SLUG = 'prop_test';

const CONFIG = {
  titulo: null,
  descripcion: null,
  emailContacto: null,
  telefonoContacto: null,
  politicaCancelacion: null,
  anticipoPorcentaje: 0,
  tarifaLimpieza: null,
  requierePagoOnline: false,
  pagoOnlineDisponible: false,
};

const PROPIEDADES = [
  {
    id: SLUG,
    nombre: 'Hotel Volcán',
    ciudad: 'San Cristóbal',
    direccion: null,
    unidades: [
      {
        id: 'unit_1',
        propertyId: SLUG,
        nombre: 'Loft Bosque',
        tipo: 'apartamento',
        capacidad: 3,
        descripcion: null,
        tarifaPorNoche: 1200,
      },
    ],
  },
];

const UNIDAD_BASE = {
  unitId: 'unit_1',
  propertyId: SLUG,
  nombre: 'Loft Bosque',
  tipo: 'apartamento',
  capacidad: 3,
};

beforeAll(() => {
  // jsdom no implementa PointerEvent y userEvent lo necesita para el click.
  if (!global.PointerEvent) {
    (global as unknown as { PointerEvent: unknown }).PointerEvent = class PointerEvent extends Event {
      button = 0;
      pointerType = 'mouse';
      isPrimary = true;
      hasPointerCapture() {
        return false;
      }
      releasePointerCapture() {}
      constructor(type: string, init?: EventInit) {
        super(type, init);
      }
    };
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Cotiza con la unidad que se le pase, tal como la devolvería la API pública. */
async function cotizarCon(unidad: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => json({ ok: true, noches: 3, moneda: 'MXN', unidades: [unidad] }))
  );
  render(
    <BookingWizard
      slug={SLUG}
      alojamiento="Hotel Volcán"
      moneda="MXN"
      config={CONFIG}
      propiedades={PROPIEDADES}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: /Ver disponibilidad/ }));
}

describe('el asistente enseña la estancia en temporada noche a noche', () => {
  it('con desglose del motor: una línea por noche, con la tarifa de su fecha', async () => {
    await cotizarCon({
      ...UNIDAD_BASE,
      tarifaPorNoche: 1333.33, // media informativa del rango
      desgloseNoches: [
        { fecha: '2026-09-19', tarifa: 1000 },
        { fecha: '2026-09-20', tarifa: 1500 },
        { fecha: '2026-09-21', tarifa: 1500 },
      ],
      desglose: { alojamiento: 4000, limpieza: 0, total: 4000, anticipo: 0, saldo: 4000 },
    });

    expect(await screen.findByText('Precio por noche')).toBeTruthy();
    expect(screen.getByText(/1,000\.00/)).toBeTruthy();
    expect(screen.getAllByText(/1,500\.00/)).toHaveLength(2);

    // Cada noche lleva su fecha, leída en el día local (una fecha ISO no puede
    // correrse un día por el huso horario del huésped).
    expect(screen.getAllByText(/septiembre/)).toHaveLength(3);

    // Y la media del rango («3 × $1.333,33») no se enseña: no es el precio de
    // ninguna noche.
    expect(screen.queryByText(/×/)).toBeNull();
    // El total sigue siendo el del servidor.
    expect(screen.getAllByText(/4,000\.00/).length).toBeGreaterThan(0);
  });

  it('la noche ajustada por las reglas del plan lleva su efecto, con el detalle por regla', async () => {
    await cotizarCon({
      ...UNIDAD_BASE,
      tarifaPorNoche: 100,
      desgloseNoches: [
        {
          fecha: '2026-09-19',
          tarifa: 115,
          base: 100,
          ajustes: [{ tipo: 'antelacion', porcentaje: 15, nombre: 'Última hora' }],
        },
        {
          fecha: '2026-09-20',
          tarifa: 115,
          base: 100,
          ajustes: [{ tipo: 'antelacion', porcentaje: 15, nombre: 'Última hora' }],
        },
        {
          fecha: '2026-09-21',
          tarifa: 85,
          base: 100,
          ajustes: [{ tipo: 'duracion', porcentaje: -15, nombre: 'Semana completa' }],
        },
      ],
      desglose: { alojamiento: 315, limpieza: 0, total: 315, anticipo: 0, saldo: 315 },
    });

    expect(await screen.findByText('Precio por noche')).toBeTruthy();
    // El efecto total de los tramos que tocaron esa noche, con su signo.
    expect(screen.getAllByText('+15 %')).toHaveLength(2);
    expect(screen.getByText('-15 %')).toBeTruthy();
    // Y el detalle por regla, para poder explicar de dónde sale el precio.
    expect(screen.getAllByTitle('Última hora: +15 %')).toHaveLength(2);
    expect(screen.getByTitle('Semana completa: -15 %')).toBeTruthy();
    // Sigue sin enseñarse ninguna media por noche.
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it('sin estacionalidad se enseña la línea de siempre, con el total del servidor', async () => {
    await cotizarCon({
      ...UNIDAD_BASE,
      tarifaPorNoche: 1200,
      desgloseNoches: null,
      // El total lo decide el servidor (incluye limpieza): el asistente no suma.
      desglose: { alojamiento: 3600, limpieza: 100, total: 3700, anticipo: 0, saldo: 3700 },
    });

    expect(await screen.findByText(/×/)).toBeTruthy();
    expect(screen.queryByText('Precio por noche')).toBeNull();
    expect(screen.getByText(/3,700\.00/)).toBeTruthy();
  });
});

describe('El modal del registro muestra lo elegido (foto + fechas en claro)', () => {
  const PROPIEDADES_CON_FOTOS = [
    {
      ...PROPIEDADES[0],
      unidades: [{ ...PROPIEDADES[0].unidades[0], fotos: ['https://cdn.test/loft.jpg'] }],
    },
  ];

  it('el resumen lleva la foto de la unidad y las fechas EN CLARO, no ISO', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ ok: true, noches: 2, moneda: 'MXN', unidades: [{ ...UNIDAD_BASE, tarifaPorNoche: 1200, desgloseNoches: null, desglose: { alojamiento: 2400, limpieza: 0, total: 2400, anticipo: 0, saldo: 2400 } }] }))
    );
    render(
      <BookingWizard
        slug={SLUG}
        alojamiento="Hotel Volcán"
        moneda="MXN"
        config={CONFIG}
        propiedades={PROPIEDADES_CON_FOTOS}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Ver disponibilidad/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Reservar esta unidad/i }));

    const dialogo = await screen.findByRole('dialog');
    // La foto de la unidad elegida, dentro del modal.
    const foto = within(dialogo).getByAltText('Loft Bosque');
    expect(foto.getAttribute('src')).toBe('https://cdn.test/loft.jpg');

    // Las fechas en formato legible (mes en palabras) y la ISO cruda FUERA:
    // «2026-09-19» se puede leer al revés (9 de julio) y eso es un error del
    // huésped esperando a ocurrir.
    //
    // El mes NO se fija a propósito: el asistente ofrece las fechas de hoy en
    // adelante, así que clavar «septiembre» convertía esta comprobación en una
    // bomba de relojería que estalla sola al cambiar de mes.
    expect(within(dialogo).getAllByText(/→/).length).toBeGreaterThan(0);
    const texto = dialogo.textContent || '';
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(texto).toMatch(
      /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/
    );
    // Noches y total del servidor en el mismo resumen.
    expect(texto).toMatch(/2 /);
    expect(texto).toMatch(/2,400\.00/);
  });

  it('sin fotos publicadas el resumen queda sin imagen, nunca una rota', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ ok: true, noches: 1, moneda: 'MXN', unidades: [{ ...UNIDAD_BASE, tarifaPorNoche: 1200, desgloseNoches: null, desglose: { alojamiento: 1200, limpieza: 0, total: 1200, anticipo: 0, saldo: 1200 } }] }))
    );
    render(
      <BookingWizard
        slug={SLUG}
        alojamiento="Hotel Volcán"
        moneda="MXN"
        config={CONFIG}
        propiedades={PROPIEDADES}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Ver disponibilidad/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Reservar esta unidad/i }));

    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).queryByRole('img')).toBeNull();
    // Las fechas siguen en claro sin foto (mes en palabras, ISO fuera).
    expect((dialogo.textContent || '')).toMatch(
      /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/
    );
  });
});
