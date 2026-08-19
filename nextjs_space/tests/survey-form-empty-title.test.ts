import { describe, it, expect } from 'vitest';
import { DEFAULT_THANK_YOU, buildThankYouHtml, getThankYouRedirectUrl, normalizeSurveyJson, hideEmptyTitles } from '@/components/public/SurveyFormRenderer';

describe('hideEmptyTitles — etiqueta vacía no muestra el nombre interno del campo', () => {
  it('oculta el título de campos con title vacío (solo placeholder visible)', () => {
    const json = {
      title: 'Formulario',
      pages: [
        {
          name: 'page1',
          elements: [
            { type: 'text', name: 'nombre', title: '', placeholder: 'Tu nombre', isRequired: true },
            { type: 'text', name: 'email', title: 'Email', placeholder: 'tu@email.com' },
            { type: 'comment', name: 'notas', title: undefined, placeholder: 'Cuéntanos más' },
          ],
        },
      ],
    };

    const result = hideEmptyTitles(json as any);
    const elements = result.pages[0].elements;

    // Campo con title vacío → título oculto, name nunca visible
    expect(elements[0].titleLocation).toBe('hidden');
    expect(elements[0].hideNumber).toBe(true);

    // Campo con title definido → NO se toca
    expect(elements[1].titleLocation).toBeUndefined();
    expect(elements[1].hideNumber).toBeUndefined();

    // Campo con title undefined → también se oculta
    expect(elements[2].titleLocation).toBe('hidden');
    expect(elements[2].hideNumber).toBe(true);
  });

  it('no muta el JSON original del usuario', () => {
    const json = {
      pages: [{ elements: [{ type: 'text', name: 'nombre', title: '' }] }],
    };
    const result = hideEmptyTitles(json as any);
    expect(result.pages[0].elements[0].titleLocation).toBe('hidden');
    // Original intacto
    expect((json as any).pages[0].elements[0].titleLocation).toBeUndefined();
  });

  it('respeta títulos con solo espacios como vacíos', () => {
    const json = {
      pages: [{ elements: [{ type: 'text', name: 'campo', title: '   ' }] }],
    };
    const result = hideEmptyTitles(json as any);
    expect(result.pages[0].elements[0].titleLocation).toBe('hidden');
  });

  it('funciona con páginas anidadas y sin pages (formato plano)', () => {
    const conPages = hideEmptyTitles({
      pages: [{ name: 'p1', elements: [{ type: 'text', name: 'a', title: '' }] }],
    } as any);
    expect(conPages.pages[0].elements[0].titleLocation).toBe('hidden');

    const planoSinPages = hideEmptyTitles({
      elements: [{ type: 'text', name: 'a', title: '' }],
    } as any);
    // Formato plano: se trata como única página
    expect(planoSinPages.elements[0].titleLocation).toBe('hidden');
  });
});

describe('normalizeSurveyJson — booleanos Sí/No en español', () => {
  it('convierte los booleanos sin personalizar a Sí/No', () => {
    const result = normalizeSurveyJson({
      pages: [{ elements: [{ type: 'boolean', name: 'acepto' }] }],
    } as any);
    const el = result.pages[0].elements[0];
    expect(el.labelTrue).toBe('Sí');
    expect(el.labelFalse).toBe('No');
  });

  it('respeta labels personalizados del autor', () => {
    const result = normalizeSurveyJson({
      pages: [{ elements: [{ type: 'boolean', name: 'news', labelTrue: 'Yes', labelFalse: 'No' }] }],
    } as any);
    const el = result.pages[0].elements[0];
    expect(el.labelTrue).toBe('Yes');
    expect(el.labelFalse).toBe('No');
  });

  it('no toca campos que no son booleanos', () => {
    const result = normalizeSurveyJson({
      pages: [{ elements: [{ type: 'text', name: 'nombre' }] }],
    } as any);
    expect(result.pages[0].elements[0].labelTrue).toBeUndefined();
  });
});

describe('normalizeSurveyJson — página de agradecimiento', () => {
  it('aplica una página general cuando no existe configuración', () => {
    const result = normalizeSurveyJson({ pages: [{ elements: [] }] } as any);
    expect(result.completedHtml).toContain(DEFAULT_THANK_YOU.title);
    expect(result.completedHtml).toContain(DEFAULT_THANK_YOU.message);
  });

  it('usa la configuración personalizada del formulario', () => {
    const result = normalizeSurveyJson({
      thankYou: {
        title: 'Solicitud recibida',
        message: 'Te escribiremos mañana.',
        buttonText: 'Volver',
        buttonUrl: '/inicio',
      },
    } as any);
    expect(result.completedHtml).toContain('Solicitud recibida');
    expect(result.completedHtml).toContain('Te escribiremos mañana.');
    expect(result.completedHtml).toContain('href="/inicio"');
    expect(result.completedHtml).toContain('>Volver</a>');
  });

  it('no permite URLs peligrosas ni HTML sin escapar en la página', () => {
    const html = buildThankYouHtml({
      title: '<script>alert(1)</script>',
      message: 'Texto <b>seguro</b>',
      buttonText: 'Ir',
      buttonUrl: 'javascript:alert(1)',
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Texto &lt;b&gt;seguro&lt;/b&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('>Ir</a>');
  });

  it('respeta un completedHtml explícito definido por JSON', () => {
    const result = normalizeSurveyJson({ completedHtml: '<p>Personalizado</p>' } as any);
    expect(result.completedHtml).toBe('<p>Personalizado</p>');
  });

  it('acepta redirecciones externas http/https', () => {
    expect(getThankYouRedirectUrl({ redirectUrl: 'https://ejemplo.com/gracias' })).toBe('https://ejemplo.com/gracias');
    expect(getThankYouRedirectUrl({ redirectUrl: 'http://ejemplo.com' })).toBe('http://ejemplo.com');
  });

  it('rechaza javascript, URLs relativas y valores inválidos para redirección automática', () => {
    expect(getThankYouRedirectUrl({ redirectUrl: 'javascript:alert(1)' })).toBe('');
    expect(getThankYouRedirectUrl({ redirectUrl: '/gracias' })).toBe('');
    expect(getThankYouRedirectUrl({ redirectUrl: 'no-es-url' })).toBe('');
  });
});

describe('normalizeSurveyJson — texto del botón de envío', () => {
  it('elimina completeText vacío para que use el default en español', () => {
    const result = normalizeSurveyJson({ completeText: '   ' } as any);
    expect(result.completeText).toBeUndefined();
  });

  it('conserva completeText personalizado', () => {
    const result = normalizeSurveyJson({ completeText: 'Enviar solicitud' } as any);
    expect(result.completeText).toBe('Enviar solicitud');
  });
});
