#!/usr/bin/env bash
# ============================================================================
# Volkern — Observabilidad: composite index `@@index([tenantId, accion,
# fechaCreacion])` sobre `AuditLog`, en PRODUCCIÓN real (no staging sintético).
#
# Lee el runbook técnico en `docs/CRON-MAINTENANCE.md` §7.3.4.
#
# Diseño: READ-ONLY. NO INSERTs, NO DROP INDEX (el composite está vivo).
#       Cardinal real + EXPLAIN + pg_stat_user_indexes snapshot.
#       Snapshots cada 12h para ventana 24-48h.
#
# Uso:
#   DATABASE_URL="postgres://prod-..." bash scripts/check-auditlog-prod-observability.sh
#   DATABASE_URL="postgres://prod-..." bash scripts/check-auditlog-prod-observability.sh /tmp/snap_t0.jsonl
#   DATABASE_URL="postgres://prod-..." bash scripts/check-auditlog-prod-observability.sh /tmp/snap_tN.jsonl /tmp/snap_t0.jsonl
#   DATABASE_URL="postgres://prod-..." bash scripts/check-auditlog-prod-observability.sh /tmp/snap.jsonl /tmp/snap_t0.jsonl --long-window
#
# Safety (FIX v4):
#   • FIX v3: SET (no SET LOCAL) para auto_explain.
#   • FIX v4: añadir `n_dead_tup` y `pg_class.reltuples` al snapshot para
#     permitir diagnóstico de bloat vs TOAST vs live data (sin necesidad de
#     ejecutar script auxiliar `pgstattuple`).
#   • `idempotent`: misma cardinal del mismo minuto ⇒ safe de re-ejecutar.
#
# Prerequisites:
#   • `psql` instalado y en PATH.
#   • `DATABASE_URL` apuntando a Neon prod (NO staging).
#   • Permisos SELECT sobre `AuditLog`, `Tenant`, `pg_indexes`,
#     `pg_stat_user_indexes`, `pg_stat_user_tables`, `pg_class`.
#   • Long-window mode (`--long-window`): permiso para `SET auto_explain.*`.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SNAPSHOT_FILE="${1:-}"
BASELINE_FILE="${2:-}"
LONG_WINDOW_MODE="${3:-}"

# ─── 1. Cargar DATABASE_URL prod (fallback chain defensivo) ─────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  for envfile in ".env.production" ".env.local" ".env" ".env.example"; do
    if [[ -f "${PROJECT_ROOT}/${envfile}" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "${PROJECT_ROOT}/${envfile}"
      set +a
      if [[ -n "${DATABASE_URL:-}" ]]; then
        echo "▶ DATABASE_URL cargada desde ${envfile}"
        break
      fi
    fi
  done
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL no encontrada." >&2
  exit 1
fi
echo "▶ DATABASE_URL host: $(echo "${DATABASE_URL}" | sed -E 's|.*@([^/]+)/.*|\1|')"

# ─── 2. Pre-flight ──────────────────────────────────────────────────────────
command -v psql >/dev/null 2>&1 || { echo "❌ psql no instalado" >&2; exit 1; }
echo "▶ psql: $(psql --version)"

PERM_OK=$(psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -At -c "
SET statement_timeout = '3s';
SELECT CASE
  WHEN has_table_privilege('\"AuditLog\"', 'SELECT') THEN 'yes'
  ELSE 'no'
END;")
echo "▶ Permiso SELECT sobre \"AuditLog\": ${PERM_OK}"
if [[ "${PERM_OK}" != "yes" ]]; then
  echo "❌ Sin permisos SELECT sobre AuditLog. Aborting." >&2
  exit 1
fi

# ─── 3. Setup tempfile cleanup ──────────────────────────────────────────────
TMP_FILES=()
cleanup() { for f in "${TMP_FILES[@]:-}"; do [[ -f "$f" ]] && rm -f "$f"; done; }
trap cleanup EXIT
mk_tmp() { local f; f=$(mktemp); TMP_FILES+=("$f"); echo "$f"; }

# ─── 4. Cardinal READ-ONLY + JSON snapshot (FIX v4: n_dead_tup + reltuples) ─
echo
echo "══ 4. Cardinal + JSON snapshot (READ-ONLY, con n_dead_tup y reltuples v4) ══"

if [[ -n "${SNAPSHOT_FILE}" ]]; then
  # FIX v4: incluye pg_stat_user_tables.n_dead_tup (bloat vs TOAST) Y
  # pg_class.reltuples (estimación autoritativa de rows, no afectada por
  # ANALYZE reciente) para diagnóstico sin necesidad de pgstattuple.
  CARDINAL_TXT=$(mk_tmp)
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -At <<SQL > "${CARDINAL_TXT}"
SET statement_timeout = '15s';
SET lock_timeout      = '2s';
SELECT json_build_object(
  'captured_at',              to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'auditlog_live_tuples',     COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname='AuditLog'), 0),
  'auditlog_dead_tuples',     COALESCE((SELECT n_dead_tup FROM pg_stat_user_tables WHERE relname='AuditLog'), 0),
  'auditlog_seq_scan',        COALESCE((SELECT seq_scan   FROM pg_stat_user_tables WHERE relname='AuditLog'), 0),
  'auditlog_idx_scan_total',  COALESCE((SELECT idx_scan   FROM pg_stat_user_tables WHERE relname='AuditLog'), 0),
  'auditlog_reltuples_pgclass', COALESCE((SELECT reltuples::bigint FROM pg_class WHERE relname='AuditLog'), 0),
  'auditlog_total_size',      pg_size_pretty(pg_total_relation_size('"AuditLog"')),
  'auditlog_index_size',      pg_size_pretty(pg_indexes_size('"AuditLog"')),
  'auditlog_avg_row_size',    (SELECT pg_size_pretty((pg_total_relation_size('"AuditLog"')::numeric / GREATEST((SELECT reltuples FROM pg_class WHERE relname='AuditLog'), 1))::bigint)),
  'tenant_count',             (SELECT count(*) FROM "Tenant"),
  'top5_tenants_by_rows',     (SELECT json_agg(json_build_object('tenantId', t, 'rows', r) ORDER BY r DESC)
                                 FROM (
                                   SELECT "tenantId" AS t, count(*) AS r
                                     FROM "AuditLog"
                                    GROUP BY "tenantId"
                                    ORDER BY r DESC
                                    LIMIT 5
                                 ) sub),
  'pg_indexes_AuditLog',      (SELECT json_agg(indexname ORDER BY indexname)
                                 FROM pg_indexes WHERE tablename = 'AuditLog'),
  'composite_present',        EXISTS (SELECT 1 FROM pg_indexes
                                       WHERE tablename = 'AuditLog'
                                         AND indexname = 'AuditLog_tenantId_accion_fechaCreacion_idx'),
  'pg_stat_user_indexes',     (SELECT json_agg(json_build_object(
                                 'indexrelname', indexrelname,
                                 'idx_scan',     idx_scan,
                                 'idx_tup_read', idx_tup_read,
                                 'idx_tup_fetch', idx_tup_fetch,
                                 'last_idx_scan', last_idx_scan
                               ) ORDER BY indexrelname)
                                 FROM pg_stat_user_indexes
                                WHERE indexrelname LIKE 'AuditLog_%')
)::text;
SQL

  cat "${CARDINAL_TXT}" > "${SNAPSHOT_FILE}"
  echo "▶ Snapshot saved → ${SNAPSHOT_FILE}"
  cat "${CARDINAL_TXT}"
else
  CARDINAL_PREVIEW=$(psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -At -c "
SET statement_timeout = '5s';
SELECT json_build_object(
  'auditlog_live_tuples',  n_live_tup,
  'auditlog_dead_tuples',  n_dead_tup,
  'auditlog_total_size',   pg_size_pretty(pg_total_relation_size('\"AuditLog\"')),
  'auditlog_reltuples_pgclass', (SELECT reltuples::bigint FROM pg_class WHERE relname='AuditLog'),
  'tenant_count',          (SELECT count(*) FROM \"Tenant\")
)
  FROM pg_stat_user_tables
 WHERE relname = 'AuditLog';")
  echo "▶ Cardinal: ${CARDINAL_PREVIEW}"
fi

# ─── 5. Estado pg_indexes ───────────────────────────────────────────────────
echo
echo "══ 5. Verificar pg_indexes ══"

PG_INDEXES_TXT=$(mk_tmp)
psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -At <<'SQL' > "${PG_INDEXES_TXT}"
SET statement_timeout = '5s';
SELECT indexname
  FROM pg_indexes
 WHERE tablename = 'AuditLog'
 ORDER BY indexname;
SQL
cat "${PG_INDEXES_TXT}"

COMPOSITE_OK=false
if grep -q "^AuditLog_tenantId_accion_fechaCreacion_idx$" "${PG_INDEXES_TXT}"; then
  COMPOSITE_OK=true
  echo "   ✅ composite presente en pg_indexes"
else
  echo "   ❌ composite NO presente — la migración no llegó a prod"
  exit 1
fi

# ─── 6. Tenants representativos ─────────────────────────────────────────────
echo
echo "══ 6. Top-5 tenants representativos ══"

TOP5_TXT=$(mk_tmp)
psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -At <<'SQL' > "${TOP5_TXT}"
SET statement_timeout = '15s';
SELECT "tenantId", count(*) AS rows
  FROM "AuditLog"
 GROUP BY "tenantId"
 ORDER BY rows DESC
 LIMIT 5;
SQL
cat "${TOP5_TXT}"

TOP_TENANT=$(head -1 "${TOP5_TXT}"  | cut -d'|' -f1)
MIDDLE_TENANT=$(sed -n '3p' "${TOP5_TXT}" | cut -d'|' -f1)
BOTTOM_TENANT=$(sed -n '5p' "${TOP5_TXT}" | cut -d'|' -f1)
echo "   Representativos: TOP=${TOP_TENANT:-<n/a>}  MIDDLE=${MIDDLE_TENANT:-<n/a>}  BOTTOM=${BOTTOM_TENANT:-<n/a>}"

# ─── 7. Long-window mode ────────────────────────────────────────────────────
if [[ "${LONG_WINDOW_MODE}" == "--long-window" ]]; then
  echo
  echo "══ 7. Long-window mode: auto_explain session-scoped ══"
  echo "    Conexión persistente ≥24h (auto_explain expira al cerrar psql)."
  if psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -At -c "
SET auto_explain.log_min_duration = '500ms';
SET auto_explain.log_analyze      = 'on';
SET auto_explain.log_buffers      = 'on';
SELECT 'auto_explain_session_accepted'::text;" 2>&1; then
    echo "   ✅ auto_explain session-scoped activado (queries ≥ 500ms)."
  else
    echo "   ⚠️  auto_explain no disponible; sólo §8 manual EXPLAIN será observable."
  fi
fi

# ─── 8. EXPLAIN (no ANALYZE) sobre 3 tenants ───────────────────────────────
echo
echo "══ 8. EXPLAIN (no ANALYZE) — pure plan computation ══"

run_explain() {
  local label="$1"; local tenant="$2"
  [[ -z "${tenant}" || "${tenant}" == "|"* || "${tenant}" == *"|"* ]] && {
    echo "── (${label}) sin tenant representativo, skip. ──"
    return 0
  }
  echo
  echo "── 8.${label} scoreAlertas (count 7d) sobre ${tenant} ──"
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -c "
SET statement_timeout = '15s';
EXPLAIN
SELECT count(*) FROM \"AuditLog\"
WHERE \"tenantId\" = '${tenant}'
  AND accion     = 'COMPLIANCE_BLOCKED'
  AND \"fechaCreacion\" >= NOW() - interval '7 days';"

  echo
  echo "── 8.${label}.b getTrend (latest 1) sobre ${tenant} ──"
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -c "
SET statement_timeout = '15s';
EXPLAIN
SELECT metadata FROM \"AuditLog\"
WHERE \"tenantId\" = '${tenant}'
  AND accion     = 'COMPLIANCE_SCORE'
ORDER BY \"fechaCreacion\" DESC
LIMIT 1;"
}

run_explain "TOP"    "${TOP_TENANT}"
run_explain "MIDDLE" "${MIDDLE_TENANT}"
run_explain "BOTTOM" "${BOTTOM_TENANT}"

# ─── 9. EXPLAIN ANALYZE sobre MIDDLE ───────────────────────────────────────
echo
echo "══ 9. EXPLAIN ANALYZE — latencia real sobre MIDDLE tenant ══"

if [[ -n "${MIDDLE_TENANT}" && "${MIDDLE_TENANT}" != "|"* ]]; then
  echo "── 9.1 scoreAlertas ──"
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -c "
SET statement_timeout = '30s';
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*) FROM \"AuditLog\"
WHERE \"tenantId\" = '${MIDDLE_TENANT}'
  AND accion     = 'COMPLIANCE_BLOCKED'
  AND \"fechaCreacion\" >= NOW() - interval '7 days';"

  echo "── 9.2 getTrend ──"
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=on --pset pager=off --pset footer=off --quiet -c "
SET statement_timeout = '30s';
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT metadata FROM \"AuditLog\"
WHERE \"tenantId\" = '${MIDDLE_TENANT}'
  AND accion     = 'COMPLIANCE_SCORE'
ORDER BY \"fechaCreacion\" DESC
LIMIT 1;"
fi

# ─── 10. Diff contra baseline (FIX v4: incluye n_dead_tup, reltuples, idx_tup_fetch) ──
echo
echo "══ 10. Diff contra baseline ══"
if [[ -n "${BASELINE_FILE}" && -f "${BASELINE_FILE}" && -n "${SNAPSHOT_FILE}" && -f "${SNAPSHOT_FILE}" ]]; then
  echo "▶ Baseline: ${BASELINE_FILE}"
  echo "▶ Snapshot: ${SNAPSHOT_FILE}"
  if command -v jq >/dev/null 2>&1; then
    echo "   Diff campos clave:"
    for field in auditlog_live_tuples auditlog_dead_tuples auditlog_reltuples_pgclass auditlog_seq_scan auditlog_idx_scan_total tenant_count composite_present; do
      BASE=$(jq -r ".${field}" "${BASELINE_FILE}" 2>/dev/null || echo '?')
      NOW=$(jq -r  ".${field}" "${SNAPSHOT_FILE}"  2>/dev/null || echo '?')
      echo "   ${field}: ${BASE} → ${NOW}"
    done
    echo
    echo "   Δ idx_scan + Δ idx_tup_fetch por índice (pg_stat_user_indexes):"
    jq -r '.pg_stat_user_indexes[] | "\(.indexrelname)\t\(.idx_scan)\t\(.idx_tup_fetch)"' "${BASELINE_FILE}" > /tmp/base.idx 2>/dev/null || true
    jq -r '.pg_stat_user_indexes[] | "\(.indexrelname)\t\(.idx_scan)\t\(.idx_tup_fetch)"' "${SNAPSHOT_FILE}"  > /tmp/now.idx  2>/dev/null || true
    if [[ -f /tmp/base.idx && -f /tmp/now.idx ]]; then
      join -t$'\t' /tmp/base.idx /tmp/now.idx | awk -F'\t' '{printf "   %s: idx_scan %s → %s (Δ %d), idx_tup_fetch %s → %s\n", $1, $2, $5, $5-$2, $3, $6}'
      rm -f /tmp/base.idx /tmp/now.idx
    fi
  else
    echo "   ⚠️  jq no instalado, mostrando diff textual:"
    diff "${BASELINE_FILE}" "${SNAPSHOT_FILE}" || true
  fi
else
  echo "   (no baseline_file provided, o snapshot_file no especificado → no diff)"
fi

# ─── 11. Verdict + runbook 24-48h ───────────────────────────────────────────
echo
echo "══ 11. Verdict ══"
if [[ "${COMPOSITE_OK}" == true ]]; then
  echo "✅ PASS-OBSERVABILITY: composite materializado + cardinal real (con n_dead_tup) capturado."
  echo "   Snapshot file: ${SNAPSHOT_FILE:-<no guardado>}"
  echo "   Baseline file: ${BASELINE_FILE:-<ninguno>}"
  echo
  echo "▶ Runbook 24-48h recomendado:"
  echo "   t=0   : $0 /tmp/auditlog_prod_t0.jsonl"
  echo "   t+12h : $0 /tmp/auditlog_prod_t12.jsonl /tmp/auditlog_prod_t0.jsonl"
  echo "   t+24h : $0 /tmp/auditlog_prod_t24.jsonl /tmp/auditlog_prod_t0.jsonl"
  exit 0
else
  echo "❌ FAIL: composite no presente en prod. Verificar migrate deploy antes de continuar."
  exit 1
fi
