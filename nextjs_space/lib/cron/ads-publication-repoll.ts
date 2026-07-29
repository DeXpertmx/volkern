/**
 * ADS Publication Re-Poll (Google) — every 30 min.
 *
 * For each `AdsCampaignPublication` in `estado=PROGRAMADA` + `plataforma=GOOGLE`,
 * re-consults Google's `ad_group_ad.policy_summary.approval_status` via
 * `GoogleAdsConnector.recheckGooglePolicy` and applies the matching flip:
 *
 *   APPROVED / APPROVED_LIMITED
 *     → connector.resumePublication (adGroupAds:mutate status=ENABLED) +
 *       optimistic-lock updateMany on the publication row:
 *       estado='PUBLICADA', externalStatus='ACTIVE'.
 *       (publishedAt is preserved untouched — already set on initial publish.)
 *
 *   DISAPPROVED / AREA_OF_INTEREST_ONLY
 *     → optimistic-lock updateMany on the publication row:
 *       estado='ERROR', externalStatus='REJECTED', errorMessage = approval
 *       status. NO Google mutation — a rejected ad can't be activated.
 *
 *   UNDER_REVIEW / PENDING_REVIEW / PENDING_APPROVAL / UNKNOWN
 *     → leave row in PROGRAMADA. Next cron retry.
 *
 * OPTIMISTIC LOCK: every DB write filters `estado: 'PROGRAMADA'`. If count===0,
 * the row was already flipped (UI race, prior-cron success, or batch replay).
 * The race is recorded in stats.racedOrSkipped. The Google mutation still ran
 * for some of these cases (idempotent on Google's side — setting status=ENABLED
 * on already-ENABLED is a no-op), but the DB write is suppressed.
 *
 * WHY THIS CRON EXISTS: the publishPublication connector hardcodes
 * status='IN_REVIEW' for Google (the connector's path always starts as PAUSED
 * pending policy review then re-queries immediately). If Google's policy
 * review takes hours, the ad never flips to ACTIVE on its own — it stays
 * PROGRAMADA in our DB forever without this re-poll.
 *
 * FAILURE MODES:
 *   - Per-row failure: leave row in PROGRAMADA + increment stats.errors.
 *     Next cron retries.
 *   - Drift (Google mutation succeeded but DB optimistic-lock missed):
 *     row stays PROGRAMADA. Next cron re-queries; if Google still returns
 *     APPROVED, re-attempts mutate (idempotent) + DB update (still PROGRAMADA).
 *   - Token expiry: recheckGooglePolicy self-refreshes + retries once. If the
 *     activate step (resumePublication) also fails with GoogleAuthError, the
 *     outer try/catch surfaces it as stats.errors — the row stays PROGRAMADA
 *     for the next cron.
 */
import { prisma } from '../db';
import { GoogleAdsConnector } from '../ads/connectors/google-ads';
import { logger } from '../logger';

export interface RepollStats {
  totalChecked: number;
  flippedToPublicada: number;
  flippedToError: number;
  racedOrSkipped: number;
  stillPending: number;
  errors: number;
  durationMs: number;
}

const APPROVED_STATUSES = new Set(['APPROVED', 'APPROVED_LIMITED']);
const REJECTED_STATUSES = new Set(['DISAPPROVED', 'AREA_OF_INTEREST_ONLY']);

export async function runAdsPublicationRepoll(): Promise<RepollStats> {
  const startTime = Date.now();
  const stats: RepollStats = {
    totalChecked: 0,
    flippedToPublicada: 0,
    flippedToError: 0,
    racedOrSkipped: 0,
    stillPending: 0,
    errors: 0,
    durationMs: 0,
  };

  const candidates = await prisma.adsCampaignPublication.findMany({
    where: {
      plataforma: 'GOOGLE',
      estado: 'PROGRAMADA',
      externalAdId: { not: null },
    },
    select: {
      id: true,
      externalAdId: true,
      plataforma: true,
      tenantId: true,
    },
  });

  logger.info(
    { count: candidates.length },
    '[ads-publication-repoll] Found PROGRAMADA Google publications',
  );
  console.log(
    `[ads-publication-repoll] Found ${candidates.length} PROGRAMADA Google publications`,
  );

  if (candidates.length === 0) {
    return { ...stats, durationMs: Date.now() - startTime };
  }

  const connector = new GoogleAdsConnector();

  for (const pub of candidates) {
    stats.totalChecked++;
    try {
      // The publication row doesn't store AdPlatformConnection.id directly —
      // resolve it via (tenantId, plataforma, status=CONNECTED). Order by
      // lastSyncedAt desc so when multiple CONNECTED accounts exist for the
      // same tenant+platform, we hit the most recently used one first.
      const conn = await prisma.adPlatformConnection.findFirst({
        where: {
          tenantId: pub.tenantId,
          platform: pub.plataforma,
          status: 'CONNECTED',
        },
        select: { id: true },
        orderBy: { lastSyncedAt: 'desc' },
      });
      if (!conn) {
        stats.errors++;
        console.error(
          `[ads-publication-repoll] ✗ ${pub.id} (tenant ${pub.tenantId}) sin AdPlatformConnection CONNECTED para plataforma=GOGLE. Revisa la conexión o móstrala como EXPIRED.`,
        );
        continue;
      }
      const platformId = conn.id;

      const policy = await connector.recheckGooglePolicy({
        externalAdId: pub.externalAdId!,
        platformId,
      });

      if (APPROVED_STATUSES.has(policy.approvalStatus)) {
        // recheckGooglePolicy already self-refreshed on GoogleAuthError; if
        // resumePublication ALSO expires mid-batch the outer try/catch picks
        // it up as stats.errors — row stays PROGRAMADA for next cron.
        await connector.resumePublication({
          externalAdId: pub.externalAdId!,
          platformId,
        });

        const flipped = await prisma.adsCampaignPublication.updateMany({
          where: { id: pub.id, estado: 'PROGRAMADA' },
          data: {
            estado: 'PUBLICADA',
            externalStatus: 'ACTIVE',
          },
        });
        if (flipped.count === 0) {
          stats.racedOrSkipped++;
          console.log(
            `[ads-publication-repoll] ↷ ${pub.id} Google ACTIVE but DB row already non-PROGRAMADA — leaving untouched`,
          );
        } else {
          stats.flippedToPublicada++;
          console.log(
            `[ads-publication-repoll] ✓ ${pub.id} (tenant ${pub.tenantId}) flipped to PUBLICADA — approvalStatus=${policy.approvalStatus}, adGroupAd.status=${policy.adGroupAdStatus}`,
          );
        }
      } else if (REJECTED_STATUSES.has(policy.approvalStatus)) {
        const flipped = await prisma.adsCampaignPublication.updateMany({
          where: { id: pub.id, estado: 'PROGRAMADA' },
          data: {
            estado: 'ERROR',
            externalStatus: 'REJECTED',
            errorMessage: `Google policy ${policy.approvalStatus} al re-polear (adGroupAd.status=${policy.adGroupAdStatus ?? 'unknown'})`,
          },
        });
        if (flipped.count === 0) {
          stats.racedOrSkipped++;
          console.log(
            `[ads-publication-repoll] ↷ ${pub.id} already non-PROGRAMADA at ERROR flip — leaving untouched`,
          );
        } else {
          stats.flippedToError++;
          console.warn(
            `[ads-publication-repoll] ⚠ ${pub.id} (tenant ${pub.tenantId}) flipped to ERROR — approvalStatus=${policy.approvalStatus}`,
          );
        }
      } else {
        stats.stillPending++;
      }
    } catch (err: any) {
      stats.errors++;
      console.error(
        `[ads-publication-repoll] ✗ ${pub.id} (tenant ${pub.tenantId}) failed: ${err.message ?? err}`,
      );
      // Do NOT flip state — leave in PROGRAMADA so next cron retries.
    }
  }

  stats.durationMs = Date.now() - startTime;
  logger.info(stats, '[ads-publication-repoll] Finished batch');
  console.log(`[ads-publication-repoll] Finished: ${JSON.stringify(stats)}`);
  return stats;
}
