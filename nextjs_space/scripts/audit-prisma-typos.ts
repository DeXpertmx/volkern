/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * Audit script — walks `scripts/*.ts` to detect `prisma.<name>` references
 * that don't match any schema-derived model.
 *
 * Catches typos like `prisma.adCampaigns(...)` where the schema actually
 * exposes `prisma.adCampaign` (singular camelCase from `model AdCampaign`).
 * Also flags `prisma.lead` when `model Lead` is plural in the schema
 * (i.e. `prisma.leads`), and any ad-hoc near-miss.
 *
 * Usage: npx tsx scripts/audit-prisma-typos.ts
 *
 * Behaviour: informational only — exit 0 regardless of findings. The
 * audit is meant for code review prompts and CI informational logs. To
 * FAIL-FAST on typos within a single script, use the per-script guard
 * `assertNoPrismaTypos()` from `lib/dev/prisma-model-guard.ts` instead.
 */
import fs from 'fs';
import path from 'path';
import { detectPrismaTypos } from '../lib/dev/prisma-model-guard';

function step(label: string) {
  console.log(`\n=== ${label} ===`);
}

async function main() {
  const scriptsDir = path.join(process.cwd(), 'scripts');
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');

  if (!fs.existsSync(schemaPath)) {
    console.error(`[audit-prisma-typos] schema.prisma not found at ${schemaPath}`);
    process.exit(2);
  }

  const schemaCode = fs.readFileSync(schemaPath, 'utf-8');
  const schemaModelCount = schemaCode.match(/^\s*model\s+[A-Z]/gm)?.length ?? 0;

  const allFiles = fs.readdirSync(scriptsDir);
  const scriptFiles = allFiles
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.bak'))
    .sort();
  step(`Walking ${scriptFiles.length} scripts vs ${schemaModelCount} schema models`);

  interface Finding {
    script: string;
    ref: string;
    suggestion: string | null;
    dist: number;
  }

  const findings: Finding[] = [];
  let totalRefsAcrossScripts = 0;

  for (const file of scriptFiles) {
    const fullPath = path.join(scriptsDir, file);
    let sourceCode: string;
    try {
      sourceCode = fs.readFileSync(fullPath, 'utf-8');
    } catch (e: any) {
      console.warn(`  ! could not read ${file}: ${e.message}`);
      continue;
    }
    // Count references actually in scope (-filter method names).
    const allRefs = sourceCode.match(/prisma\.([A-Za-z_$][A-Za-z0-9_$]*)/g) ?? [];
    totalRefsAcrossScripts += allRefs.filter((s) => !s.includes('$.')).length;
    const typos = detectPrismaTypos(sourceCode, schemaCode);
    for (const t of typos) {
      findings.push({ script: file, ref: t.ref, suggestion: t.suggestion, dist: t.dist });
    }
  }

  step(
    `Summary: ${totalRefsAcrossScripts} prisma.<model> refs scanned across ${scriptFiles.length} scripts`,
  );

  if (findings.length === 0) {
    console.log('✓ All scripts reference valid schema models.');
    process.exit(0);
  }

  // Group by typo (ref) → list of scripts in which it appears.
  const byRef = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byRef.has(f.ref)) byRef.set(f.ref, []);
    byRef.get(f.ref)!.push(f);
  }
  // Sort by occurrence count desc.
  const sortedRefs = [...byRef.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(
    `\nFound ${findings.length} potential typo(s) across ${byRef.size} unique ref(s):\n`,
  );

  for (const [ref, list] of sortedRefs) {
    const example = list[0];
    const head = example.suggestion
      ? `→ Did you mean '${example.suggestion}'?${
          example.dist === 1 && ref.endsWith('s') && !example.suggestion.endsWith('s')
            ? ' (check trailing "s" for plural/singular mismatch)'
            : ''
        }`
      : '→ (no close match)';
    console.log(`  ${ref.padEnd(30)} × ${list.length} script(s)  ${head}`);
    for (const f of list.slice(0, 5)) {
      console.log(`      - ${f.script}`);
    }
    if (list.length > 5) {
      console.log(`      … and ${list.length - 5} more`);
    }
  }

  step(
    `Done. Warnings only — exit 0. Run again after fixes to verify the count drops.`,
  );
  process.exit(0);
}

main().catch((err: any) => {
  console.error('!!! audit failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
