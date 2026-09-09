import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardia de integración para Webhooks Salientes (OutgoingWebhook).
 *
 * Análoga a la guardia de scopes de API keys:
 *
 *  - Scopes:  un endpoint exige un scope que NO está en AVAILABLE_SCOPES → ninguna
 *             API key puede concederlo → la integración por API queda rota en silencio.
 *  - Eventos: el motor dispara `dispatchWebhook(tenantId, 'evento', ...)` con un
 *             evento que NO está en getAvailableEvents() (catálogo documentado con
 *             el que la UI construye los checkboxes de suscripción) → ningún
 *             OutgoingWebhook puede suscribirse a ese evento desde el panel → la
 *             integración saliente queda rota en silencio.
 *
 * Este test recorre el código, recoge los eventos literalmente disparados y falla
 * si alguno no está en el catálogo. Además verifica que el catálogo documentado y
 * el union type `WebhookEvent` (el contrato del motor) nunca diverjan.
 */

// ── Utilidades de archivo (mismo estilo que api-key-scopes.test.ts) ──────────

const EVENT_LITERAL_RE = /'([a-z_]+)'/g;
const EVENT_FORMAT_RE = /^[a-z][a-z0-9_]*$/;

function findRepoFile(rel: string): string {
  const candidates = [
    join(process.cwd(), rel),
    join(process.cwd(), 'nextjs_space', rel),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // intentar siguiente
    }
  }
  throw new Error(`No se encontró ${rel}. Revisa el cwd del test.`);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Lee el módulo puro que define el catálogo y el union type (única fuente). */
function readWebhookEventsModule(): string {
  return readFileSync(findRepoFile('lib/webhook-events.ts'), 'utf8');
}

/** Extrae los eventos del union type `WebhookEvent` (el contrato del motor). */
function parseTypeEvents(src: string): string[] {
  const blockStart = src.indexOf('export type WebhookEvent =');
  expect(blockStart, 'No se encontró `export type WebhookEvent =` en lib/webhook-events.ts').toBeGreaterThan(-1);
  const blockEnd = src.indexOf(';', blockStart);
  const block = src.slice(blockStart, blockEnd);
  const events: string[] = [];
  EVENT_LITERAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EVENT_LITERAL_RE.exec(block)) !== null) {
    events.push(m[1]);
  }
  expect(events.length, 'El union type WebhookEvent no tiene eventos').toBeGreaterThan(0);
  return events;
}

/** Extrae los `value: '...'` del catálogo documentado getAvailableEvents(). */
function parseCatalogEvents(src: string): string[] {
  const fnStart = src.indexOf('export function getAvailableEvents');
  expect(fnStart, 'No se encontró `export function getAvailableEvents`').toBeGreaterThan(-1);
  const body = src.slice(fnStart);
  const events: string[] = [];
  const valueRe = /value:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = valueRe.exec(body)) !== null) {
    events.push(m[1]);
  }
  expect(events.length, 'getAvailableEvents() no devuelve ningún value documentado').toBeGreaterThan(0);
  return events;
}

/** Devuelve raíces de código (app/lib/scripts/cron) válidas para recorrer. */
function findCodeRoots(): string[] {
  const roots: string[] = [];
  const candidates = [process.cwd(), join(process.cwd(), 'nextjs_space')];
  for (const base of candidates) {
    for (const r of ['app', 'lib', 'scripts', 'cron']) {
      try {
        const p = join(base, r);
        if (statSync(p).isDirectory()) roots.push(p);
      } catch {
        // ignorar
      }
    }
  }
  return roots;
}

/** Devuelve eventos usados como 2º argumento literal de `dispatchWebhook(`. */
function collectDispatchedEventLiterals(): Map<string, string[]> {
  const hits = new Map<string, string[]>();

  // `dispatchWebhook(\n  tenantId,\n  'evento_literal',` (multilínea o inline)
  const callRe = /dispatchWebhook\s*\(\s*[^,()]+?,\s*'([a-z_]+)'/g;

  for (const root of findCodeRoots()) {
    for (const file of walkFiles(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes('node_modules') || rel.includes('.test.')) continue;
      const content = readFileSync(file, 'utf8');
      callRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(content)) !== null) {
        if (!hits.has(m[1])) hits.set(m[1], []);
        hits.get(m[1])!.push(rel);
      }
    }
  }
  return hits;
}

/**
 * Devuelve los eventos de arrays literales `eventos: [...]` que se usan para
 * registrar/suscribir un OutgoingWebhook en código (seeds, fixtures, scripts).
 * Evita falsos positivos exigiendo que el archivo mencione outgoingWebhook.
 */
function collectRegisteredWebhookEventLiterals(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  const eventosRe = /eventos\s*:\s*\[([^\]]*)\]/g;

  for (const root of findCodeRoots()) {
    for (const file of walkFiles(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes('node_modules') || rel.includes('.test.')) continue;
      const content = readFileSync(file, 'utf8');
      if (!content.includes('outgoingWebhook')) continue;
      eventosRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = eventosRe.exec(content)) !== null) {
        EVENT_LITERAL_RE.lastIndex = 0;
        let em: RegExpExecArray | null;
        while ((em = EVENT_LITERAL_RE.exec(m[1])) !== null) {
          if (!EVENT_FORMAT_RE.test(em[1])) continue;
          if (!hits.has(em[1])) hits.set(em[1], []);
          hits.get(em[1])!.push(rel);
        }
      }
    }
  }
  return hits;
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Guardia de eventos de Webhooks Salientes', () => {
  const src = readWebhookEventsModule();
  const typeEvents = parseTypeEvents(src);
  const catalogEvents = parseCatalogEvents(src);
  const dispatched = collectDispatchedEventLiterals();
  const registered = collectRegisteredWebhookEventLiterals();

  it('todo evento disparado por dispatchWebhook existe en el catálogo documentado getAvailableEvents()', () => {
    const catalog = new Set<string>(catalogEvents);
    const problemas: string[] = [];
    for (const [evento, archivos] of dispatched) {
      if (catalog.has(evento)) continue;
      const ejemplos = archivos.slice(0, 3).join(', ');
      problemas.push(`- '${evento}' disparado en ${ejemplos}`);
    }
    expect(problemas, [
      'Hay eventos disparados por dispatchWebhook() que NO están en getAvailableEvents() (lib/outgoing-webhooks.ts).',
      'Resultado: la UI de Webhooks Salientes (construida con getAvailableEvents()) no permite suscribirse a ese',
      'evento, por lo que ningún OutgoingWebhook lo recibirá nunca: integración rota en silencio.',
      'Solución: añade el evento al catálogo getAvailableEvents() con su value/label/description.',
      '',
      ...problemas,
    ].join('\n')).toEqual([]);
  });

  it('todo webhook saliente registrado con eventos literales en código usa solo eventos del catálogo', () => {
    const catalog = new Set<string>(catalogEvents);
    const problemas: string[] = [];
    for (const [evento, archivos] of registered) {
      if (catalog.has(evento)) continue;
      const ejemplos = archivos.slice(0, 3).join(', ');
      problemas.push(`- '${evento}' registrado en ${ejemplos}`);
    }
    expect(problemas, [
      'Hay arrays `eventos: [...]` que registran un OutgoingWebhook en código con eventos fuera del catálogo.',
      'Resultado: esos webhooks se suscribirían a eventos que la UI ni siquiera documenta.',
      'Solución: usa solo values de getAvailableEvents() (lib/outgoing-webhooks.ts).',
      '',
      ...problemas,
    ].join('\n')).toEqual([]);
  });

  it('el catálogo documentado coincide EXACTAMENTE con el union type WebhookEvent', () => {
    const typeSet = new Set(typeEvents);
    const catalogSet = new Set(catalogEvents);

    const noDocumentados = typeEvents.filter((e) => !catalogSet.has(e));
    const noSoportados = catalogEvents.filter((e) => !typeSet.has(e));

    expect(noDocumentados, [
      'Eventos del union type WebhookEvent que NO están en getAvailableEvents():',
      'la UI no puede suscribirlos → nunca se entregarán.',
      ...noDocumentados.map((e) => `- '${e}'`),
    ].join('\n')).toEqual([]);

    expect(noSoportados, [
      'Eventos de getAvailableEvents() que NO están en el union type WebhookEvent:',
      'el motor (dispatchWebhook) no los acepta → el tenant cree que está suscrito pero nunca se disparará.',
      ...noSoportados.map((e) => `- '${e}'`),
    ].join('\n')).toEqual([]);
  });

  it('el catálogo no tiene duplicados y todos los eventos tienen formato válido (snake_case)', () => {
    expect(new Set(catalogEvents).size).toBe(catalogEvents.length);
    for (const evento of catalogEvents) {
      expect(evento, `Evento inválido en getAvailableEvents(): ${evento}`).toMatch(EVENT_FORMAT_RE);
    }
  });

  it('el union type WebhookEvent no tiene duplicados', () => {
    expect(new Set(typeEvents).size).toBe(typeEvents.length);
  });
});
