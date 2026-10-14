import { describe, it, expect } from 'vitest';

/**
 * Guardias del editor visual de plantillas de email (plan maestro §21).
 *
 * Lo que fijan:
 *   1. La validación del diseño: nada de bloques vacíos, techos de tamaño y un
 *      botón con destino (URL o variable), porque un diseño que entra es un
 *      diseño que se envía.
 *   2. El escapado: el HTML escrito por el hotel y los DATOS DEL HUÉSPED son
 *      texto. Un huésped llamado `<script>` no puede inyectar nada en el correo.
 *   3. Las marcas del editor (`**negrita**`, `*cursiva*`, `[texto](enlace)`) se
 *      reconocen en lo que escribe el hotel y no en los valores del contexto.
 *   4. Los diseños sugeridos existen en los dos idiomas con las MISMAS variables,
 *      y ninguna variable es inventada: todas las resuelve el contexto del envío.
 */

import {
  contextoEjemplo,
  disenoSugerido,
  enlaceSeguro,
  escaparHtml,
  interpolarPlantilla,
  normalizarDiseno,
  renderDisenoEmail,
  textoPlanoDiseno,
  EVENTOS_CON_DISENO,
  LIMITES_DISENO,
  type DisenoEmail,
} from '../lib/hospitality/comunicaciones-email';
import { buildContextoPlantilla, IDIOMAS_COMUNICACION, leerDiseno } from '../lib/hospitality/comunicaciones';

function disenoValido(extra: Partial<DisenoEmail> = {}): DisenoEmail {
  const validado = normalizarDiseno({
    version: 1,
    titulo: '{{propiedad}}',
    bloques: [{ tipo: 'texto', texto: 'Hola {{nombre}}' }],
    ...extra,
  });
  if (!validado.ok) throw new Error(`diseño de prueba inválido: ${validado.error}`);
  return validado.diseno;
}

describe('normalizarDiseno', () => {
  it('rechaza lo que no es un objeto', () => {
    expect(normalizarDiseno(null).ok).toBe(false);
    expect(normalizarDiseno('hola').ok).toBe(false);
    expect(normalizarDiseno([]).ok).toBe(false);
    expect(normalizarDiseno(42).ok).toBe(false);
  });

  it('un diseño sin ningún bloque con contenido no se guarda', () => {
    const res = normalizarDiseno({ bloques: [{ tipo: 'texto', texto: '   ' }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('ningún bloque');
  });

  it('rechaza un tipo de bloque desconocido', () => {
    const res = normalizarDiseno({ bloques: [{ tipo: 'iframe', texto: 'x' }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Tipo de bloque inválido');
  });

  it('recorta los textos y tira los bloques y filas vacíos', () => {
    const res = normalizarDiseno({
      titulo: '  {{propiedad}}  ',
      bloques: [
        { tipo: 'texto', texto: '  Hola  ' },
        { tipo: 'datos', titulo: 'Sección', filas: [{ etiqueta: 'Entrada', valor: '{{checkIn}}' }, { etiqueta: '', valor: '' }] },
        { tipo: 'texto', texto: '' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.diseno.titulo).toBe('{{propiedad}}');
    expect(res.diseno.bloques).toHaveLength(2);
    expect(res.diseno.bloques[0]).toEqual({ tipo: 'texto', texto: 'Hola' });
    expect((res.diseno.bloques[1] as { filas: unknown[] }).filas).toHaveLength(1);
  });

  it('el botón necesita texto y un destino: URL o variable', () => {
    const sinTexto = normalizarDiseno({ bloques: [{ tipo: 'boton', botonTexto: '', botonEnlace: 'https://volkern.app' }] });
    expect(sinTexto.ok).toBe(false);

    const enlaceMalo = normalizarDiseno({ bloques: [{ tipo: 'boton', botonTexto: 'Ir', botonEnlace: 'javascript:alert(1)' }] });
    expect(enlaceMalo.ok).toBe(false);

    const conVariable = normalizarDiseno({ bloques: [{ tipo: 'boton', botonTexto: 'Registro', botonEnlace: '{{enlace_checkin}}' }] });
    expect(conVariable.ok).toBe(true);

    const conUrl = normalizarDiseno({ bloques: [{ tipo: 'boton', botonTexto: 'Ir', botonEnlace: 'https://volkern.app/checkin' }] });
    expect(conUrl.ok).toBe(true);
  });

  it('rechaza pasarse de los techos en vez de recortar en silencio', () => {
    const muchos = normalizarDiseno({
      bloques: Array.from({ length: LIMITES_DISENO.bloques + 1 }, () => ({ tipo: 'texto', texto: 'x' })),
    });
    expect(muchos.ok).toBe(false);

    const largo = normalizarDiseno({ bloques: [{ tipo: 'texto', texto: 'x'.repeat(LIMITES_DISENO.texto + 1) }] });
    expect(largo.ok).toBe(false);

    const tituloLargo = normalizarDiseno({ titulo: 'x'.repeat(LIMITES_DISENO.titulo + 1), bloques: [{ tipo: 'texto', texto: 'x' }] });
    expect(tituloLargo.ok).toBe(false);

    const filasDeMas = normalizarDiseno({
      bloques: [
        {
          tipo: 'datos',
          titulo: 'Sección',
          filas: Array.from({ length: LIMITES_DISENO.filas + 1 }, () => ({ etiqueta: 'a', valor: 'b' })),
        },
      ],
    });
    expect(filasDeMas.ok).toBe(false);
  });

  it('la cabecera solo acepta un logotipo http(s) y descarta lo demás', () => {
    const ok = normalizarDiseno({
      cabecera: { nombre: 'Hotel', etiqueta: 'Reserva confirmada', logotipo: 'https://cdn.volkern.app/logo.png' },
      bloques: [{ tipo: 'texto', texto: 'x' }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.diseno.cabecera?.logotipo).toBe('https://cdn.volkern.app/logo.png');

    const malo = normalizarDiseno({
      cabecera: { nombre: 'Hotel', logotipo: 'javascript:alert(1)' },
      bloques: [{ tipo: 'texto', texto: 'x' }],
    });
    // El logotipo se descarta, pero el diseño sigue siendo válido: no es motivo
    // para perder el correo entero.
    expect(malo.ok).toBe(true);
    if (malo.ok) expect(malo.diseno.cabecera?.logotipo).toBeUndefined();
  });

  it('leerDiseno ignora un JSON corrupto en vez de romper el envío', () => {
    expect(leerDiseno(null)).toBeNull();
    expect(leerDiseno({ bloques: 'no soy un array' })).toBeNull();
    expect(leerDiseno({ bloques: [{ tipo: 'texto', texto: 'ok' }] })?.bloques).toHaveLength(1);
  });
});

describe('el HTML del correo es seguro', () => {
  it('el HTML que escribe el hotel se lee como texto, no se ejecuta', () => {
    const diseno = disenoValido({ bloques: [{ tipo: 'texto', texto: '<script>alert(1)</script> y <b>negrita</b>' }] });
    const { html } = renderDisenoEmail(diseno, { nombre: 'Ana' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>negrita</b>');
  });

  it('los datos del huésped se escapan (un nombre con etiquetas no inyecta nada)', () => {
    const diseno = disenoValido({
      titulo: '{{propiedad}}',
      bloques: [
        { tipo: 'texto', texto: 'Hola {{nombre}}' },
        { tipo: 'datos', titulo: 'Huésped', filas: [{ etiqueta: 'Nombre', valor: '{{nombre}}' }] },
      ],
    });
    const { html, text } = renderDisenoEmail(diseno, {
      nombre: '"><img src=x onerror=alert(1)>',
      propiedad: 'Villa Mar',
    });
    // Ni una etiqueta real: lo que el huésped escribió es texto escapado. (El
    // texto `onerror=alert` sobrevive como TEXTO, que es inofensivo: lo que no
    // puede aparecer es la etiqueta `<img` sin escapar.)
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot;&gt;&lt;img src=x');
    expect(text).toContain('<img src=x onerror=alert(1)>');
  });

  it('las marcas se reconocen en lo que escribe el hotel, no en el nombre del huésped', () => {
    const diseno = disenoValido({
      bloques: [
        { tipo: 'texto', texto: 'Pago: **pagado** y *pendiente*' },
        { tipo: 'datos', titulo: 'Huésped', filas: [{ etiqueta: 'Nombre', valor: '{{nombre}}' }] },
      ],
    });
    const { html } = renderDisenoEmail(diseno, { nombre: '**Ana**' });
    expect(html).toContain('<strong>pagado</strong>');
    expect(html).toContain('<em>pendiente</em>');
    // El nombre del huésped no lleva negrita: no escribió una marca, es su nombre.
    expect(html).toContain('**Ana**');
    expect(html).not.toContain('<strong>Ana</strong>');
  });

  it('los enlaces del hotel solo son http(s) o mailto', () => {
    const diseno = disenoValido({
      bloques: [
        { tipo: 'texto', texto: '[Bonito](javascript:alert(1)) y [Web](https://volkern.app)' },
      ],
    });
    const { html } = renderDisenoEmail(diseno, {});
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="https://volkern.app"');

    expect(enlaceSeguro('javascript:alert(1)')).toBeNull();
    expect(enlaceSeguro('data:text/html,x')).toBeNull();
    expect(enlaceSeguro('mailto:hola@volkern.app')).toBe('mailto:hola@volkern.app');
  });

  it('los enlaces de las variables quedan pulsables', () => {
    const diseno = disenoValido({
      bloques: [
        { tipo: 'texto', texto: 'Completa tu registro: {{enlace_checkin}}' },
        { tipo: 'boton', botonTexto: 'Registro', botonEnlace: '{{enlace_checkin}}' },
      ],
    });
    const { html } = renderDisenoEmail(diseno, { enlace_checkin: 'https://volkern.app/checkin/tok_1?lang=es' });
    expect(html).toContain('href="https://volkern.app/checkin/tok_1?lang=es"');
    // El botón lleva su propio enlace.
    expect((html.match(/href="https:\/\/volkern.app\/checkin/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('una variable desconocida se queda a la vista en vez de desaparecer', () => {
    const { html } = renderDisenoEmail(disenoValido({ bloques: [{ tipo: 'texto', texto: 'Hola {{inventada}}' }] }), {});
    expect(html).toContain('{{inventada}}');
    expect(escaparHtml('<x>')).toBe('&lt;x&gt;');
    expect(interpolarPlantilla('{{a}}/{{b}}', { a: '1' })).toBe('1/{{b}}');
  });
});

describe('el correo se compila a tabla', () => {
  it('maqueta con tablas y estilos en línea (lo que renderizan los clientes de correo)', () => {
    const diseno = disenoValido({
      cabecera: { nombre: 'Villa Mar Azul', etiqueta: 'Reserva confirmada' },
      titulo: '{{propiedad}}',
      pie: 'Gracias',
      bloques: [
        { tipo: 'texto', texto: 'Hola' },
        { tipo: 'datos', titulo: 'Detalles de la reserva', filas: [{ etiqueta: 'Entrada', valor: '{{checkIn}}' }] },
        { tipo: 'boton', botonTexto: 'Registro', botonEnlace: 'https://volkern.app/checkin' },
      ],
    });
    const { html, text } = renderDisenoEmail(diseno, { propiedad: 'Villa Mar Azul', checkIn: 'viernes, 16 de octubre' });

    expect(html).toContain('<table');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('Detalles de la reserva');
    expect(html).toContain('Entrada');
    expect(html).toContain('viernes, 16 de octubre');
    // Sin hojas de estilo: todo va en el atributo style.
    expect(html).not.toContain('<style');
    expect(html).not.toContain('class=');

    // El texto plano lleva las mismas filas, sin marcas ni etiquetas.
    expect(text).toContain('Villa Mar Azul');
    expect(text).toContain('Entrada: viernes, 16 de octubre');
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('un botón sin destino utilizable queda como texto, no como enlace roto', () => {
    const diseno = disenoValido({ bloques: [{ tipo: 'boton', botonTexto: 'Registro', botonEnlace: '{{enlace_checkin}}' }] });
    const { html } = renderDisenoEmail(diseno, { enlace_checkin: '' });
    expect(html).not.toContain('<a href=""');
    expect(html).toContain('Registro');
  });

  it('un diseño sin secciones sigue siendo un correo válido', () => {
    const { html } = renderDisenoEmail(disenoValido(), { nombre: 'Ana' });
    expect(html).toContain('Hola Ana');
  });
});

const RESERVA = {
  id: 'r1',
  channel: 'Booking',
  externalBookingId: 'BK-9',
  estado: 'confirmed',
  checkIn: new Date('2026-10-16T15:00:00Z'),
  checkOut: new Date('2026-10-18T11:00:00Z'),
  amountAfterTax: 2400,
  currency: 'MXN',
  guestData: { nombre: 'Ana Torres', email: 'ana@ejemplo.com', telefono: '+52 998 555 0102' },
};

function variables(texto: string): string {
  return [...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');
}

describe('diseños sugeridos', () => {
  it('los eventos con diseño son los que se traducen, y existen en los dos idiomas', () => {
    for (const evento of EVENTOS_CON_DISENO) {
      for (const idioma of IDIOMAS_COMUNICACION) {
        const diseno = disenoSugerido(evento, idioma);
        expect(diseno, `${evento}/${idioma} sin diseño`).toBeTruthy();
        expect(diseno!.bloques.length).toBeGreaterThan(0);
      }
    }
    // El briefing matutino no es un correo al huésped: no tiene diseño sugerido.
    expect(disenoSugerido('briefing_diario', 'es')).toBeNull();
    expect(disenoSugerido('inventado', 'es')).toBeNull();
  });

  it('es y en usan exactamente las mismas variables y etiquetas distintas', () => {
    for (const evento of EVENTOS_CON_DISENO) {
      const es = disenoSugerido(evento, 'es')!;
      const en = disenoSugerido(evento, 'en')!;
      expect(variables(JSON.stringify(en))).toBe(variables(JSON.stringify(es)));
      expect(JSON.stringify(en)).not.toBe(JSON.stringify(es));
    }
  });

  it('ninguna variable del diseño es inventada: el contexto del envío las resuelve todas', () => {
    const contexto = buildContextoPlantilla({
      reserva: RESERVA,
      unidad: { nombre: 'Suite Océano' },
      propiedad: { nombre: 'Villa Mar Azul' },
      idioma: 'es',
      enlaceCheckin: 'https://volkern.app/checkin/tok?lang=es',
      enlaceResena: 'https://volkern.app/review/tok?lang=es',
      preguntasPendientes: ['documento de identidad'],
      indicaciones: 'Calle del Puerto 12',
    });
    for (const evento of EVENTOS_CON_DISENO) {
      const diseno = disenoSugerido(evento, 'es')!;
      const { html, text } = renderDisenoEmail(diseno, contexto);
      // Ni una variable sin resolver en lo que se compila (el diseño guardado
      // sí lleva los `{{...}}`: es la plantilla, no el resultado).
      expect(`${html} ${text}`, `${evento} deja una variable sin resolver`).not.toMatch(/\{\{/);
    }
  });

  it('el diseño sugerido pasa la misma validación que el que guarda la API', () => {
    for (const evento of EVENTOS_CON_DISENO) {
      const diseno = disenoSugerido(evento, 'es')!;
      const roundtrip = normalizarDiseno(JSON.parse(JSON.stringify(diseno)));
      expect(roundtrip.ok).toBe(true);
    }
  });
});

describe('guardias del editor visual', () => {
  it('el contexto de ejemplo cubre las mismas variables que el envío real', () => {
    const ejemplo = contextoEjemplo({ moneda: 'MXN', idioma: 'es', origen: 'https://volkern.app' });
    expect(ejemplo.importe).toContain('2,400');
    expect(ejemplo.enlace_checkin).toContain('https://volkern.app/checkin');
    // Sin origen los enlaces quedan relativos: la vista previa los muestra como
    // texto en vez de inventar un dominio.
    expect(contextoEjemplo({}).enlace_checkin).toBe('/checkin/ejemplo?lang=es');
  });

  it('el editor y la pantalla leen el diseño del módulo, sin copias locales', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const editor = fs.readFileSync(path.resolve(__dirname, '../components/hospitality/EditorPlantillaEmail.tsx'), 'utf8');
    expect(editor).toContain("from '@/lib/hospitality/comunicaciones-email'");
    expect(editor).toContain('renderDisenoEmail');
    // La vista previa es el mismo compilador del envío, no un maquetado aparte.
    expect(editor).toContain('srcDoc={html}');

    const pagina = fs.readFileSync(path.resolve(__dirname, '../app/dashboard/hospitality/comunicaciones/page.tsx'), 'utf8');
    expect(pagina).toContain('<EditorPlantillaEmail');
    expect(pagina).toContain('disenoSugerido');
  });
});
