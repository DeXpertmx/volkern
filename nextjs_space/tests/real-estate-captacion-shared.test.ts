/**
 * Tests Unitarios — Real Estate Captación (piezas compartidas)
 *
 * Cubre el módulo que el panel inmobiliario importa en el navegador:
 * `lib/real-estate/captacion-shared.ts`. Verifica el cálculo de la comisión de
 * captación, la vigencia por fechas, los días restantes, el catálogo de estados
 * y tipos, y la lectura del campo `media` del inmueble.
 *
 * Y comprueba que `captacion-helpers.ts` sigue reexportando lo que reexportaba:
 * el panel usa el módulo compartido, pero el servidor no debe enterarse.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {},
}));

import {
  CAPTACION_ESTADOS,
  CAPTACION_TIPOS,
  calcularComisionCaptacion,
  diasRestantesCaptacion,
  etiquetaEstadoCaptacion,
  etiquetaTipoCaptacion,
  infoEstadoCaptacion,
  infoTipoCaptacion,
  isCaptacionVigente,
  primeraImagenInmueble,
} from '@/lib/real-estate/captacion-shared';

const DIA = 86_400_000;

describe('calcularComisionCaptacion', () => {
  it('aplica el porcentaje sobre el precio ofertado', () => {
    expect(calcularComisionCaptacion(250_000, 3.5, null)).toBe(8_750);
    expect(calcularComisionCaptacion(1_000_000, 3, null)).toBe(30_000);
  });

  it('usa el importe fijo cuando no hay porcentaje', () => {
    expect(calcularComisionCaptacion(250_000, null, 5_000)).toBe(5_000);
    expect(calcularComisionCaptacion(250_000, undefined, 5_000)).toBe(5_000);
    expect(calcularComisionCaptacion(250_000, 0, 5_000)).toBe(5_000);
  });

  it('el porcentaje manda sobre el importe fijo', () => {
    expect(calcularComisionCaptacion(200_000, 5, 1_000)).toBe(10_000);
  });

  it('sin porcentaje ni fijo la comisión es cero, no un valor inventado', () => {
    expect(calcularComisionCaptacion(200_000, null, null)).toBe(0);
    expect(calcularComisionCaptacion(0, 3, null)).toBe(0);
  });
});

describe('isCaptacionVigente', () => {
  // Momento de referencia fijo que se inyecta en la función: la vigencia se mide
  // contra esta fecha y no contra el reloj real. Antes se comparaba con el reloj
  // de verdad y el caso «aún no ha empezado» se convirtió en «empezó hace cuatro
  // días» en cuanto pasó la fecha escrita aquí, que es como se rompió el test.
  const ahora = new Date('2026-09-29T12:00:00Z');

  it('es vigente dentro de la ventana de fechas y estando activa', () => {
    const captacion = {
      estado: 'activa',
      fechaInicio: new Date(ahora.getTime() - 30 * DIA),
      fechaFin: new Date(ahora.getTime() + 30 * DIA),
    };
    expect(isCaptacionVigente(captacion, ahora)).toBe(true);
  });

  it('no es vigente si ya pasó la fecha de fin, aunque siga marcada como activa', () => {
    const captacion = {
      estado: 'activa',
      fechaInicio: new Date(ahora.getTime() - 60 * DIA),
      fechaFin: new Date(ahora.getTime() - 5 * DIA),
    };
    expect(isCaptacionVigente(captacion, ahora)).toBe(false);
  });

  it('no es vigente si aún no ha empezado', () => {
    const captacion = {
      estado: 'activa',
      fechaInicio: new Date(ahora.getTime() + 5 * DIA),
      fechaFin: new Date(ahora.getTime() + 60 * DIA),
    };
    expect(isCaptacionVigente(captacion, ahora)).toBe(false);
  });

  it('un borrador o un contrato cerrado no están vigentes por fechas que sean', () => {
    const base = {
      fechaInicio: new Date(ahora.getTime() - 10 * DIA),
      fechaFin: new Date(ahora.getTime() + 10 * DIA),
    };
    expect(isCaptacionVigente({ ...base, estado: 'borrador' }, ahora)).toBe(false);
    expect(isCaptacionVigente({ ...base, estado: 'cerrada' }, ahora)).toBe(false);
    expect(isCaptacionVigente({ ...base, estado: 'cancelada' }, ahora)).toBe(false);
  });
});

describe('diasRestantesCaptacion', () => {
  // Fechas construidas en hora local: el cálculo se hace por días naturales, y
  // un literal con `Z` cambiaría el resultado según la zona del que ejecuta los
  // tests, no según el código.
  const ahora = new Date(2026, 8, 29, 9, 30);

  it('cuenta días naturales hasta el fin del contrato', () => {
    expect(diasRestantesCaptacion({ fechaFin: new Date(2026, 9, 4) }, ahora)).toBe(5);
    expect(diasRestantesCaptacion({ fechaFin: new Date(2026, 8, 29) }, ahora)).toBe(0);
  });

  it('devuelve negativo cuando el contrato ya venció', () => {
    expect(diasRestantesCaptacion({ fechaFin: new Date(2026, 8, 19) }, ahora)).toBe(-10);
  });

  it('acepta el fin como `Date` o como cadena', () => {
    expect(diasRestantesCaptacion({ fechaFin: '2026-10-04T00:00:00' }, ahora)).toBe(5);
  });
});

describe('catálogo de estados y tipos', () => {
  it('cada estado trae etiqueta, descripción y badge', () => {
    for (const estado of CAPTACION_ESTADOS) {
      expect(estado.label.length).toBeGreaterThan(0);
      expect(estado.descripcion.length).toBeGreaterThan(0);
      expect(estado.badge.length).toBeGreaterThan(0);
    }
  });

  it('cubre los cinco estados del modelo', () => {
    expect(CAPTACION_ESTADOS.map((e) => e.value).sort()).toEqual([
      'activa',
      'borrador',
      'cancelada',
      'cerrada',
      'vencida',
    ]);
  });

  it('cubre los tres tipos del modelo', () => {
    expect(CAPTACION_TIPOS.map((t) => t.value).sort()).toEqual(['compartida', 'exclusiva', 'mandato']);
  });

  it('resuelve la ficha de un valor conocido', () => {
    expect(infoEstadoCaptacion('activa')?.label).toBe('Activa');
    expect(infoTipoCaptacion('exclusiva')?.label).toBe('Exclusiva');
  });

  it('ante un valor desconocido devuelve la cadena cruda y no inventa etiqueta', () => {
    expect(infoEstadoCaptacion('en-revision')).toBeUndefined();
    expect(etiquetaEstadoCaptacion('en-revision')).toBe('en-revision');
    expect(etiquetaTipoCaptacion('permuta')).toBe('permuta');
    expect(etiquetaEstadoCaptacion(null)).toBe('—');
    expect(etiquetaTipoCaptacion(undefined)).toBe('—');
  });
});

describe('primeraImagenInmueble', () => {
  it('lee una lista de URLs', () => {
    expect(primeraImagenInmueble(['https://cdn/a.jpg', 'https://cdn/b.jpg'])).toBe('https://cdn/a.jpg');
  });

  it('lee una lista de objetos con `url`', () => {
    expect(primeraImagenInmueble([{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }])).toBe(
      'https://cdn/a.jpg'
    );
  });

  it('devuelve null cuando no hay imagen utilizable', () => {
    expect(primeraImagenInmueble(null)).toBeNull();
    expect(primeraImagenInmueble([])).toBeNull();
    expect(primeraImagenInmueble('https://cdn/a.jpg')).toBeNull();
    expect(primeraImagenInmueble([{}])).toBeNull();
    expect(primeraImagenInmueble([{ url: 42 }])).toBeNull();
  });
});

describe('captacion-helpers reexporta el contrato del servidor', () => {
  it('sigue exponiendo el cálculo de comisión y la vigencia', async () => {
    const helpers = await import('@/lib/real-estate/captacion-helpers');
    expect(helpers.calcularComisionCaptacion(100_000, 3, null)).toBe(3_000);
    expect(
      helpers.isCaptacionVigente({
        estado: 'activa',
        fechaInicio: new Date(Date.now() - DIA),
        fechaFin: new Date(Date.now() + DIA),
      })
    ).toBe(true);
  });
});
