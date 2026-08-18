import { describe, expect, it } from 'vitest';
import {
  cleanWebCreatorPrompt,
  sanitizeGeneratedText,
  unwrapWebCreatorProject,
  validateAndNormalizeWebCreatorProject,
} from '../lib/assistant/webcreator-validator';

describe('webcreator-validator', () => {
  it('quita HTML pegado después de Esto es lo que obtuve sin perder el brief', () => {
    const prompt = 'Diseña una landing para Aguascalientes.\n\nEsto es lo que obtuve:\n<body><div>HTML anterior enorme</div></body>';
    expect(cleanWebCreatorPrompt(prompt)).toBe('Diseña una landing para Aguascalientes.');
  });

  it('desenvuelve respuestas con projectData', () => {
    const project = { pages: [{ frames: [] }] };
    expect(unwrapWebCreatorProject({ projectData: project })).toEqual(project);
  });

  it('corrige claims de urgencia o autoridad no verificados', () => {
    const result = sanitizeGeneratedText(
      'Lanzamiento oficial. Plazas iniciales limitadas. Modelo con éxito. © 2024'
    );

    expect(result).toContain('próximo lanzamiento');
    expect(result).toContain('forma parte desde el inicio');
    expect(result).toContain('con experiencia');
    expect(result).toContain('© 2026');
    expect(result).not.toContain('oficial');
    expect(result).not.toContain('limitadas');
  });

  it('convierte un form HTML libre en el bloque CRM funcional', () => {
    const project = {
      pages: [{ frames: [{ component: { type: 'wrapper', components: [
        { tagName: 'section', components: [
          { tagName: 'h2', content: 'Quiero formar parte del lanzamiento' },
          { tagName: 'form', components: [
            { tagName: 'input', attributes: { type: 'email', placeholder: 'Email' } },
            { tagName: 'button', content: 'Enviar' },
          ] },
        ] },
      ] } }] }],
    };

    const result = validateAndNormalizeWebCreatorProject(project);
    const section = result.projectData.pages[0].frames[0].component.components[0];
    const form = section.components[1];

    expect(result.convertedForms).toBe(1);
    expect(form.type).toBe('volkern-form-advanced');
    expect(form.attributes['data-volkern-target']).toBe('leads');
    expect(form.attributes['data-btn-text']).toBe('QUIERO PRE-REGISTRARME');
  });

  it('sustituye etiquetas inventadas como space por div', () => {
    const result = validateAndNormalizeWebCreatorProject({
      tagName: 'space',
      components: [{ tagName: 'p', content: 'Contenido' }],
    });

    expect(result.projectData.tagName).toBe('div');
    expect(result.correctedTags).toBe(1);
  });

  it('conserva URLs y clases mientras limpia el texto visible', () => {
    const result = validateAndNormalizeWebCreatorProject({
      tagName: 'a',
      attributes: {
        href: '#registro',
        class: 'bg-indigo-600',
        title: 'Lanzamiento oficial',
      },
      content: 'Plazas iniciales limitadas',
    });

    expect(result.projectData.attributes.href).toBe('#registro');
    expect(result.projectData.attributes.class).toBe('bg-indigo-600');
    expect(result.projectData.attributes.title).toBe('próximo lanzamiento');
    expect(result.projectData.content).toBe('forma parte desde el inicio');
  });

  it('no convierte un bloque CRM ya registrado', () => {
    const result = validateAndNormalizeWebCreatorProject({
      type: 'volkern-form-advanced',
      attributes: { 'data-form-title': 'Pre-registro' },
    });

    expect(result.convertedForms).toBe(0);
    expect(result.projectData.type).toBe('volkern-form-advanced');
  });
});
