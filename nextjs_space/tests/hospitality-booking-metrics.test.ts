// @vitest-environment node
//
// Guardias de la comparación de reservas directas por idioma (ES vs EN).
//
// La regla de negocio vive en el módulo puro (lib/hospitality/booking-metrics):
// solo cuenta el canal «Directa» que produjo, el español es el respaldo de las
// reservas anteriores al inglés y la lectura accionable se produce en el
// módulo, no en la página. Estos tests fijan ese contrato.

import { describe, it, expect } from 'vitest';
import {
  comparacionIdiomasDirectas,
  lecturaComparacionIdiomas,
  CUOTA_EN_CONVIERTE_BIEN,
  CUOTA_EN_VOLUMEN_MINIMO,
} from '@/lib/hospitality/booking-metrics';
import fs from 'node:fs';
import path from 'node:path';

const RUTA = path.resolve(__dirname, '..', 'app/api/hospitality/dashboard/route.ts');

const reserva = (overrides: Record<string, unknown> = {}) => ({
  channel: 'Directa',
  estado: 'confirmed',
  amountAfterTax: 1000,
  guestData: { idioma: 'en' },
  ...overrides,
});

describe('comparacionIdiomasDirectas — qué cuenta y qué no', () => {
  it('separa ES y EN de las reservas directas y calcula la cuota del inglés', () => {
    const c = comparacionIdiomasDirectas([
      reserva({ guestData: { idioma: 'en' } }),
      reserva({ guestData: { idioma: 'en' }, amountAfterTax: 2500 }),
      reserva({ guestData: { idioma: 'es' } }),
      // Sin idioma: reserva directa anterior al inglés → ES, no se pierde.
      reserva({ guestData: null }),
      // guestData corrupto o raro → ES por el respaldo, nunca rompe.
      reserva({ guestData: 'texto-raro' }),
      reserva({ guestData: { idioma: 'fr' } }),
    ]);

    expect(c.en).toBe(2);
    expect(c.es).toBe(4);
    expect(c.total).toBe(6);
    expect(c.cuotaEn).toBeCloseTo(2 / 6);
    // Solo el inglés suma sus ingresos al bloque EN.
    expect(c.ingresosEn).toBe(3500);
  });

  it('solo cuenta el canal «Directa» — un idioma de canal no significa nada', () => {
    const c = comparacionIdiomasDirectas([
      reserva({ channel: 'airbnb' }),
      reserva({ channel: 'booking' }),
      reserva({ channel: 'Directa' }),
    ]);
    expect(c.total).toBe(1);
    expect(c.en).toBe(1);
  });

  it('excluye lo que no produce: canceladas y no-shows no convierten', () => {
    const c = comparacionIdiomasDirectas([
      reserva({ estado: 'cancelled' }),
      reserva({ estado: 'no_show' }),
      reserva({ estado: 'confirmed' }),
    ]);
    expect(c.total).toBe(1);
  });

  it('los pendientes (holds) SÍ cuentan como conversión — misma regla que el mix de canales', () => {
    // El huésped reservó por la web: eso ya es conversión (aportaProduccion
    // solo excluye cancelled/no_show). Si el hold caduca, esa historia la mide
    // «holds abandonados», no esta. Y un pendiente no aporta ingresos.
    const c = comparacionIdiomasDirectas([
      reserva({ estado: 'pending', amountAfterTax: null }),
      reserva({ estado: 'confirmed' }),
    ]);
    expect(c.total).toBe(2);
    expect(c.ingresosEn).toBe(1000);
  });

  it('sin reservas da ceros y cuota null (nunca NaN)', () => {
    const c = comparacionIdiomasDirectas([]);
    expect(c).toEqual({ en: 0, es: 0, total: 0, cuotaEn: null, ingresosEn: 0 });
  });
});

describe('lecturaComparacionIdiomas — la cifra con su lectura', () => {
  it('sin reservas explica que la comparación aparece al vender', () => {
    const texto = lecturaComparacionIdiomas({ en: 0, es: 0, total: 0, cuotaEn: null, ingresosEn: 0 });
    expect(texto).toContain('Sin reservas directas');
  });

  it('con cero EN pide publicar el enlace inglés, no celebra la cuota', () => {
    const texto = lecturaComparacionIdiomas({ en: 0, es: 12, total: 12, cuotaEn: 0, ingresosEn: 0 });
    expect(texto).toContain('?lang=en');
  });

  it('con poca muestra advierte que la cuota es ruido', () => {
    const texto = lecturaComparacionIdiomas({
      en: 1,
      es: CUOTA_EN_VOLUMEN_MINIMO - 2,
      total: CUOTA_EN_VOLUMEN_MINIMO - 1,
      cuotaEn: 0.2,
      ingresosEn: 1000,
    });
    expect(texto).toContain('ruido');
  });

  it('con volumen y cuota alta confirma que la web internacional convierte', () => {
    const c = {
      en: CUOTA_EN_VOLUMEN_MINIMO,
      es: CUOTA_EN_VOLUMEN_MINIMO,
      total: CUOTA_EN_VOLUMEN_MINIMO * 2,
      cuotaEn: 0.5,
      ingresosEn: 9000,
    };
    expect(c.cuotaEn).toBeGreaterThan(CUOTA_EN_CONVIERTE_BIEN);
    const texto = lecturaComparacionIdiomas(c);
    expect(texto).toContain('convierte');
  });

  it('con volumen y cuota baja apunta al enlace inglés y a los canales', () => {
    const texto = lecturaComparacionIdiomas({
      en: 1,
      es: CUOTA_EN_VOLUMEN_MINIMO * 3,
      total: CUOTA_EN_VOLUMEN_MINIMO * 3 + 1,
      cuotaEn: 1 / (CUOTA_EN_VOLUMEN_MINIMO * 3 + 1),
      ingresosEn: 800,
    });
    expect(texto).toContain('?lang=en');
  });
});

describe('La ruta del dashboard expone la comparación desde el módulo puro', () => {
  const fuente = fs.readFileSync(RUTA, 'utf8');

  it('delega el cálculo y la lectura al módulo (sin aritmética de idiomas inline)', () => {
    expect(fuente).toContain("from '@/lib/hospitality/booking-metrics'");
    expect(fuente).toContain('comparacionIdiomasDirectas(');
    expect(fuente).toContain('lecturaComparacionIdiomas(');
    // Si la ruta empezara a decidir el idioma por su cuenta, esto lo detecta.
    expect(fuente).not.toMatch(/idioma\s*(===|!==)\s*['"]en['"]/);
  });

  it('carga guestData de las reservas (de ahí sale el idioma) y lo expone como bloque idiomas', () => {
    expect(fuente).toMatch(/select:\s*\{[^}]*guestData:\s*true/s);
    expect(fuente).toContain('idiomas:');
  });
});
