/**
 * seed-vertical-bulk — Orquestador reusable para sembrar el starter pack
 * de módulos verticales (insurance / real_estate / accounting / general)
 * en N tenants a la vez. Diseñado para que el CTA del paso "Done" del
 * bulk-onboarding wizard y el endpoint server-side
 * `/api/admin/partner-bulk/seed-vertical` compartan exactamente la misma
 * lógica.
 *
 * Patrón idéntico a `partner-bulk-runner.ts`: pool de workers con
 * concurrencia configurable (default 3, cap 1..10), defensivo contra
 * errores parciales, dry-run que reporta el plan sin mutar nada.
 *
 * Reutiliza `seedTenantModulesFromVertical` del provisioner — ningún
 * upsert de `tenantFeature` se implementa aquí.
 */

import {
    seedTenantModulesFromVertical,
    type SeedVerticalResult,
} from '@/lib/provisioning/tenant-provisioner';
import { VERTICAL_DEFINITIONS, type Vertical, type CrmModule } from '@/lib/plans';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type SeedVerticalActor =
    | { kind: 'user'; id: string; email: string | null }
    | { kind: 'system'; source: string };

export interface SeedVerticalBulkInput {
    tenantIds: readonly string[];
    vertical: Vertical;
    /** Custom modules (opcional) — si no, usa VERTICAL_DEFINITIONS[vertical].modules. */
    modules?: readonly CrmModule[];
    dryRun: boolean;
    concurrency?: number;
    actor: SeedVerticalActor;
}

export interface SeedVerticalBulkTenantResult {
    tenantId: string;
    seeded: string[];
    skipped: string[];
    errors: { module: string; error: string }[];
    /** true si dryRun=true o si el runner ya hizo el upsert. */
    ok: boolean;
    /** Error de negocio si tenant no se pudo procesar entero. */
    fatalError?: string;
}

export interface SeedVerticalBulkOutput {
    ok: boolean;
    dryRun: boolean;
    vertical: Vertical;
    modulesPlanned: readonly CrmModule[];
    total: number;
    succeeded: number;
    /** Tenants donde al menos un módulo semilla falló. */
    partial: number;
    failed: number;
    /** Suma total de módulos actualizados (excl. skipped). */
    totalSeeded: number;
    /** Suma total de módulos que ya estaban activos (idempotencia). */
    totalSkipped: number;
    /** Detalle por tenant. */
    tenants: SeedVerticalBulkTenantResult[];
}

// ─── Orquestador ───────────────────────────────────────────────────────────────

/**
 * Resuelve la lista de módulos que se van a sembrar según la vertical.
 * Si el caller no pasa modules, usa `VERTICAL_DEFINITIONS[vertical].modules`.
 */
function resolveModules(vertical: Vertical, modules?: readonly CrmModule[]): readonly CrmModule[] {
    return modules ?? VERTICAL_DEFINITIONS[vertical].modules;
}

/**
 * Procesa un tenant individual: llama a `seedTenantModulesFromVertical`
 * (que ya hace el upsert + cuenta idempotente).
 *
 * Excepciones no controladas se reportan como `fatalError` por tenant;
 * los errores de upsert parcial (ya manejados por el helper) aparecen
 * en `tenantResult.errors[]`. Nunca lanza.
 */
async function processOne(
    tenantId: string,
    vertical: Vertical,
    modules: readonly CrmModule[],
    dryRun: boolean,
    actor: SeedVerticalActor,
): Promise<SeedVerticalBulkTenantResult> {
    // En dry-run, simulamos el resultado esperado sin tocar Prisma.
    if (dryRun) {
        return {
            tenantId,
            seeded: modules.map(m => `${m} (simulated)`),
            skipped: [],
            errors: [],
            ok: true,
        };
    }

    try {
        const r = await seedTenantModulesFromVertical({
            tenantId,
            vertical,
            modules,
            actor,
        });
        return {
            tenantId,
            seeded: r.seeded,
            skipped: r.skipped,
            errors: r.errors,
            ok: r.errors.length === 0,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            tenantId,
            seeded: [],
            skipped: [],
            errors: [],
            ok: false,
            fatalError: message.slice(0, 280),
        };
    }
}

/**
 * Pool de workers con concurrencia limitada. La firma y semántica son
 * equivalentes a `runBulkOnboarding` en `partner-bulk-runner.ts`.
 */
export async function runSeedVerticalBulk(input: SeedVerticalBulkInput): Promise<SeedVerticalBulkOutput> {
    const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, 10));
    const modulesPlanned = resolveModules(input.vertical, input.modules);
    const queue: string[] = [...input.tenantIds];
    const tenants: SeedVerticalBulkTenantResult[] = [];
    let succeeded = 0;
    let partial = 0;
    let failed = 0;
    let totalSeeded = 0;
    let totalSkipped = 0;

    async function worker(): Promise<void> {
        while (queue.length > 0) {
            const tenantId = queue.shift();
            if (!tenantId) break;
            const r = await processOne(tenantId, input.vertical, modulesPlanned, input.dryRun, input.actor);
            totalSeeded += r.seeded.length;
            totalSkipped += r.skipped.length;
            if (r.ok && r.errors.length === 0) succeeded++;
            if (!r.fatalError && r.errors.length > 0) partial++;
            if (r.fatalError) failed++;
            tenants.push(r);
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    return {
        ok: failed === 0 && partial === 0,
        dryRun: input.dryRun,
        vertical: input.vertical,
        modulesPlanned,
        total: input.tenantIds.length,
        succeeded,
        partial,
        failed,
        totalSeeded,
        totalSkipped,
        tenants,
    };
}

// Re-export type alias para que los callers puedan importar
// `SeedVerticalResult` directamente de este módulo si lo prefieren.
export type { SeedVerticalResult };
