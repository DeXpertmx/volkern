import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardia de integración: ningún handler GET de la API debe escribir en BD.
 *
 * Históricamente los GET acumularon efectos secundarios invisibles: reparaciones
 * (deals huérfanos), marcado de estado (check-first-message) y persistencia de
 * logs (forecast) que se ejecutaban en cada lectura. Las lecturas deben ser
 * puras: si un GET necesita escribir, esa lógica debe extraerse a un helper
 * idempotente y moverse a un POST/PATCH (o a un cron).
 *
 * Este test recorre todas las rutas de app/api, extrae el cuerpo de cada
 * handler GET (function o const) y falla si encuentra una llamada directa a
 * prisma.*.updateMany/create/upsert/delete/deleteMany/update dentro de él,
 * salvo que esté justificada en GET_WRITE_EXCEPTIONS.
 */

// ─── Excepciones justificadas (estado actual, tras la limpieza) ────────────
// Regla: cada entrada debe tener una razón clara. Si un día limpias la
// escritura, BORRA la excepción — el test fallará si queda obsoleta.
interface GetWriteException {
  /** Ruta relativa a nextjs_space, p. ej. 'app/api/canva/callback/route.ts'. */
  file: string;
  method: 'updateMany' | 'create' | 'upsert' | 'deleteMany' | 'delete' | 'update';
  reason: string;
}

const GET_WRITE_EXCEPTIONS: GetWriteException[] = [
  { file: 'app/api/admin/settings/route.ts', method: 'create', reason: 'get-or-create de PlatformSettings: crea la fila por defecto si no existe (idempotente).' },
  { file: 'app/api/admin/whatsapp-plataforma/qr/route.ts', method: 'update', reason: 'GET como acción: al refrescar el QR guarda el código y el estado connecting (panel Superadmin).' },
  { file: 'app/api/canva/authorize/route.ts', method: 'update', reason: 'Flujo OAuth: persiste el state de la autorización al iniciar el redirect.' },
  { file: 'app/api/canva/callback/route.ts', method: 'create', reason: 'Flujo OAuth callback: crea la integración de Canva al completar la autorización.' },
  { file: 'app/api/canva/callback/route.ts', method: 'update', reason: 'Flujo OAuth callback: guarda el access token devuelto por el proveedor.' },
  { file: 'app/api/canva/token/route.ts', method: 'update', reason: 'Flujo OAuth: refresca/guarda el token de Canva (GET del provider).' },
  { file: 'app/api/chatbot/config/route.ts', method: 'create', reason: 'get-or-create de la config por defecto del chatbot (idempotente).' },
  { file: 'app/api/cron/cleanup-attendance/route.ts', method: 'deleteMany', reason: 'Trigger de cron vía GET (patrón Vercel cron): limpia registros vencidos.' },
  { file: 'app/api/cron/google-calendar-renew/route.ts', method: 'update', reason: 'Trigger de cron vía GET: renueva los canales push de Google Calendar.' },
  { file: 'app/api/integraciones/google-calendar/callback/route.ts', method: 'upsert', reason: 'Flujo OAuth callback: guarda credenciales de Google Calendar.' },
  { file: 'app/api/integrations/gocardless/callback/route.ts', method: 'upsert', reason: 'Flujo OAuth callback: guarda credenciales de GoCardless.' },
  { file: 'app/api/leads/external-search/apollo/route.ts', method: 'update', reason: 'Test de conexión: refresca conectado/ultimaSincronizacion al verificar la integración.' },
  { file: 'app/api/leads/external-search/linkedin/route.ts', method: 'update', reason: 'Test de conexión: refresca conectado/ultimaSincronizacion al verificar la integración.' },
  { file: 'app/api/onboarding/route.ts', method: 'create', reason: 'get-or-create del progreso de onboarding (idempotente).' },
  { file: 'app/api/telegram/webhook/route.ts', method: 'update', reason: 'Webhook de Telegram (GET): actualiza el estado del bot al recibir updates.' },
];

const WRITE_METHODS = ['updateMany', 'create', 'upsert', 'deleteMany', 'delete', 'update'] as const;
type WriteMethod = (typeof WRITE_METHODS)[number];

// Prefijos de cliente de BD usados en app/api (prisma, tx en transacciones,
// db, globalPrisma, proxyPrisma). `p` se omite: demasiados falsos positivos.
const CLIENT_RE = /(?:prisma|globalPrisma|proxyPrisma|tx|db)\s*\.\s*[A-Za-z0-9_$]+\s*\.\s*(updateMany|create|upsert|deleteMany|delete|update)\s*\(/g;

function findApiDir(): string {
  const candidates = [
    join(process.cwd(), 'app', 'api'),
    join(process.cwd(), 'nextjs_space', 'app', 'api'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isDirectory()) return c;
    } catch {
      // intentar siguiente
    }
  }
  throw new Error('No se encontró el directorio app/api. Revisa el cwd del test.');
}

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry.endsWith('.ts') && full.includes('route.')) {
      out.push(full);
    }
  }
  return out;
}

function normalizePath(p: string): string {
  return p.replace(/^nextjs_space[\\/]/, '').replace(/\\/g, '/');
}

interface GetBody {
  body: string;
  line: number;
}

/** Extrae el cuerpo de cada handler GET (function o const) balanceando llaves. */
function extractGetBodies(src: string): GetBody[] {
  const bodies: GetBody[] = [];
  const re =
    /export\s+async\s+function\s+GET\s*\(|export\s+const\s+GET\s*=\s*async\s*\(|export\s+const\s+GET\s*=\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = re.lastIndex;
    const open = src.indexOf('{', start);
    if (open < 0) continue;
    let depth = 0;
    let i = open;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    bodies.push({
      body: src.slice(open, i + 1),
      line: src.slice(0, open).split('\n').length,
    });
  }
  return bodies;
}

interface DetectedWrite {
  file: string;
  line: number;
  method: WriteMethod;
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function collectGetWrites(): DetectedWrite[] {
  const apiDir = findApiDir();
  const found: DetectedWrite[] = [];
  for (const file of walkRouteFiles(apiDir)) {
    const content = readFileSync(file, 'utf8');
    for (const { body, line } of extractGetBodies(content)) {
      const lines = body.split('\n');
      lines.forEach((ln, idx) => {
        // Ignorar comentarios/docs: no son código ejecutable.
        if (isCommentLine(ln)) return;
        CLIENT_RE.lastIndex = 0;
        let w: RegExpExecArray | null;
        while ((w = CLIENT_RE.exec(ln)) !== null) {
          found.push({
            file: normalizePath(relative(process.cwd(), file)),
            line: line + idx,
            method: w[1] as WriteMethod,
          });
        }
      });
    }
  }
  return found;
}

const exceptionsKey = (e: GetWriteException) => `${e.file}::${e.method}`;

describe('Guardia: los GET de la API no escriben en BD', () => {
  it('ninguna ruta GET tiene escrituras directas de prisma sin excepción justificada', () => {
    const found = collectGetWrites();
    const allowed = new Set(GET_WRITE_EXCEPTIONS.map(exceptionsKey));

    const problemas = found
      .filter((w) => !allowed.has(`${w.file}::${w.method}`))
      .map((w) => `- ${w.file}:${w.line} → prisma.${w.method}(`);

    expect(problemas, [
      'Hay escrituras directas a la BD dentro de handlers GET. Las lecturas no deben',
      'tener efectos secundarios: una petición GET no debería mutar datos.',
      '',
      'Cómo arreglarlo:',
      '  1. Extrae la escritura a un helper idempotente (lib/...) y muévela a un',
      '     POST/PATCH explícito — como se hizo con deals (healOrphanDeals),',
      '     check-first-message (markFirstMessageSeen) o forecast (forecast-persistence).',
      '  2. Si la escritura ES intencional (OAuth callback, cron vía GET, get-or-create,',
      '     test de conexión), añade una entrada con razón en GET_WRITE_EXCEPTIONS.',
      '',
      ...problemas,
    ].join('\n')).toEqual([]);
  });

  it('la allowlist de excepciones no contiene entradas obsoletas', () => {
    const found = collectGetWrites();
    const active = new Set(found.map((w) => `${w.file}::${w.method}`));

    const obsoletas = GET_WRITE_EXCEPTIONS.filter((e) => !active.has(exceptionsKey(e)));

    expect(obsoletas, [
      'Hay excepciones en GET_WRITE_EXCEPTIONS que ya no aplican: el GET correspondiente',
      'ya no escribe en BD (probablemente lo limpiaste). Bórralas para mantener la',
      'allowlist exacta y que la guardia siga teniendo sentido.',
      '',
      ...obsoletas.map((e) => `- ${e.file} (${e.method}): ${e.reason}`),
    ].join('\n')).toEqual([]);
  });
});