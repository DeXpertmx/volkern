// @vitest-environment node
//
// Guardias del i18n del Booking Engine público (lib/hospitality/booking-i18n.ts):
// el defecto es SIEMPRE español, los dos idiomas tienen las mismas claves y
// los mismos motivos de indisponibilidad que produce el Availability Engine.

import { describe, it, expect } from 'vitest';
import {
  CHECKIN_TEXTOS,
  PLANTILLAS_SUGERIDAS,
  TEXTOS,
  IDIOMAS,
  IDIOMA_POR_DEFECTO,
  etiquetasDeCampos,
  interpolar,
  idiomaDesdeUrl,
  localeDeIdioma,
} from '@/lib/hospitality/booking-i18n';
import { CAMPOS_VIAJERO } from '@/lib/hospitality/guest-checkin';

describe('booking-i18n', () => {
  it('el español es el idioma por defecto y ambos idiomas están definidos', () => {
    expect(IDIOMAS).toEqual(['es', 'en']);
    expect(IDIOMA_POR_DEFECTO).toBe('es');
    expect(TEXTOS.es).toBeDefined();
    expect(TEXTOS.en).toBeDefined();
  });

  it('los dos idiomas comparten exactamente las mismas claves (sin huecos de traducción)', () => {
    const clavesEs = Object.keys(TEXTOS.es).sort();
    const clavesEn = Object.keys(TEXTOS.en).sort();
    expect(clavesEn).toEqual(clavesEs);
    // Y ninguna cadena vacía.
    for (const idioma of IDIOMAS) {
      for (const [clave, valor] of Object.entries(TEXTOS[idioma])) {
        if (clave === 'motivos') continue;
        expect((valor as string).length, `${idioma}.${clave} vacía`).toBeGreaterThan(0);
      }
      for (const [motivo, texto] of Object.entries(TEXTOS[idioma].motivos)) {
        expect(texto.length, `${idioma}.motivos.${motivo} vacío`).toBeGreaterThan(0);
      }
    }
  });

  it('los motivos cubren los que produce el Availability Engine', () => {
    const esperados = ['ocupada', 'min_noches', 'max_noches', 'dia_checkin', 'dia_checkout', 'sin_tarifa'];
    for (const idioma of IDIOMAS) {
      for (const motivo of esperados) {
        expect(TEXTOS[idioma].motivos[motivo], `${idioma} sin motivo ${motivo}`).toBeDefined();
      }
    }
  });

  it('idiomaDesdeUrl: ?lang=en es inglés y todo lo demás (ausente, corrupto, desconocido) es español', () => {
    expect(idiomaDesdeUrl('?lang=en')).toBe('en');
    expect(idiomaDesdeUrl('?lang=EN')).toBe('en'); // case-insensitive
    expect(idiomaDesdeUrl('?lang=en&embed=1')).toBe('en');
    expect(idiomaDesdeUrl('')).toBe('es');
    expect(idiomaDesdeUrl(null)).toBe('es');
    expect(idiomaDesdeUrl('?embed=1')).toBe('es'); // enlace antiguo sin lang
    expect(idiomaDesdeUrl('?lang=fr')).toBe('es');
    expect(idiomaDesdeUrl('?lang=')).toBe('es');
  });

  it('interpolar sustituye {variables} y deja intactas las que faltan', () => {
    expect(interpolar('{libres} de {total} unidades', { libres: 2, total: 5 })).toBe('2 de 5 unidades');
    expect(interpolar('hasta {n} personas', { n: 4 })).toBe('hasta 4 personas');
    expect(interpolar('hola {inexistente}', {})).toBe('hola {inexistente}');
  });

  it('localeDeIdioma: inglés → en-US, español → es-MX', () => {
    expect(localeDeIdioma('en')).toBe('en-US');
    expect(localeDeIdioma('es')).toBe('es-MX');
  });
});

describe('CHECKIN_TEXTOS (check-in online del huésped)', () => {
  it('los dos idiomas tienen las mismas claves y ninguna cadena vacía', () => {
    const clavesEs = Object.keys(CHECKIN_TEXTOS.es).sort();
    const clavesEn = Object.keys(CHECKIN_TEXTOS.en).sort();
    expect(clavesEn).toEqual(clavesEs);

    for (const idioma of IDIOMAS) {
      for (const [clave, valor] of Object.entries(CHECKIN_TEXTOS[idioma])) {
        if (clave === 'campos') continue;
        expect((valor as string).length, `${idioma}.${clave} vacía`).toBeGreaterThan(0);
      }
    }
  });

  it('cada campo del registro de viajeros sabe decirse en los dos idiomas', () => {
    for (const idioma of IDIOMAS) {
      for (const campo of CAMPOS_VIAJERO) {
        const etiqueta = CHECKIN_TEXTOS[idioma].campos[campo];
        expect(etiqueta, `${idioma} sin etiqueta para ${campo}`).toBeTruthy();
      }
      // Sin claves de más: la lista de campos es la del módulo, no una copia.
      expect(Object.keys(CHECKIN_TEXTOS[idioma].campos).sort()).toEqual([...CAMPOS_VIAJERO].sort());
    }
  });

  it('etiquetasDeCampos arma la lista de «revisa esto» en el idioma del huésped', () => {
    expect(etiquetasDeCampos(['tipoDocumento', 'direccion.pais'], 'es')).toBe(
      'Tipo de documento, País'
    );
    expect(etiquetasDeCampos(['tipoDocumento', 'direccion.pais'], 'en')).toBe(
      'Document type, Country'
    );
  });

  it('los campos de contacto se explican aparte (teléfono o email: basta uno)', () => {
    for (const idioma of IDIOMAS) {
      expect(CHECKIN_TEXTOS[idioma].campoTelefono).toBeTruthy();
      expect(CHECKIN_TEXTOS[idioma].campoEmail).toBeTruthy();
    }
  });
});

describe('el enlace de check-in en las plantillas al huésped', () => {
  it('pre-llegada y check-in lo llevan en los dos idiomas (es lo que cierra el registro)', () => {
    for (const idioma of IDIOMAS) {
      expect(PLANTILLAS_SUGERIDAS[idioma].pre_llegada.contenido).toContain('{{enlace_checkin}}');
      expect(PLANTILLAS_SUGERIDAS[idioma].check_in.contenido).toContain('{{enlace_checkin}}');
    }
  });
});
