import { describe, it, expect } from 'vitest';
import { hideEmptyTitles } from '@/components/public/SurveyFormRenderer';

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
