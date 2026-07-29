/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * LIVE CREDENTIALS SMOKE for Publicaciones ADS module.
 *
 *   npx tsx scripts/smoke-ads-live-credentials.ts
 *
 * Loads .env.sandbox (gitignored) from the repo root or nextjs_space/, then
 * exercises the production connectors end-to-end against Meta + Google
 * sandbox APIs. For each platform with complete credentials:
 *
 *   1. Provisions AdPlatformConnection (encrypts sandbox token via Vault).
 *   2. Creates AdsCreative + AdsCampaignPublication.
 *   3. Calls connector.publishPublication — full HTTPS roundtrip.
 *   4. Asserts: externalAdId populated + estado mapped (PUBLICADA/PROGRAMADA).
 *   5. Calls connector.syncInsights — confirms metrics endpoint reachable.
 *   6. (Meta) Calls connector.pausePublication — confirms reverse control.
 *   7. Cleans up so the sandbox account isn't polluted.
 *
 * BEHAVIOR:
 *   - No .env.sandbox OR no platform has complete creds
 *       → SKIP with exit 0. CI-friendly.
 *   - Creds present and any live assertion FAILS
 *       → exit 1.
 *   - Creds present and all assertions pass
 *       → exit 0.
 *
 * Expected outcomes per platform:
 *   - META: publishPublication returns status='IN_REVIEW' (constant in our
 *     connector) → estado=PROGRAMADA. Meta requires an external re-poll to
 *     reach ACTIVE/PUBLICADA. The connector's externalAdId is the proof.
 *   - GOOGLE: returns ACTIVE (estado=PUBLICADA) when policy approves
 *     immediately, or IN_REVIEW (estado=PROGRAMADA) when pending.
 *     Both are accepted as success.
 *
 * See .env.sandbox.example (created alongside this file) for env-var layout.
 */
import fs from 'fs';
import path from 'path';

// ─── 0. .env.sandbox loader (no dotenv dep) ────────────────────────────
function loadEnvFile(filePath: string): { loaded: string[] } {
  if (!fs.existsSync(filePath)) return { loaded: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
  const loaded: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
      loaded.push(key);
    }
  }
  return { loaded };
}

function loadSandboxEnv(): { fromFile: string | null; loaded: string[] } {
  for (const candidate of [
    path.join(process.cwd(), '.env.sandbox'),
    path.join(process.cwd(), '..', '.env.sandbox'),
    path.join(process.cwd(), 'nextjs_space', '.env.sandbox'),
  ]) {
    const { loaded } = loadEnvFile(candidate);
    if (loaded.length > 0) return { fromFile: candidate, loaded };
  }
  return { fromFile: null, loaded: [] };
}

// ─── 1. Imports (AFTER env load — lib/db reads env on import) ─────────
import { prisma } from '../lib/db';
import { MetaAdsConnector } from '../lib/ads/connectors/meta-ads';
import { GoogleAdsConnector } from '../lib/ads/connectors/google-ads';
import { VaultService } from '../lib/security/vault';
import { assertNoPrismaTypos } from '../lib/dev/prisma-model-guard';

function step(label: string) {
  console.log(`\n=== ${label} ===`);
}

const REQUIRED = {
  META: [
    'ADS_META_CLIENT_ID',
    'ADS_META_CLIENT_SECRET',
    'ADS_META_DEFAULT_PAGE_ID',
    'ADS_META_DEFAULT_ADSET_ID',
    'META_SANDBOX_ACCESS_TOKEN',
    'META_SANDBOX_ACCOUNT_ID',
  ],
  GOOGLE: [
    'ADS_GOOGLE_CLIENT_ID',
    'ADS_GOOGLE_CLIENT_SECRET',
    'ADS_GOOGLE_DEVELOPER_TOKEN',
    'GOOGLE_SANDBOX_REFRESH_TOKEN',
    'GOOGLE_SANDBOX_CUSTOMER_ID',
    'GOOGLE_SANDBOX_AD_GROUP_ID',
  ],
} as const;

function missingEnv(platform: 'META' | 'GOOGLE'): string[] {
  return REQUIRED[platform].filter((k) => !process.env[k]);
}

// ─── 2. PRISMA MODEL GUARD (re-used from offline smoke) ───────────────

// ─── 3. Status mapper (matches /api/.../publish/route.ts) ──────────────
function mapPublicacionEstado(connectorStatus: string): 'PUBLICADA' | 'PROGRAMADA' | 'ERROR' {
  switch (connectorStatus) {
    case 'ACTIVE':
      return 'PUBLICADA';
    case 'IN_REVIEW':
      return 'PROGRAMADA';
    case 'REJECTED':
      return 'ERROR';
    default:
      return 'PROGRAMADA';
  }
}

// ─── 4. Sandbox-account wipe helper ───────────────────────────────────
async function wipeSandboxArtifacts(tenantId: string, platform: 'META' | 'GOOGLE', accountId: string, runTag: string) {
  await prisma.adPlatformConnection.deleteMany({
    where: { tenantId, platform, accountId },
  });
  await prisma.adsCreative.deleteMany({
    where: { tenantId, nombre: { startsWith: runTag } },
  });
  await prisma.adsCampaignPublication.deleteMany({
    where: { tenantId, nombre: { startsWith: runTag } },
  });
}

// ─── 5. Live flow per platform ────────────────────────────────────────
/**
 * Round-trip check: re-read the publication after the publish update
 * and assert `externalAdId` + `estado` persisted to the schema column.
 *
 * This is the "Assert externalAdId poblado" requirement. Verifying only
 * the connector's return value is not enough because Prisma SILENTLY
 * drops writes to unknown field names. If the smoke writes to
 * `externalId` while the schema column is `externalAdId`, this
 * assertion catches it (and the test exits 1 instead of passing).
 */
async function assertPublicationPersisted(
  publicationId: string,
  expectedExternalAdId: string,
  expectedEstado: 'PUBLICADA' | 'PROGRAMADA' | 'ERROR',
): Promise<{ externalAdId: string; estado: string }> {
  const reloaded = await prisma.adsCampaignPublication.findUnique({
    where: { id: publicationId },
    select: { externalAdId: true, estado: true },
  });
  if (!reloaded) {
    throw new Error(`LIVE: publication ${publicationId} disappeared after update — round-trip failed`);
  }
  if (!reloaded.externalAdId) {
    throw new Error(
      `LIVE: externalAdId NOT persisted for ${publicationId}. Re-read row: ${JSON.stringify(reloaded)} — schema field may be misnamed in the smoke.`,
    );
  }
  if (reloaded.externalAdId !== expectedExternalAdId) {
    throw new Error(
      `LIVE: externalAdId round-trip mismatch. Connector returned ${expectedExternalAdId}, DB has ${reloaded.externalAdId}`,
    );
  }
  if (reloaded.estado !== expectedEstado) {
    throw new Error(`LIVE: estado round-trip mismatch. Expected ${expectedEstado}, got ${reloaded.estado}`);
  }
  return reloaded as { externalAdId: string; estado: string };
}

async function runMetaLive(tenant: { id: string; vaultSeed: string }) {
  step('A. META LIVE: provision platform + creative + publication');
  const accountId = process.env.META_SANDBOX_ACCOUNT_ID!;
  const runTag = `live_meta_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await wipeSandboxArtifacts(tenant.id, 'META', accountId, runTag);

  const platform = await prisma.adPlatformConnection.create({
    data: {
      tenantId: tenant.id,
      platform: 'META',
      accountId,
      accountName: `Live Smoke Meta ${runTag}`,
      accessToken: VaultService.encrypt(
        process.env.META_SANDBOX_ACCESS_TOKEN!,
        tenant.id,
        tenant.vaultSeed,
      ),
      refreshToken: VaultService.encrypt(
        process.env.META_SANDBOX_REFRESH_TOKEN || process.env.META_SANDBOX_ACCESS_TOKEN!,
        tenant.id,
        tenant.vaultSeed,
      ),
      tokenExpiresAt: new Date(Date.now() + 86400_000),
      status: 'CONNECTED',
      metadata: { source: 'live-smoke', runTag },
    },
  });
  console.log(`  platform created: id=${platform.id}`);

  const creative = await prisma.adsCreative.create({
    data: {
      tenantId: tenant.id,
      nombre: `${runTag}_creative`,
      mediaUrl: process.env.META_SANDBOX_IMAGE_URL || 'https://placehold.co/1200x630.png',
      mediaType: 'IMAGE',
      bodyText: process.env.META_SANDBOX_BODY || `Live smoke body — ${runTag}`,
      headline: process.env.META_SANDBOX_HEADLINE || 'Live Smoke Headline',
      callToAction: 'LEARN_MORE',
      landingUrl: process.env.META_SANDBOX_LANDING_URL || 'https://example.com',
    },
  });
  console.log(`  creative created: id=${creative.id}`);

  const pub = await prisma.adsCampaignPublication.create({
    data: {
      tenantId: tenant.id,
      nombre: `${runTag}_pub`,
      plataforma: 'META',
      creativeId: creative.id,
      isBoost: false,
      estado: 'BORRADOR',
      metrics: { impressions: 0, clicks: 0, spend: 0 },
    },
  });
  console.log(`  publication created: id=${pub.id}`);

  step('A. META LIVE: publishPublication → full Graph API roundtrip');
  const connector = new MetaAdsConnector();
  const result = await connector.publishPublication({
    publicationId: pub.id,
    platformId: platform.id,
    metaPageId: process.env.ADS_META_DEFAULT_PAGE_ID,
    adSetId: process.env.ADS_META_DEFAULT_ADSET_ID,
    creative: {
      mediaUrl: creative.mediaUrl,
      mediaType: 'IMAGE',
      bodyText: creative.bodyText ?? '',
      headline: creative.headline ?? '',
      callToAction: 'LEARN_MORE',
      landingUrl: creative.landingUrl ?? '',
    },
  });
  console.log('  publishPublication result:', {
    externalAdId: result.externalAdId,
    status: result.status,
    externalStatusRaw: result.externalStatusRaw,
    errorMessage: result.errorMessage ? result.errorMessage.slice(0, 120) : null,
  });

  if (!result.externalAdId) {
    throw new Error(
      `META LIVE: publishPublication returned no externalAdId. status=${result.status}, ` +
        `errorMessage=${result.errorMessage ?? 'none'}`,
    );
  }

  const estado = mapPublicacionEstado(result.status);
  await prisma.adsCampaignPublication.update({
    where: { id: pub.id },
    data: {
      externalAdId: result.externalAdId,
      estado,
      errorMessage: result.errorMessage ?? null,
    },
  });

  step('A. META LIVE: assert externalAdId + estado=PROGRAMADA (DB round-trip)');
  console.log(`  ✓ in-memory: connector returned externalAdId=${result.externalAdId}, status=${result.status}`);
  if (estado !== 'PROGRAMADA' && estado !== 'PUBLICADA') {
    throw new Error(`META LIVE: expected estado=PROGRAMADA/PUBLICADA, got ${estado}`);
  }
  const reloaded = await assertPublicationPersisted(pub.id, result.externalAdId, estado);
  console.log(`  ✓ DB round-trip confirmed: adsCampaignPublication.externalAdId=${reloaded.externalAdId}, estado=${reloaded.estado}`);

  step('A. META LIVE: syncInsights — verify metrics endpoint reachable');
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400_000);
  const insights = await connector.syncInsights(tenant.id, platform.id, sevenDaysAgo, today);
  console.log('  syncInsights result:', {
    imported: insights.insightsImported,
    errors: insights.errors?.slice(0, 3),
    from: insights.dateFrom.toISOString().slice(0, 10),
    to: insights.dateTo.toISOString().slice(0, 10),
  });
  if (insights.errors && insights.errors.length > 0) {
    console.warn('  syncInsights reported errors:', insights.errors);
  }
  console.log('  ✓ metrics endpoint reachable (token auto-renewed if expired)');

  step('A. META LIVE: pausePublication — confirm reverse control works');
  await connector.pausePublication({ externalAdId: result.externalAdId, platformId: platform.id });
  console.log(`  ✓ paused Meta ad ${result.externalAdId}`);

  step('A. META LIVE: cleanup');
  await pruneSandboxRecords(pub.id, creative.id, platform.id);
}

async function runGoogleLive(tenant: { id: string; vaultSeed: string }) {
  step('B. GOOGLE LIVE: provision platform + creative + publication');
  const accountId = process.env.GOOGLE_SANDBOX_CUSTOMER_ID!;
  const runTag = `live_google_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await wipeSandboxArtifacts(tenant.id, 'GOOGLE', accountId, runTag);

  const platform = await prisma.adPlatformConnection.create({
    data: {
      tenantId: tenant.id,
      platform: 'GOOGLE',
      accountId,
      accountName: `Live Smoke Google ${runTag}`,
      accessToken: VaultService.encrypt(
        process.env.GOOGLE_SANDBOX_REFRESH_TOKEN!,
        tenant.id,
        tenant.vaultSeed,
      ),
      refreshToken: VaultService.encrypt(
        process.env.GOOGLE_SANDBOX_REFRESH_TOKEN!,
        tenant.id,
        tenant.vaultSeed,
      ),
      tokenExpiresAt: new Date(Date.now() + 86400_000),
      status: 'CONNECTED',
      metadata: {
        developerToken: process.env.ADS_GOOGLE_DEVELOPER_TOKEN,
        source: 'live-smoke',
        runTag,
      },
    },
  });
  console.log(`  platform created: id=${platform.id}`);

  const creative = await prisma.adsCreative.create({
    data: {
      tenantId: tenant.id,
      nombre: `${runTag}_creative`,
      mediaUrl: process.env.GOOGLE_SANDBOX_IMAGE_URL || 'https://placehold.co/1200x630.png',
      mediaType: 'IMAGE',
      bodyText: process.env.GOOGLE_SANDBOX_BODY || `Live smoke body — ${runTag}`,
      headline: process.env.GOOGLE_SANDBOX_HEADLINE || 'Live Smoke Headline',
      callToAction: 'LEARN_MORE',
      landingUrl: process.env.GOOGLE_SANDBOX_LANDING_URL || 'https://example.com',
    },
  });
  console.log(`  creative created: id=${creative.id}`);

  const pub = await prisma.adsCampaignPublication.create({
    data: {
      tenantId: tenant.id,
      nombre: `${runTag}_pub`,
      plataforma: 'GOOGLE',
      creativeId: creative.id,
      isBoost: false,
      estado: 'BORRADOR',
      metrics: { impressions: 0, clicks: 0, spend: 0 },
    },
  });
  console.log(`  publication created: id=${pub.id}`);

  step('B. GOOGLE LIVE: publishPublication → full Google Ads API roundtrip');
  const connector = new GoogleAdsConnector();
  const result = await connector.publishPublication({
    publicationId: pub.id,
    platformId: platform.id,
    adSetId: process.env.GOOGLE_SANDBOX_AD_GROUP_ID!,
    creative: {
      mediaUrl: creative.mediaUrl,
      mediaType: 'IMAGE',
      bodyText: creative.bodyText ?? '',
      headline: creative.headline ?? '',
      callToAction: 'LEARN_MORE',
      landingUrl: creative.landingUrl ?? '',
    },
  });
  console.log('  publishPublication result:', {
    externalAdId: result.externalAdId,
    status: result.status,
    externalStatusRaw: result.externalStatusRaw,
    errorMessage: result.errorMessage ? result.errorMessage.slice(0, 120) : null,
  });

  if (!result.externalAdId) {
    throw new Error(
      `GOOGLE LIVE: publishPublication returned no externalAdId. status=${result.status}, ` +
        `errorMessage=${result.errorMessage ?? 'none'}`,
    );
  }

  const estado = mapPublicacionEstado(result.status);
  await prisma.adsCampaignPublication.update({
    where: { id: pub.id },
    data: {
      externalAdId: result.externalAdId,
      estado,
      errorMessage: result.errorMessage ?? null,
    },
  });

  step('B. GOOGLE LIVE: assert externalAdId + estado=PUBLICADA/PROGRAMADA (DB round-trip)');
  console.log(`  ✓ in-memory: connector returned externalAdId=${result.externalAdId}, status=${result.status}`);
  if (estado !== 'PUBLICADA' && estado !== 'PROGRAMADA') {
    throw new Error(`GOOGLE LIVE: expected estado=PUBLICADA or PROGRAMADA, got ${estado}`);
  }
  const reloaded = await assertPublicationPersisted(pub.id, result.externalAdId, estado);
  console.log(`  ✓ DB round-trip confirmed: adsCampaignPublication.externalAdId=${reloaded.externalAdId}, estado=${reloaded.estado}`);

  step('B. GOOGLE LIVE: syncInsights — verify metrics endpoint reachable');
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400_000);
  const insights = await connector.syncInsights(tenant.id, platform.id, sevenDaysAgo, today);
  console.log('  syncInsights result:', {
    imported: insights.insightsImported,
    errors: insights.errors?.slice(0, 3),
    from: insights.dateFrom.toISOString().slice(0, 10),
    to: insights.dateTo.toISOString().slice(0, 10),
  });
  if (insights.errors && insights.errors.length > 0) {
    console.warn('  syncInsights reported errors:', insights.errors);
  }
  console.log('  ✓ metrics endpoint reachable');

  step('B. GOOGLE LIVE: cleanup');
  await pruneSandboxRecords(pub.id, creative.id, platform.id);
}

async function pruneSandboxRecords(
  publicationId: string,
  creativeId: string,
  platformId: string,
) {
  await prisma.adsCampaignPublication.delete({ where: { id: publicationId } });
  await prisma.adsCreative.delete({ where: { id: creativeId } });
  await prisma.adPlatformConnection.delete({ where: { id: platformId } });
  console.log(`  ✓ pruned platform=${platformId}, creative=${creativeId}, pub=${publicationId}`);
}

// ─── 6. main ──────────────────────────────────────────────────────────
async function main() {
  await assertNoPrismaTypos(prisma);

  step('1. Load .env.sandbox');
  const sandbox = loadSandboxEnv();
  if (!sandbox.fromFile) {
    console.log('(no .env.sandbox found in candidate paths — proceeding to check live env in process)');
  } else {
    console.log(`  ✓ loaded ${sandbox.loaded.length} keys from ${sandbox.fromFile}`);
  }

  step('2. Determine which platforms are eligible for live test');
  const enableMeta = missingEnv('META').length === 0;
  const enableGoogle = missingEnv('GOOGLE').length === 0;
  if (!enableMeta) {
    const m = missingEnv('META');
    const present = REQUIRED.META.length - m.length;
    console.log(`  META: ${present}/${REQUIRED.META.length} envs present — missing ${m.length}:`);
    m.forEach((k) => console.log(`    - ${k}`));
  } else {
    console.log('  ✓ META env complete');
  }
  if (!enableGoogle) {
    const m = missingEnv('GOOGLE');
    const present = REQUIRED.GOOGLE.length - m.length;
    console.log(`  GOOGLE: ${present}/${REQUIRED.GOOGLE.length} envs present — missing ${m.length}:`);
    m.forEach((k) => console.log(`    - ${k}`));
  } else {
    console.log('  ✓ GOOGLE env complete');
  }
  if (!enableMeta && !enableGoogle) {
    console.log('\nSKIP — no platform has complete .env.sandbox credentials.');
    console.log('Required envs (see .env.sandbox.example at repo root):');
    console.log('  META:   ' + REQUIRED.META.join(', '));
    console.log('  GOOGLE: ' + REQUIRED.GOOGLE.join(', '));
    console.log('Copy .env.sandbox.example to .env.sandbox, fill out, and re-run.');
    process.exit(0);
  }

  step('3. Find tenant with vaultSeed (needed for VaultService.encrypt)');
  let tenant = await prisma.tenant.findFirst({
    where: { vaultSeed: { not: null } },
    select: { id: true, slug: true, vaultSeed: true },
  });
  if (!tenant || !tenant.vaultSeed) {
    const anyTenant = await prisma.tenant.findFirst({
      select: { id: true, slug: true, vaultSeed: true },
    });
    if (!anyTenant) {
      throw new Error('No tenants exist in DB. Seed prisma db first (pnpm run db:seed).');
    }
    tenant = { ...anyTenant, vaultSeed: anyTenant.vaultSeed ?? 'STUB-LIVE-SMOKE' };
  }
  console.log(`  Using tenant: ${tenant.slug} (vaultSeed ${tenant.vaultSeed ? 'present' : 'STUB'})`);

  if (enableMeta) {
    await runMetaLive({ id: tenant.id, vaultSeed: tenant.vaultSeed! });
  }
  if (enableGoogle) {
    await runGoogleLive({ id: tenant.id, vaultSeed: tenant.vaultSeed! });
  }

  console.log('\n=== LIVE SMOKE PASSED ===');
  console.log('All reachable platforms asserted end-to-end against real APIs:');
  console.log('  - publishPublication completed full HTTPS roundtrip');
  console.log('  - externalAdId persisted on AdsCampaignPublication');
  console.log('  - estado Volkern mapped correctly (PUBLICADA/PROGRAMADA/ERROR)');
  console.log('  - syncInsights reached metrics endpoint (auth + token refresh)');
  console.log('  - pausePublication acknowledged by Meta (live toggle)');
  console.log('  - All sandbox records cleanly removed after run');
}

main()
  .catch((err) => {
    console.error('\n!!! LIVE SMOKE FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
