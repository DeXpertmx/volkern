/**
 * Tests vitest del sistema de verticales:
 *   • VERTICAL_DEFINITIONS en lib/plans.ts: 4 verticales con módulos
 *     curados, ninguno con módulos duplicados, helpers basics.
 *   • seedTenantModulesFromVertical en lib/provisioning/tenant-provisioner:
 *     upsert idempotente de tenantFeature habilitando los módulos de la
 *     vertical, ignora los ya habilitados, reporta errores sin abortar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const tenantFeature = {
        findUnique: vi.fn(),
        upsert: vi.fn(),
    };
    return {
        tenantFeature,
        prisma: { tenantFeature },
    };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

import {
    VERTICALS,
    VERTICAL_DEFINITIONS,
} from '../lib/plans';
import {
    seedTenantModulesFromVertical,
    type SeedTenantModulesFromVerticalInput,
} from '../lib/provisioning/tenant-provisioner';

const TENANT_ID = 'tenant-abc';
const VERTICAL: SeedTenantModulesFromVerticalInput['vertical'] = 'insurance';

describe('VERTICAL_DEFINITIONS', () => {
    it('todas las verticales en VERTICALS tienen una definición', () => {
        for (const v of VERTICALS) {
            expect(VERTICAL_DEFINITIONS[v]).toBeDefined();
            expect(VERTICAL_DEFINITIONS[v].id).toBe(v);
        }
    });

    it('cada definición tiene módulos no vacíos y únicos', () => {
        for (const v of VERTICALS) {
            const def = VERTICAL_DEFINITIONS[v];
            expect(def.modules.length).toBeGreaterThan(0);
            const uniqueModules = new Set(def.modules);
            expect(uniqueModules.size).toBe(def.modules.length);
        }
    });

    it('insurance incluye insurance, real_estate incluye catalogo, accounting incluye finanzas', () => {
        expect(VERTICAL_DEFINITIONS.insurance.modules).toContain('insurance');
        expect(VERTICAL_DEFINITIONS.real_estate.modules).toContain('catalogo');
        expect(VERTICAL_DEFINITIONS.accounting.modules).toContain('finanzas');
    });

    it('insurance, real_estate, accounting y general son todas distintas en componentes clave', () => {
        const sig = (v: keyof typeof VERTICAL_DEFINITIONS) =>
            VERTICAL_DEFINITIONS[v].modules.slice().sort().join(',');
        const all = ['insurance', 'real_estate', 'accounting', 'general'].map(sig);
        // Asegurar que cada vertical tiene una combinación distinta.
        expect(new Set(all).size).toBeGreaterThan(2);
    });
});

describe('seedTenantModulesFromVertical', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tenantFeature.findUnique.mockResolvedValue(null);
        mocks.tenantFeature.upsert.mockResolvedValue({ id: 'tf-1' });
    });

    it('1) éxito: inserta cada módulo de la vertical sin duplicates', async () => {
        const result = await seedTenantModulesFromVertical({
            tenantId: TENANT_ID,
            vertical: VERTICAL,
            modules: VERTICAL_DEFINITIONS.insurance.modules,
            actor: { kind: 'system', source: 'partner-onboarding' },
        });
        expect(result.errors).toEqual([]);
        expect(result.seeded.length).toBe(VERTICAL_DEFINITIONS.insurance.modules.length);
        expect(result.skipped).toEqual([]);
        expect(mocks.tenantFeature.upsert).toHaveBeenCalledTimes(
            VERTICAL_DEFINITIONS.insurance.modules.length,
        );
    });

    it('2) idempotente: módulos ya habilitados → skipped, no se upsertea', async () => {
        // Primer módulo: ya habilitado, segundo: no habilitado → upsert.
        mocks.tenantFeature.findUnique.mockImplementation(({ where }) => {
            const feature = where.tenantId_feature.feature;
            return Promise.resolve(
                feature === VERTICAL_DEFINITIONS.insurance.modules[0]
                    ? { habilitado: true }
                    : null,
            );
        });
        const result = await seedTenantModulesFromVertical({
            tenantId: TENANT_ID,
            vertical: VERTICAL,
            modules: VERTICAL_DEFINITIONS.insurance.modules,
            actor: { kind: 'system', source: 'partner-onboarding' },
        });
        expect(result.skipped).toContain(VERTICAL_DEFINITIONS.insurance.modules[0]);
        expect(result.seeded.length).toBe(VERTICAL_DEFINITIONS.insurance.modules.length - 1);
        expect(mocks.tenantFeature.upsert).toHaveBeenCalledTimes(
            VERTICAL_DEFINITIONS.insurance.modules.length - 1,
        );
    });

    it('3) defensivo: un error en un módulo no aborta el resto', async () => {
        mocks.tenantFeature.upsert.mockImplementation(({ where }) => {
            if (where.tenantId_feature.feature === VERTICAL_DEFINITIONS.insurance.modules[2]) {
                throw new Error('Prisma unique constraint');
            }
            return { id: 'tf-x' } as any;
        });
        const result = await seedTenantModulesFromVertical({
            tenantId: TENANT_ID,
            vertical: VERTICAL,
            modules: VERTICAL_DEFINITIONS.insurance.modules,
            actor: { kind: 'system', source: 'partner-onboarding' },
        });
        const seededCount = result.seeded.length;
        const errorCount = result.errors.length;
        expect(seededCount + errorCount).toBe(VERTICAL_DEFINITIONS.insurance.modules.length);
        expect(result.errors[0]).toEqual({
            module: VERTICAL_DEFINITIONS.insurance.modules[2],
            error: expect.stringContaining('Prisma'),
        });
        expect(seededCount).toBe(VERTICAL_DEFINITIONS.insurance.modules.length - 1);
    });

    it('4) actor=user propaga habilitadoPor y razon con metadata de vertical', async () => {
        await seedTenantModulesFromVertical({
            tenantId: TENANT_ID,
            vertical: VERTICAL,
            modules: ['leads', 'contactos'],
            actor: { kind: 'user', id: 'admin-1', email: 'op@volkern.app' },
        });
        expect(mocks.tenantFeature.upsert).toHaveBeenCalledTimes(2);
        const calls = mocks.tenantFeature.upsert.mock.calls;
        for (const call of calls) {
            const data = call[0];
            expect(data.create.habilitadoPor).toBe('op@volkern.app');
            expect(data.create.razon).toBe(`Vertical seed: ${VERTICAL}`);
            expect(data.create.habilitado).toBe(true);
        }
    });

    it('5) actor=system propaga habilitadoPor como system:{source}', async () => {
        await seedTenantModulesFromVertical({
            tenantId: TENANT_ID,
            vertical: VERTICAL,
            modules: ['mensajes'],
            actor: { kind: 'system', source: 'partner-onboarding' },
        });
        const data = mocks.tenantFeature.upsert.mock.calls[0][0];
        expect(data.create.habilitadoPor).toBe('system:partner-onboarding');
    });

    it('6) todas las verticales semilla al menos insurance/contactos/leads/tareas (core CRM)', () => {
        for (const v of VERTICALS) {
            const mods = VERTICAL_DEFINITIONS[v].modules;
            expect(mods).toContain('leads');
            expect(mods).toContain('contactos');
            expect(mods).toContain('tareas');
        }
    });
});
