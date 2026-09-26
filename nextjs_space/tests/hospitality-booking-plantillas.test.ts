import { describe, expect, it } from 'vitest';
import {
  PLANTILLA_CLASICA,
  PLANTILLA_COMPACTA,
  PLANTILLA_MINIMAL,
  PLANTILLA_MODERNA,
  PLANTILLAS_CATALOGO,
  cssDePersonalizacion,
  esPlantillaValida,
  hostVerificacionDominio,
  logoDeValor,
  normalizarDominio,
  normalizarPersonalizacion,
  personalizacionDeValor,
  plantillaDeValor,
  tokenVerificacionDominio,
} from '@/lib/hospitality/booking-plantillas';

describe('plantillas del Booking Engine', () => {
  it('los cuatro valores del catálogo son válidos y completos', () => {
    expect(PLANTILLAS_CATALOGO.map((p) => p.valor)).toEqual([
      PLANTILLA_CLASICA,
      PLANTILLA_MODERNA,
      PLANTILLA_COMPACTA,
      PLANTILLA_MINIMAL,
    ]);
    for (const p of PLANTILLAS_CATALOGO) {
      expect(esPlantillaValida(p.valor)).toBe(true);
      expect(p.nombre.length).toBeGreaterThan(0);
      expect(p.descripcion.length).toBeGreaterThan(0);
    }
  });

  it('desconocido, nulo, vacío y basura caen a la plantilla clásica', () => {
    expect(plantillaDeValor(null)).toBe(PLANTILLA_CLASICA);
    expect(plantillaDeValor(undefined)).toBe(PLANTILLA_CLASICA);
    expect(plantillaDeValor('')).toBe(PLANTILLA_CLASICA);
    expect(plantillaDeValor('aeropuerto')).toBe(PLANTILLA_CLASICA);
    expect(plantillaDeValor(42)).toBe(PLANTILLA_CLASICA);
    expect(plantillaDeValor({ rarito: true })).toBe(PLANTILLA_CLASICA);
  });

  it('los cuatro valores reconocidos pasan tal cual', () => {
    expect(plantillaDeValor('moderna')).toBe(PLANTILLA_MODERNA);
    expect(plantillaDeValor('compacta')).toBe(PLANTILLA_COMPACTA);
    expect(plantillaDeValor('minimal')).toBe(PLANTILLA_MINIMAL);
    expect(plantillaDeValor('clasica')).toBe(PLANTILLA_CLASICA);
  });
});

describe('personalización de la página pública', () => {
  it('lo inválido (null, string, array, objeto raro) cae a defaults completos', () => {
    for (const basura of [null, undefined, 'rojo', [], { colorPrimario: 'sinhash' }, { colorPrimario: 5 }]) {
      const p = personalizacionDeValor(basura);
      expect(p.colorPrimario).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.colorFondo).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.colorTexto).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.radioTarjeta).toMatch(/^#[0-9a-f]{6}$|^[\d.]+(rem|px)$/);
    }
  });

  it('colores válidos se normalizan (mayúsculas → minúsculas) y los inválidos caen a default', () => {
    const p = personalizacionDeValor({ colorPrimario: '#A855F7', colorFondo: 'no-soy-hex', radioTarjeta: '0.5rem' });
    expect(p.colorPrimario).toBe('#a855f7');
    expect(p.colorFondo).toBe('#ffffff');
    // radioTarjeta acepta rem/px además de hex: un valor con forma válida pasa
    expect(p.radioTarjeta).toBe('0.5rem');
  });

  it('normalizarPersonalizacion solo devuelve claves conocidas', () => {
    const n = normalizarPersonalizacion({ colorPrimario: '#123456', claveInventada: 'x' });
    expect(Object.keys(n).sort()).toEqual(['colorFondo', 'colorPrimario', 'colorTexto', 'radioTarjeta']);
  });

  it('cssDePersonalizacion expone las variables --booking-*', () => {
    const css = cssDePersonalizacion(personalizacionDeValor({ colorPrimario: '#123456' }));
    expect(css['--booking-primario']).toBe('#123456');
    expect(css['--booking-fondo']).toBe('#ffffff');
    expect(css['--booking-texto']).toBe('#0f172a');
  });
});

describe('dominio propio del tenant', () => {
  it('normaliza pegado con protocolo, www, mayúsculas, puerto y ruta', () => {
    expect(normalizarDominio('https://Reservas.MiHotel.com/booking?x=1')).toEqual({ ok: true, dominio: 'reservas.mihotel.com' });
    expect(normalizarDominio('WWW.HOTEL.ES:8443')).toEqual({ ok: true, dominio: 'hotel.es' });
    expect(normalizarDominio('  bookings.example.org  ')).toEqual({ ok: true, dominio: 'bookings.example.org' });
  });

  it('vacío significa quitar el dominio (null), no un error', () => {
    expect(normalizarDominio('')).toEqual({ ok: true, dominio: undefined });
    expect(normalizarDominio('   ')).toEqual({ ok: true, dominio: undefined });
    expect(normalizarDominio(null)).toEqual({ ok: true, dominio: undefined });
  });

  it('rechaza no-dominios, volkern.app y disparate largo', () => {
    expect(normalizarDominio('no es un dominio').ok).toBe(false);
    expect(normalizarDominio('reservas.volkern.app').ok).toBe(false);
    expect(normalizarDominio('-malo.com').ok).toBe(false);
    expect(normalizarDominio('a'.repeat(300) + '.com').ok).toBe(false);
    expect(normalizarDominio(42).ok).toBe(false);
  });

  it('el token de verificación liga dominio y slug del tenant', () => {
    expect(tokenVerificacionDominio('mi-hotel')).toBe('volkern-booking=mi-hotel');
    expect(hostVerificacionDominio('reservas.mihotel.com')).toBe('_volkern-booking.reservas.mihotel.com');
  });
});

describe('logo de la cabecera', () => {
  it('acepta URLs http(s) y rutas de la app, y recorta espacios', () => {
    expect(logoDeValor('https://cdn.mihotel.com/logo.png')).toBe('https://cdn.mihotel.com/logo.png');
    expect(logoDeValor('  https://cdn.mihotel.com/logo.png  ')).toBe('https://cdn.mihotel.com/logo.png');
    expect(logoDeValor('/uploads/logo-booking.png')).toBe('/uploads/logo-booking.png');
  });

  it('lo que no es una URL de imagen vale «sin logo» (null), nunca una imagen rota', () => {
    for (const basura of [
      null,
      undefined,
      '',
      '   ',
      'logo.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      42,
      { url: 'https://x.com/l.png' },
    ]) {
      expect(logoDeValor(basura)).toBeNull();
    }
  });
});
