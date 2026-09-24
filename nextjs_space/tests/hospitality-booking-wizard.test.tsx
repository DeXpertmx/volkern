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
import { render, screen, cleanup } from '@testing-library/react';
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
