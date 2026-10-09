/**
 * Test de integración del bloque «Video» (volkern-video) con GrapesJS real en Node.
 *
 * Sigue el patrón de los repros de GrapesJS en Node: jsdom + globals + secuencia
 * síncrona. Verifica: registro de bloque/type, detección por isComponent al
 * parsear HTML, normalización de URLs (YouTube/Vimeo/HeyGen → embed), roundtrip
 * de projectData, getHtml y deduplicación en el editor vivo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="gjs"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;

function setGlobal(key: string, value: unknown) {
  try {
    (globalThis as unknown as Record<string, unknown>)[key] = value;
  } catch {
    /* algunos globals son read-only en Node moderno */
  }
}

setGlobal('window', window);
setGlobal('document', window.document);
setGlobal('DOMParser', window.DOMParser);
setGlobal('XMLSerializer', window.XMLSerializer);
setGlobal('Node', window.Node);
setGlobal('Element', window.Element);
setGlobal('HTMLElement', window.HTMLElement);
setGlobal('SVGElement', window.SVGElement);
setGlobal('CSSStyleDeclaration', window.CSSStyleDeclaration);
setGlobal('HTMLIFrameElement', window.HTMLIFrameElement);
setGlobal('CustomEvent', window.CustomEvent);
setGlobal('MutationObserver', window.MutationObserver);
setGlobal('getComputedStyle', window.getComputedStyle.bind(window));
// codemirror, embebido en grapesjs, lee `navigator.userAgent` al cargar el
// módulo. Node 20 (el del CI) NO expone `navigator` como global — llegó en
// Node 21 —, así que el import reventaba con «ReferenceError: navigator is not
// defined» solo en CI: en local pasaba por correr sobre Node 22. Se toma el de
// jsdom para que el test no dependa de la versión de Node. En Node 21+ el
// global es de solo lectura: la asignación falla y se conserva el nativo.
setGlobal('navigator', window.navigator);
setGlobal(
  'requestAnimationFrame',
  window.requestAnimationFrame?.bind(window) ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16))
);

let grapesjs: any;
let createVideoEmbedBlock: any;
let dedupeEditorComponents: any;
let editor: any;

/** editor.getComponents() es una Collection de Backbone: la convertimos a array. */
const comps = (): any[] => {
  const arr: any[] = [];
  editor.getComponents().each((c: any) => arr.push(c));
  return arr;
};

const HEYGEN_ID = '899960a5e0004227bbcc93e7e6e22657';

beforeAll(async () => {
  grapesjs = (await import('grapesjs')).default;
  const block = await import('@/components/webcreator/blocks/components/VideoEmbedBlock');
  createVideoEmbedBlock = block.createVideoEmbedBlock;
  const dedupe = await import('@/components/webcreator/dedupe');
  dedupeEditorComponents = dedupe.dedupeEditorComponents;

  editor = grapesjs.init({
    container: '#gjs',
    height: '100%',
    width: '100%',
    storageManager: false,
    plugins: [],
  });
  createVideoEmbedBlock(editor);
});

afterAll(() => {
  try {
    editor?.destroy?.();
  } catch {
    /* noop */
  }
});

describe('bloque volkern-video con GrapesJS real', () => {
  it('registra el bloque y el type', () => {
    expect(editor.BlockManager.get('volkern-video')).toBeTruthy();
    expect(editor.DomComponents.getType('volkern-video')).toBeTruthy();
  });

  it('isComponent: al parsear HTML reclama iframes con la clase volkern-video-embed y normaliza HeyGen', () => {
    editor.setComponents(`<iframe class="volkern-video-embed" src="https://app.heygen.com/videos/${HEYGEN_ID}"></iframe>`);
    const comp = comps()[0];
    expect(comp.get('type')).toBe('volkern-video');
    expect(comp.get('tagName')).toBe('iframe');
    // Normalización aplicada en la carga (/videos → /embeds)
    expect(comp.get('attributes').src).toBe(`https://app.heygen.com/embeds/${HEYGEN_ID}`);
  });

  it('no reclama iframes sin la clase (caen al type nativo)', () => {
    editor.setComponents('<iframe src="https://example.com/embed"></iframe>');
    const comp = comps()[0];
    expect(comp.get('type')).not.toBe('volkern-video');
  });

  it('normaliza YouTube watch al cambiar el atributo src (simulación del trait)', () => {
    editor.setComponents('<iframe class="volkern-video-embed" src=""></iframe>');
    const comp = comps()[0];
    comp.addAttributes({ src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90' });
    expect(comp.get('attributes').src).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=90');
  });

  it('normaliza Vimeo y youtu.be', () => {
    editor.setComponents('<iframe class="volkern-video-embed" src="https://vimeo.com/123456789"></iframe>');
    expect(comps()[0].get('attributes').src).toBe('https://player.vimeo.com/video/123456789');

    editor.setComponents('<iframe class="volkern-video-embed" src="https://youtu.be/dQw4w9WgXcQ"></iframe>');
    expect(comps()[0].get('attributes').src).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('roundtrip getProjectData → loadProjectData estable (1 iframe, type y src conservados)', () => {
    editor.setComponents(`<iframe class="volkern-video-embed" src="https://app.heygen.com/videos/${HEYGEN_ID}"></iframe>`);
    const pd = editor.getProjectData();
    const compJson = (pd as any).pages[0].frames[0].component.components[0];
    expect(compJson.type).toBe('volkern-video');
    expect(compJson.attributes.src).toBe(`https://app.heygen.com/embeds/${HEYGEN_ID}`);

    editor.loadProjectData(pd);
    const pd2 = editor.getProjectData();
    const comps2 = (pd2 as any).pages[0].frames[0].component.components;
    expect(comps2.filter((c: any) => c.type === 'volkern-video')).toHaveLength(1);
    expect(comps2[0].attributes.src).toBe(`https://app.heygen.com/embeds/${HEYGEN_ID}`);
  });

  it('migra URLs crudas históricas al cargar projectData (normalización idempotente)', () => {
    editor.loadProjectData({
      pages: [
        {
          frames: [
            {
              component: {
                type: 'wrapper',
                components: [
                  {
                    type: 'volkern-video',
                    attributes: { class: 'volkern-video-embed', src: `https://app.heygen.com/videos/${HEYGEN_ID}` },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const comp = comps()[0];
    expect(comp.get('attributes').src).toBe(`https://app.heygen.com/embeds/${HEYGEN_ID}`);
  });

  it('getHtml renderiza el iframe embebido (sin custom-code)', () => {
    editor.setComponents(`<iframe class="volkern-video-embed" src="https://app.heygen.com/videos/${HEYGEN_ID}"></iframe>`);
    const html = editor.getHtml() as string;
    expect(html).toContain('<iframe');
    expect(html).toContain(`https://app.heygen.com/embeds/${HEYGEN_ID}`);
    expect(html).not.toContain('custom-code');
  });

  it('dedupeEditorComponents fusiona dos volkern-video idénticos en el editor vivo', () => {
    editor.setComponents(
      `<iframe class="volkern-video-embed" src="https://app.heygen.com/videos/${HEYGEN_ID}"></iframe>` +
        `<iframe class="volkern-video-embed" src="https://app.heygen.com/videos/${HEYGEN_ID}"></iframe>` +
        '<p>texto normal</p>'
    );
    expect(comps().length).toBe(3);
    const removed = dedupeEditorComponents(editor);
    expect(removed).toBe(1);
    expect(comps().length).toBe(2);
    expect(comps()[0].get('attributes').src).toBe(`https://app.heygen.com/embeds/${HEYGEN_ID}`);
  });

  it('dedupeEditorComponents fusiona custom-code idénticos (caso de producción) y conserva textos repetidos', () => {
    editor.setComponents('<div id="x"></div>');
    editor.addComponents([
      { type: 'custom-code', 'custom-code-plugin__code': '<div>widget</div>' },
      { type: 'custom-code', 'custom-code-plugin__code': '<div>widget</div>' },
      { type: 'textnode', content: '•' },
      { type: 'textnode', content: '•' },
    ]);
    const removed = dedupeEditorComponents(editor);
    expect(removed).toBe(1);
    const types = comps().map((c: any) => c.get('type'));
    expect(types.filter((t: string) => t === 'custom-code')).toHaveLength(1);
    expect(types.filter((t: string) => t === 'textnode')).toHaveLength(2);
  });

  it('dedupeEditorComponents conserva iframes con src distinto', () => {
    editor.setComponents(
      '<iframe class="volkern-video-embed" src="https://a.example/embed"></iframe>' +
        '<iframe class="volkern-video-embed" src="https://b.example/embed"></iframe>'
    );
    const removed = dedupeEditorComponents(editor);
    expect(removed).toBe(0);
    expect(comps().length).toBe(2);
  });
});
