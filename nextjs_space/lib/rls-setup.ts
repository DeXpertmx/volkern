import { PrismaClient } from '@prisma/client';

export async function verifyRLSSetup(client: PrismaClient): Promise<{
  success: boolean;
  details: {
    functionsExist: boolean;
    migrationApplied: boolean;
    tablesWithRLS: number;
    policiesCount: number;
  };
  errors: string[];
}> {
  const errors: string[] = [];
  const details = {
    functionsExist: false,
    migrationApplied: false,
    tablesWithRLS: 0,
    policiesCount: 0,
  };

  try {
    const functionsCheck = await client.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'app'
      AND p.proname IN ('rls_tenant_check', 'set_tenant_context', 'get_current_tenant_id')
    `;
    details.functionsExist = (functionsCheck[0]?.count ?? 0) >= 3;
    if (!details.functionsExist) {
      errors.push('RLS functions not found. Run the migration first.');
    }
  } catch (e) {
    errors.push('Could not verify RLS functions: ' + String(e));
  }

  try {
    const migrationCheck = await client.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM _rls_migration LIMIT 1) as exists
    `;
    details.migrationApplied = migrationCheck[0]?.exists ?? false;
    if (!details.migrationApplied) {
      errors.push('RLS migration not applied. Run scripts/saas-rls-migration.sql');
    }
  } catch {
    details.migrationApplied = false;
  }

  try {
    const tablesCheck = await client.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM pg_tables
      WHERE schemaname = 'public'
        AND rowsecurity = true
    `;
    details.tablesWithRLS = tablesCheck[0]?.count ?? 0;
  } catch (e) {
    errors.push('Could not count RLS tables: ' + String(e));
  }

  try {
    const policiesCheck = await client.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM pg_policy
      WHERE schemaname = 'public'
    `;
    details.policiesCount = policiesCheck[0]?.count ?? 0;
  } catch (e) {
    errors.push('Could not count policies: ' + String(e));
  }

  return {
    success: details.functionsExist && details.migrationApplied,
    details,
    errors,
  };
}

export async function setupTenantContext(
  client: PrismaClient,
  tenantId: string
): Promise<void> {
  await client.$executeRawUnsafe(
    `SELECT app.set_tenant_context('${tenantId.replace(/'/g, "''")}')`
  );
}

export async function clearTenantContext(client: PrismaClient): Promise<void> {
  try {
    await client.$executeRaw`SELECT app.clear_tenant_context()`;
  } catch {
    // Function might not exist
  }
}

export async function enableRLSBypass(client: PrismaClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.rls_bypass', 'true', false)`;
}

export async function disableRLSBypass(client: PrismaClient): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.rls_bypass', '', true)`;
}

export async function testTenantIsolation(
  client: PrismaClient,
  tableName: string
): Promise<{ success: boolean; leakedRows: number }> {
  const currentTenant = await client.$queryRaw<Array<{ tenant_id: string | null }>>`
    SELECT app.get_current_tenant_id() as tenant_id
  `;
  
  const tenantId = currentTenant[0]?.tenant_id;
  if (!tenantId) {
    return { success: false, leakedRows: -1 };
  }

  const leakedRows = await client.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int as count
    FROM ${client.$queryRaw([tableName] as any)}
    WHERE "tenantId" IS NOT NULL
      AND "tenantId" != ${tenantId}
  `;

  const count = leakedRows[0]?.count ?? 0;
  return { success: count === 0, leakedRows: count };
}

export default {
  verifyRLSSetup,
  setupTenantContext,
  clearTenantContext,
  enableRLSBypass,
  disableRLSBypass,
  testTenantIsolation,
};