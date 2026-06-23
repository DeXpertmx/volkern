#!/usr/bin/env bash
# =============================================================================
# scripts/check-cleanup-attendance-index.sh
#
# Verifica automáticamente que el cron `cleanup-attendance` usa el composite
# index `@@index([tenantId, timestamp])` mediante Index Scan (no Bitmap Heap
# Scan). Pensado para CI / pre-deploy.
#
# USO:
#   $ DATABASE_URL="postgres://user:pass@host:5432/db" \
#       bash scripts/check-cleanup-attendance-index.sh
#
# EXIT CODES:
#   0  → plan correcto (Index Scan usando Attendance_tenantId_timestamp_idx).
#   1  → regresión detectada (Bitmap Heap Scan, Seq Scan, o índice ausente).
#   2  → setup inválido (psql no instalado, DATABASE_URL ausente).
#
# DEPENDENCIAS:
#   • psql (Postgres client)
# =============================================================================

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ ERROR: DATABASE_URL no está definida en el entorno." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ ERROR: 'psql' no está instalado en el PATH." >&2
  exit 2
fi

SQL_FILE="$(dirname "$0")/verify-cleanup-attendance-index.sql"
if [[ ! -f "$SQL_FILE" ]]; then
  echo "❌ ERROR: no se encuentra $SQL_FILE" >&2
  exit 2
fi

echo "▶ Ejecutando EXPLAIN ANALYZE contra la base de datos..."
EXPLAIN_OUTPUT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE" 2>&1 || true)"

echo "$EXPLAIN_OUTPUT"
echo
echo "▶ Verificando plan de query..."

# ── Regex esperados para el plan ganador ──────────────────────────────
# Prisma genera el nombre del índice usando el @map table name (snake_case),
# NO el model name (PascalCase). Para `Attendance` con `@map("erp_attendance_logs")`,
# el composite `@@index([tenantId, timestamp])` se llamaría `erp_attendance_logs_tenantId_timestamp_idx`.
# Precedente en repo: `system_metrics_tenantId_metricType_timestamp_idx` en
# `prisma/migrations/20260601091455_add_catalogoItemId_to_deal/migration.sql`.
# Aceptamos ambas variantes (PascalCase legacy opcional + snake_case autoritativa)
# para ser defensivos contra futuras versiones de Prisma Client.
EXPECTED_INDEX_PATTERN='Index Scan using (Attendance|erp_attendance_logs)_tenantId_timestamp_idx'
EXPECTED_INDEX_COND_PATTERN='Index Cond:'
INDEX_ORDERBY_PATTERN='ORDER BY "timestamp" ASC'  # sólo dentro del SQL file, sanity

# ── Red flags que indican regresión ────────────────────────────────────
RED_FLAG_BITMAP='Bitmap Heap Scan'
RED_FLAG_SEQSCAN='Seq Scan on erp_attendance_logs'
RED_FLAG_SORT_AFTER_INDEX='^[[:space:]]*Sort[[:space:]]'

PASS=true

if ! grep -qE "$EXPECTED_INDEX_PATTERN" <<<"$EXPLAIN_OUTPUT"; then
  echo "  ❌ NO se detecta '$EXPECTED_INDEX_PATTERN' en el plan."
  PASS=false
else
  echo "  ✅ '$EXPECTED_INDEX_PATTERN' presente."
fi

if ! grep -qE "$EXPECTED_INDEX_COND_PATTERN" <<<"$EXPLAIN_OUTPUT"; then
  echo "  ❌ NO se detecta 'Index Cond:' (el predicate no se está empujando al índice)."
  PASS=false
else
  echo "  ✅ 'Index Cond:' presente (predicate pushed down)."
fi

if grep -qE "$RED_FLAG_BITMAP" <<<"$EXPLAIN_OUTPUT"; then
  echo "  ❌ REGRESIÓN: aparece '$RED_FLAG_BITMAP' (índice no se está usando)."
  PASS=false
else
  echo "  ✅ Sin '$RED_FLAG_BITMAP' (plan óptimo)."
fi

if grep -qE "$RED_FLAG_SEQSCAN" <<<"$EXPLAIN_OUTPUT"; then
  echo "  ❌ REGRESIÓN: aparece '$RED_FLAG_SEQSCAN' (table scan a escala)."
  PASS=false
else
  echo "  ✅ Sin '$RED_FLAG_SEQSCAN'."
fi

if grep -qE "$RED_FLAG_SORT_AFTER_INDEX" <<<"$EXPLAIN_OUTPUT"; then
  echo "  ⚠️  Encontrado 'Sort' node — posible re-sort en memoria."
  echo "      Si el composite index está bien definido, no debería haber Sort."
  PASS=false
else
  echo "  ✅ Sin Sort node extra (el índice provee orden natural)."
fi

echo
if [[ "$PASS" == true ]]; then
  echo "✅ PASS: el composite index se usa correctamente."
  exit 0
else
  echo "❌ FAIL: el plan de query NO es óptimo. Investigar antes de deployar."
  exit 1
fi
