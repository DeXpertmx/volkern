/**
 * PRISMA MODEL GUARD — shared helper.
 *
 * Two public functions:
 *
 * 1) `detectPrismaTypos(sourceCode, schemaCode)` — pure. Returns all
 *    `prisma.<name>` references in the script source that don't match
 *    any schema-derived camelCase model, each with the closest
 *    Levenshtein ≤ 2 suggestion. $-prefixed methods are filtered out.
 *    Used by `scripts/audit-prisma-typos.ts` to walk the full scripts/
 *    directory offline (no Prisma client required).
 *
 * 2) `assertNoPrismaTypos(scriptPath, prisma, schemaPath?)` — runtime.
 *    Reads `scriptPath` (defaults `process.argv[1]`) and `schemaPath`
 *    (defaults `<cwd>/prisma/schema.prisma`). If `prisma` is provided,
 *    cross-validates each ref against the live client (handles cases
 *    where schema lags or ad-hoc extensions expose extra models not
 *    seen in schema.prisma). Logs diagnostics and throws on a real
 *    typo with a Levenshtein "did you mean" suggestion.
 *    Used by smoke pre-scripts to fail-fast before any flow that
 *    would silently drop writes (Prisma drops unknown `where`/`select`
 *    field names).
 *
 * Detection algorithm: extracts `prisma\.([A-Za-z_$]\w*)` regex,
 * filters $$-prefixed, parses `^\s*model\s+([A-Z]\w*)` for the schema,
 * PascalCase→camelCase via `s.charAt(0).toLowerCase() + s.slice(1)`,
 * Levenshtein distance ≤ 2 for "did you mean" suggestions.
 */

export interface PrismaTypo {
  ref: string;
  suggestion: string | null;
  dist: number;
}

function pascalToCamel(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/**
 * Pure: extract all `prisma.X` references from `sourceCode`, cross-check
 * against schema-derived camelCase names, return Levenshtein-closest
 * suggestion for each missing ref (dist ≤ 2).
 */
export function detectPrismaTypos(
  sourceCode: string,
  schemaCode: string,
): PrismaTypo[] {
  // Strip /* */ + // line comments before regex so docstrings mentioning
  // `prisma.adCampaigns` as example typos aren't detected as false positives.
  const cleaned = sourceCode
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const usedIds = new Set<string>();
  const refRe = /prisma\.([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let mm: RegExpExecArray | null;
  while ((mm = refRe.exec(cleaned))) {
    if (!mm[1].startsWith('$')) usedIds.add(mm[1]);
  }

  // Capture both PascalCase-starting models (e.g. `model User`) AND
  // snake_case schema names that start with lowercase (e.g.
  // `model erp_customer_users`, `model agent_skill_logs`). The codebase
  // mixes conventions: PascalCase models are accessed in code as their
  // camelCase equivalent (`prisma.user`), while snake_case models are
  // accessed verbatim (`prisma.erp_customer_users`). Both forms are
  // accepted on the client, so the audit must accept both.
  const schemaModels = [
    ...schemaCode.matchAll(/^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)/gm),
  ].map((m) => m[1]);
  const validNames = new Set<string>([
    // PascalCase sources → camelCase for client access.
    ...schemaModels.filter((n) => /^[A-Z]/.test(n)).map(pascalToCamel),
    // snake_case sources kept verbatim (pascalToCamel is identity for them).
    ...schemaModels,
  ]);

  const missing: PrismaTypo[] = [];
  for (const ref of usedIds) {
    if (validNames.has(ref)) continue;

    let best: { name: string; dist: number } | null = null;
    for (const cand of validNames) {
      const d = levenshtein(ref, cand);
      if (d <= 2 && (!best || d < best.dist)) {
        best = { name: cand, dist: d };
      }
    }
    missing.push({ ref, suggestion: best?.name ?? null, dist: best?.dist ?? -1 });
  }
  return missing;
}

export interface AssertOptions {
  /** When true (default), throws on typical ref → returns list silently. */
  throwOnMissing?: boolean;
  /** Override schema path; defaults `<cwd>/prisma/schema.prisma`. */
  schemaPath?: string;
  /** Override script path; defaults `process.argv[1]`. */
  scriptPath?: string;
  /** Suppress the OK log line on success. */
  silent?: boolean;
}

/**
 * Runtime guard for smoke pre-scripts. Wrap in `step('0. PRISMA MODEL GUARD')`
 * at the start of `main()`. On success: logs `OK` and returns. On real typo:
 * throws `PRISMA MODEL GUARD FAILED: …` so the smoke exits non-zero.
 */
export async function assertNoPrismaTypos(
  prisma: any,
  opts: AssertOptions = {},
): Promise<PrismaTypo[]> {
  const scriptPath =
    opts.scriptPath ?? process.argv[1] ?? '';
  const schemaPath =
    opts.schemaPath ?? process.cwd() + '/prisma/schema.prisma';
  const throwOnMissing = opts.throwOnMissing ?? true;

  const fs = await import('fs');
  const path = await import('path');

  if (!scriptPath || !fs.existsSync(scriptPath)) {
    console.warn('[prisma-model-guard] scriptPath missing; guard skipped');
    return [];
  }
  if (!fs.existsSync(schemaPath)) {
    console.warn(`[prisma-model-guard] schemaPath missing (${schemaPath}); guard skipped`);
    return [];
  }

  const sourceCode = fs.readFileSync(scriptPath, 'utf-8');
  const schemaCode = fs.readFileSync(schemaPath, 'utf-8');

  const staticTypos = detectPrismaTypos(sourceCode, schemaCode);

  // Cross-validate against live client — schema.prisma may not list ad-hoc
  // models exposed via client extensions / DMMF transformations. A ref the
  // schema doesn't know about but the live client exposes is NOT a typo.
  // NOTE: PrismaClient is a Proxy; Object.getOwnPropertyNames on it returns
  // an empty array in modern Node, so liveKeys may stay empty. We still
  // keep this check for non-proxied clients (e.g. test stubs).
  const liveKeys = new Set<string>();
  for (const k of Object.getOwnPropertyNames(prisma ?? {})) liveKeys.add(k);
  const filteredTypos = staticTypos.filter((t) => !liveKeys.has(t.ref));

  if (!opts.silent) {
    const usedCount = (sourceCode.match(/prisma\.([A-Za-z_$][A-Za-z0-9_$]*)/g) || []).filter(
      (s) => !s.includes('$.'),
    ).length;
    console.log(
      `[prisma-model-guard] ${usedCount} prisma.<model> refs (schema has ${schemaCode.match(/^\s*model\s+[A-Z]/gm)?.length ?? 0} models, live client exposes ${liveKeys.size} keys)`,
    );
  }

  if (filteredTypos.length === 0) {
    if (!opts.silent) {
      console.log('[prisma-model-guard] OK — all referenced prisma.<model> names exist');
    }
    return [];
  }

  if (throwOnMissing) {
    const lines = filteredTypos.map(
      ({ ref, suggestion, dist }) =>
        suggestion
          ? dist === 1 && ref.endsWith('s') && !suggestion.endsWith('s')
            ? `  - Model ${ref} no existe; probablemente quisiste decir ${suggestion} (check trailing 's' for plural/singular mismatch)`
            : `  - Model ${ref} no existe; probablemente quisiste decir ${suggestion}`
          : `  - Model ${ref} no existe en el cliente Prisma (verify prisma/schema.prisma)`,
    );
    throw new Error(
      `PRISMA MODEL GUARD FAILED:\n` +
        `${filteredTypos.length} referenced model(s) do not exist on the live Prisma client:\n` +
        lines.join('\n'),
    );
  }

  return filteredTypos;
}
