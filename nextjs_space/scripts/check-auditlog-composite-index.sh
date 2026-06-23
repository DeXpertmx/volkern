#!/usr/bin/env bash
# ============================================================================
# Volkern — Verifier: composite index `@@index([tenantId, accion, fechaCreacion])`
# sobre el modelo `AuditLog` (Prisma). Mirror de
# `scripts/check-cleanup-attendance-index.sh`.
#
# Comportamiento:
#   • Carga DATABASE_URL con cadena defensiva (.env.local → .env → .env.example).
#   • Ejecuta `scripts/bench/auditlog-composite-index-benchmark.sql` vía psql.
#   • Parsea el output y verifica que ambas queries de `ComplianceScoreService`
#     (`scoreAlertas` + `getTrend`) usan el composite index.
#   • Verifica que el cleanup dejó ZERO filas `bench-2026-07-` (safety assert).
#   • Exit 0 = PASS / Exit 1 = FAIL (cualquier regresión).
#
# Uso:
#   DATABASE_URL="postgres://..." bash scripts/check-auditlog-composite-index.sh
#   bash scripts/check-auditlog-composite-index.sh        # carga .env.local
#
# Auditor: pegar este output verbatim en `docs/CRON-MAINTENANCE.md` §7.3.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SQL_FILE="${SCRIPT_DIR}/bench/auditlog-composite-index-benchmark.sql"

# ─── 1. Cargar DATABASE_URL (defense-in-depth fallback chain) ─────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  for envfile in ".env.local" ".env" ".env.example"; do
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
  echo "❌ DATABASE_URL no encontrada en .env.local / .env / .env.example" >&2
  exit 1
fi
echo "▶ DATABASE_URL host: $(echo "${DATABASE_URL}" | sed -E 's|.*@([^/]+)/.*|\1|')"

# ─── 2. Pre-flight: psql + SQL file ───────────────────────────────────────────
command -v psql >/dev/null 2>&1 || { echo "❌ psql no instalado" >&2; exit 1; }
[[ -f "${SQL_FILE}" ]] || { echo "❌ SQL file no encontrado: ${SQL_FILE}" >&2; exit 1; }

echo "▶ SQL benchmark: ${SQL_FILE}"
echo

# ─── 3. Ejecutar benchmark SQL ───────────────────────────────────────────────
# Capturamos stdout Y stderr para post-procesar.
BENCH_OUTPUT="$(mktemp)"
trap 'rm -f "${BENCH_OUTPUT}"' EXIT

set +e
psql "${DATABASE_URL}" \
  --set ON_ERROR_STOP=on \
  --pset pager=off \
  --pset footer=off \
  --quiet \
  -f "${SQL_FILE}" 2>&1 | tee "${BENCH_OUTPUT}"
PSQL_EXIT=${PIPESTATUS[0]}
set -e

echo
echo "▶ psql exit code: ${PSQL_EXIT}"
if [[ "${PSQL_EXIT}" -ne 0 ]]; then
  echo "❌ FAIL: el benchmark SQL no terminó limpio (psql exit ${PSQL_EXIT})" >&2
  exit 1
fi

# ─── 4. Aserciones del plan de query ──────────────────────────────────────────
echo "▶ Verificando plan de query…"

# scoreAlertas: debe usar Index Only Scan (count(*) sin SELECT *, sin SELECT metadata)
#   sobre el composite, o Index Scan si el planner necesita leer páginas.
#   Aceptamos ambas variantes — lo crítico es NO ver 'Seq Scan' y NO
#   'Bitmap Heap Scan' (que indicaría filtros row-by-row).
WITH_COMPOSITE='AuditLog_tenantId_accion_fechaCreacion_idx'

COMPLIANCE_BLOCKED_PLAN_OK=true
COMPLIANCE_SCORE_PLAN_OK=true
NO_FALLBACK_OK=true

# psql emite el nombre del índice entre comillas dobles (e.g. `using "AuditLog_..._idx"`).
# El IndexCond que contiene `COMPLIANCE_BLOCKED` o `COMPLIANCE_SCORE` está en la
# línea siguiente, no en la misma línea del `Index Scan using "..."`. Usamos
# `grep -c` para contar ocurrencias y verificar presencia + posición.

# INDEX_USAGE_COUNT = nº de occurrences de `Index (Only)? Scan using "<idx>"`
# en el output. Esperado == 2 (uno por cada query de §3). §4 (sin composite)
# no contribuye porque su plan usa `Bitmap Heap Scan` o `Index Scan Backward
# using "AuditLog_fechaCreacion_idx"` (single-col).
INDEX_USAGE_COUNT=$(grep -cE "Index( Only)? Scan( Backward)? using \"${WITH_COMPOSITE}\"" \
  "${BENCH_OUTPUT}" || true)
if [[ "${INDEX_USAGE_COUNT}" -ge 2 ]]; then
  echo "   ✅ ${INDEX_USAGE_COUNT} ocurrencias de Index Scan sobre ${WITH_COMPOSITE} (≥2 esperado)"
  NO_FALLBACK_OK=true
else
  echo "   ❌ Solo ${INDEX_USAGE_COUNT} ocurrencias (≥2 esperado) — el composite no se usa en ambas queries"
  NO_FALLBACK_OK=false
fi

# scoreAlertas (count) debería usar Index Only Scan (visibilidad-check vía
# Heap Fetches es de facto gratis, ver §7.3 doc).
INDEX_ONLY_SCOREALERTAS=$(grep -cE "Index Only Scan using \"${WITH_COMPOSITE}\"" \
  "${BENCH_OUTPUT}" || true)
if [[ "${INDEX_ONLY_SCOREALERTAS}" -ge 1 ]]; then
  echo "   ✅ scoreAlertas → Index Only Scan (count sin heap fetch innecesario — óptimo)"
  COMPLIANCE_BLOCKED_PLAN_OK=true
else
  echo "   ⚠️  scoreAlertas NO usa Index Only Scan (puede ser Index Scan con Filter; aún OK)"
  COMPLIANCE_BLOCKED_PLAN_OK=false
fi

# getTrend (SELECT metadata ORDER BY fechaCreacion DESC LIMIT 1) debe usar
# Index Scan Backward con Index Cond que incluye tenantId + accion (NO Filter
# row-by-row, que es lo que ocurre con el fallback single-column).
INDEX_BACKWARD_GETTREND=$(grep -cE "Index Scan Backward using \"${WITH_COMPOSITE}\"" \
  "${BENCH_OUTPUT}" || true)
if [[ "${INDEX_BACKWARD_GETTREND}" -ge 1 ]]; then
  echo "   ✅ getTrend → Index Scan Backward sobre ${WITH_COMPOSITE} (sin Filter/Sort extra)"
  COMPLIANCE_SCORE_PLAN_OK=true
else
  echo "   ❌ getTrend NO usa Index Scan Backward sobre ${WITH_COMPOSITE} — verificar fallback"
  COMPLIANCE_SCORE_PLAN_OK=false
fi

# Verificar que la sección 4 (DROP INDEX → SIN composite) muestra degradación
if grep -qE "Seq Scan on \"AuditLog\"|Bitmap Heap Scan" "${BENCH_OUTPUT}"; then
  echo "   ✅ Sección 4 (sin composite) usa Seq Scan/Bitmap Heap (degradación observada)"
else
  echo "   ⚠️  Sin composite el planner puede todavía usar índices single-column"
fi

# ─── 5. Safety assert: cleanup dejó ZERO filas sintéticas ────────────────────
REMAINING="$(psql "${DATABASE_URL}" -At -c "
  SELECT count(*) FROM \"AuditLog\"
   WHERE id LIKE 'bench-2026-07-%'
      OR metadata->>'_bench' = '2026-07';")"
echo "▶ Filas sintéticas residuales: ${REMAINING}"
if [[ "${REMAINING}" != "0" ]]; then
  echo "❌ FAIL: cleanup incompleto. ${REMAINING} filas bench-* residuales" >&2
  exit 1
fi

# ─── 6. Verdict ───────────────────────────────────────────────────────────────
if [[ "${NO_FALLBACK_OK}" == true && \
      "${COMPLIANCE_BLOCKED_PLAN_OK}" == true && \
      "${COMPLIANCE_SCORE_PLAN_OK}" == true ]]; then
  echo
  echo "✅ PASS: el composite ${WITH_COMPOSITE} se usa correctamente."
  echo "   scoreAlertas + getTrend Index Scan/Index Only Scan confirmado."
  echo "   Cleanup correcto: 0 filas sintéticas residuales."
  exit 0
else
  echo
  echo "❌ FAIL: el composite se materializó pero el planner NO lo prefiere."
  echo "   Diagnóstico: dataset de staging demasiado pequeño o ANALYZE stale."
  echo "   Acción: re-ejecutar ANALYZE, revisar cardinal y stats."
  exit 1
fi
