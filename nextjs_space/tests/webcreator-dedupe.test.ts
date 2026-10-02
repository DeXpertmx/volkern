import { describe, it, expect } from 'vitest';
import {
  dedupeProjectData,
  componentSignature,
  isDedupeCandidate,
  stableStringify,
} from '@/components/webcreator/dedupe';

// ─── stableStringify ───────────────────────────────────────────────────────

describe('stableStringify', () => {
  it('es independiente del orden de claves', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('mantiene el orden de arrays', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('maneja null/undefined/primitivos', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(undefined)).toBe('undefined');
    expect(stableStringify('x')).toBe('"x"');
    expect(stableStringify(5)).toBe('5');
  });
});

// ─── componentSignature / isDedupeCandidate ───────────────────────────────

describe('componentSignature', () => {
  it('ignora ids auto-generados (top-level y en atributos)', () => {
    const a = { type: 'volkern-video', attributes: { id: 'aaa', class: 'volkern-video-embed', src: 'https://x' } };
    const b = { type: 'volkern-video', attributes: { id: 'bbb', class: 'volkern-video-embed', src: 'https://x' } };
    expect(componentSignature(a)).toBe(componentSignature(b));
  });

  it('distingue por atributos distintos', () => {
    const a = { type: 'volkern-video', attributes: { class: 'volkern-video-embed', src: 'https://x' } };
    const b = { type: 'volkern-video', attributes: { class: 'volkern-video-embed', src: 'https://y' } };
    expect(componentSignature(a)).not.toBe(componentSignature(b));
  });

  it('distingue por hijos distintos', () => {
    const a = { type: 'default', components: [{ type: 'textnode', content: 'hola' }] };
    const b = { type: 'default', components: [{ type: 'textnode', content: 'adios' }] };
    expect(componentSignature(a)).not.toBe(componentSignature(b));
  });

  it('incluye props de modelo (custom-code-plugin__code)', () => {
    const a = { type: 'custom-code', 'custom-code-plugin__code': '<div>x</div>' };
    const b = { type: 'custom-code', 'custom-code-plugin__code': '<div>y</div>' };
    expect(componentSignature(a)).not.toBe(componentSignature(b));
  });
});

describe('isDedupeCandidate', () => {
  it('custom-code por type → candidato', () => {
    expect(isDedupeCandidate({ type: 'custom-code' })).toBe(true);
  });

  it('custom-code por prop custom-code-plugin__code → candidato', () => {
    expect(isDedupeCandidate({ type: 'default', 'custom-code-plugin__code': '<div/>' })).toBe(true);
  });

  it('iframe/video → candidato', () => {
    expect(isDedupeCandidate({ type: 'volkern-video', tagName: 'iframe' })).toBe(true);
    expect(isDedupeCandidate({ type: 'video' })).toBe(true);
    expect(isDedupeCandidate({ tagName: 'iframe' })).toBe(true);
  });

  it('textnode / texto hoja → NO candidato', () => {
    expect(isDedupeCandidate({ type: 'textnode', content: '•' })).toBe(false);
    expect(isDedupeCandidate({ type: 'text', components: [{ type: 'textnode', content: 'hola' }] })).toBe(false);
  });

  it('imagen hoja idéntica → NO candidato (galerías legítimas)', () => {
    expect(isDedupeCandidate({ type: 'image', attributes: { src: 'https://x.png' } })).toBe(false);
  });

  it('espaciador hoja con 1 atributo → NO candidato', () => {
    expect(isDedupeCandidate({ type: 'default', attributes: { class: 'spacer' } })).toBe(false);
  });

  it('subárbol ligero (1 elemento con atributos, p.ej. campo de firma) → NO candidato', () => {
    const signer = {
      type: 'default',
      attributes: { class: 'v-signer-field' },
      components: [{ type: 'textnode', content: 'Firma: ______' }],
    };
    expect(isDedupeCandidate(signer)).toBe(false);
  });

  it('subárbol estructural no trivial (≥2 elementos con atributos) → candidato', () => {
    const block = {
      type: 'default',
      attributes: { class: 'volkern-services-section' },
      components: [
        { type: 'default', attributes: { class: 'volkern-services-grid' }, components: [] },
        { type: 'textnode', content: 'Servicios' },
      ],
    };
    expect(isDedupeCandidate(block)).toBe(true);
  });

  it('wrapper vacío → NO candidato', () => {
    expect(isDedupeCandidate({ type: 'default', components: [] })).toBe(false);
  });
});

// ─── dedupeProjectData ────────────────────────────────────────────────────

describe('dedupeProjectData', () => {
  const iframePair = {
    pages: [
      {
        frames: [
          {
            component: {
              type: 'wrapper',
              components: [
                {
                  type: 'volkern-video',
                  attributes: { id: 'i1', class: 'volkern-video-embed', src: 'https://app.heygen.com/embeds/abc' },
                  components: [],
                },
                {
                  type: 'volkern-video',
                  attributes: { id: 'i2', class: 'volkern-video-embed', src: 'https://app.heygen.com/embeds/abc' },
                  components: [],
                },
                { type: 'textnode', content: 'texto' },
              ],
            },
          },
        ],
      },
    ],
  };

  it('elimina hermanos custom-code idénticos (caso de producción)', () => {
    const data = {
      pages: [
        {
          frames: [
            {
              component: {
                type: 'wrapper',
                components: [
                  { type: 'custom-code', 'custom-code-plugin__code': '<iframe src="https://heygen/x"></iframe>' },
                  { type: 'custom-code', 'custom-code-plugin__code': '<iframe src="https://heygen/x"></iframe>' },
                ],
              },
            },
          ],
        },
      ],
    };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(1);
    const comps = (projectData as any).pages[0].frames[0].component.components;
    expect(comps).toHaveLength(1);
  });

  it('conserva custom-code con códigos distintos', () => {
    const data = {
      component: {
        type: 'wrapper',
        components: [
          { type: 'custom-code', 'custom-code-plugin__code': '<div>a</div>' },
          { type: 'custom-code', 'custom-code-plugin__code': '<div>b</div>' },
        ],
      },
    };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(0);
    expect((projectData as any).component.components).toHaveLength(2);
  });

  it('elimina iframes idénticos (doble pegado de embed) conservando el primero', () => {
    const { projectData, removed } = dedupeProjectData(iframePair);
    expect(removed).toBe(1);
    const comps = (projectData as any).pages[0].frames[0].component.components;
    expect(comps).toHaveLength(2);
    expect(comps[0].attributes.id).toBe('i1'); // conserva la primera ocurrencia
    expect(comps[1].type).toBe('textnode');
  });

  it('no elimina textnodes/textos/espaciadores idénticos (repeticiones legítimas)', () => {
    const data = {
      component: {
        type: 'wrapper',
        components: [
          { type: 'textnode', content: '•' },
          { type: 'textnode', content: '•' },
          { type: 'default', attributes: { class: 'spacer' } },
          { type: 'default', attributes: { class: 'spacer' } },
          { type: 'image', attributes: { src: 'https://x.png' } },
          { type: 'image', attributes: { src: 'https://x.png' } },
        ],
      },
    };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(0);
    expect((projectData as any).component.components).toHaveLength(6);
  });

  it('no elimina subárboles ligeros idénticos (campos de firma de documentos)', () => {
    const signer = () => ({
      type: 'default',
      attributes: { class: 'v-signer-field' },
      components: [{ type: 'textnode', content: 'Firma: ______' }],
    });
    const data = { component: { type: 'wrapper', components: [signer(), signer()] } };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(0);
    expect((projectData as any).component.components).toHaveLength(2);
  });

  it('elimina bloques estructurales completos duplicados (doble drop)', () => {
    const makeBlock = (id: string) => ({
      type: 'default',
      attributes: { id, class: 'volkern-services-section' },
      components: [
        { type: 'default', attributes: { class: 'volkern-services-grid' }, components: [] },
        { type: 'textnode', content: 'Servicios' },
      ],
    });
    const data = { component: { type: 'wrapper', components: [makeBlock('a'), makeBlock('b')] } };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(1);
    expect((projectData as any).component.components).toHaveLength(1);
  });

  it('no elimina bloques casi idénticos (contenido distinto)', () => {
    const makeBlock = (id: string, title: string) => ({
      type: 'default',
      attributes: { id, class: 'volkern-services-section' },
      components: [
        { type: 'default', attributes: { class: 'volkern-services-grid' }, components: [] },
        { type: 'textnode', content: title },
      ],
    });
    const data = {
      component: { type: 'wrapper', components: [makeBlock('a', 'Servicios'), makeBlock('b', 'Otros')] },
    };
    const { removed } = dedupeProjectData(data);
    expect(removed).toBe(0);
  });

  it('deduplica wrappers hermanos byte-idénticos que contienen el mismo embed (ids solo difieren en id)', () => {
    const iframe = (id: string) => ({
      type: 'volkern-video',
      attributes: { id, class: 'volkern-video-embed', src: 'https://x' },
      components: [],
    });
    const data = {
      component: {
        type: 'wrapper',
        components: [
          { type: 'default', attributes: { class: 'row' }, components: [iframe('a')] },
          { type: 'default', attributes: { class: 'row' }, components: [iframe('b')] },
        ],
      },
    };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(1);
    expect((projectData as any).component.components).toHaveLength(1);
  });

  it('protege layouts de columnas vacías repetidas (sin texto ni src/href)', () => {
    const col = (id: string) => ({
      type: 'default',
      attributes: { id, class: 'col' },
      components: [{ type: 'default', attributes: { class: 'inner' }, components: [] }],
    });
    const data = { component: { type: 'wrapper', components: [col('1'), col('2'), col('3')] } };
    const { removed } = dedupeProjectData(data);
    expect(removed).toBe(0);
    expect(data.component.components).toHaveLength(3);
  });

  it('deduplica a profundidad (nietos)', () => {
    const dupIframe = () => ({
      type: 'volkern-video',
      attributes: { class: 'volkern-video-embed', src: 'https://x' },
      components: [],
    });
    const data = {
      component: {
        type: 'wrapper',
        components: [
          {
            type: 'default',
            attributes: { class: 'row' },
            components: [dupIframe(), dupIframe(), dupIframe()],
          },
        ],
      },
    };
    const { removed } = dedupeProjectData(data);
    expect(removed).toBe(2);
  });

  it('es idempotente', () => {
    const first = dedupeProjectData(iframePair);
    const second = dedupeProjectData(first.projectData);
    expect(second.removed).toBe(0);
  });

  it('no muta la entrada', () => {
    const snapshot = JSON.parse(JSON.stringify(iframePair));
    dedupeProjectData(iframePair);
    expect(iframePair).toEqual(snapshot);
  });

  it('formato legacy con components en raíz', () => {
    const data = {
      components: [
        { type: 'custom-code', 'custom-code-plugin__code': '<div/>' },
        { type: 'custom-code', 'custom-code-plugin__code': '<div/>' },
      ],
    };
    const { removed, projectData } = dedupeProjectData(data);
    expect(removed).toBe(1);
    expect((projectData as any).components).toHaveLength(1);
  });

  it('entrada vacía/null → sin cambios', () => {
    expect(dedupeProjectData(null).removed).toBe(0);
    expect(dedupeProjectData(undefined).removed).toBe(0);
    expect(dedupeProjectData({}).removed).toBe(0);
  });
});
