#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Volkern ERP — E2E All Suites
#
# Ejecuta todas las suites E2E (tab-sync + reconciliation) y agrega los
# resultados. Cada suite maneja su propio seed, servidor y cleanup.
#
# Uso:
#   bash scripts/run-e2e-all.sh
#   PORT=3100 bash scripts/run-e2e-all.sh
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Config ──────────────────────────────────────────────────────────────────
PORT="${PORT:-3099}"
TAB_SYNC_SCRIPT="scripts/run-e2e-tab-sync-ci.sh"
RECON_SCRIPT="scripts/run-e2e-reconciliation-ci.sh"
TOTAL_PASS=0
TOTAL_FAIL=0
START_TIME=$(date +%s)

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

header() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}\n"; }
info()  { echo -e "  ${CYAN}→${NC} $1"; }
pass()  { echo -e "  ${GREEN}✔${NC} $1"; }

# ─── Resolve directory ───────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

# ─── Prerequisites ────────────────────────────────────────────────────────────
header "E2E All Suites — Prerequisites"

for cmd in bash curl node npx lsof python3; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "  ${RED}✘${NC} $cmd not found — please install it"
    exit 1
  fi
done
pass "All prerequisite commands available"

# ─── Verify individual scripts exist ──────────────────────────────────────────
MISSING=""
for script in "$TAB_SYNC_SCRIPT" "$RECON_SCRIPT"; do
  if [ ! -f "$script" ]; then
    MISSING="$MISSING\n  - $script"
  fi
done
if [ -n "$MISSING" ]; then
  echo -e "  ${RED}✘${NC} Missing scripts:$MISSING"
  exit 1
fi
pass "All E2E scripts found"

info "PORT=${PORT}"
info "Running as: $(whoami)"
info "Node: $(node -v)"
echo ""

# ─── Run Suites ───────────────────────────────────────────────────────────────
SUITE_RESULTS=""

run_suite() {
  local name="$1"
  local script="$2"
  local start elapsed exit_code

  echo -e "${BOLD}────────────────────────────────────────────────────────────${NC}"
  echo -e "${BOLD}  Suite: ${name}${NC}"
  echo -e "${BOLD}  Script: ${script}${NC}"
  echo -e "${BOLD}────────────────────────────────────────────────────────────${NC}"

  start=$(date +%s)

  # Run the suite, capture stdout+stderr, tee to show in real-time
  # Use a temp file to capture exit code reliably
  set +e
  PORT="$PORT" bash "$script"
  exit_code=$?
  set -euo pipefail

  elapsed=$(( $(date +%s) - start ))

  if [ "$exit_code" -eq 0 ]; then
    echo -e "\n  ${GREEN}✔ Suite '${name}' PASSED (${elapsed}s)${NC}"
  else
    echo -e "\n  ${RED}✘ Suite '${name}' FAILED (exit ${exit_code}, ${elapsed}s)${NC}"
  fi

  SUITE_RESULTS="${SUITE_RESULTS}${name}|${exit_code}|${elapsed}"$'\n'
}

# Run tab-sync first
run_suite "Tab/URL Sync" "$TAB_SYNC_SCRIPT"

# Run reconciliation second
run_suite "Bank Reconciliation" "$RECON_SCRIPT"

# ─── Aggregate Results ────────────────────────────────────────────────────────
header "E2E All Suites — Results"

TOTAL_ELAPSED=$(( $(date +%s) - START_TIME ))
SUITE_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

while IFS='|' read -r name exit_code elapsed; do
  [ -z "$name" ] && continue
  SUITE_COUNT=$(( SUITE_COUNT + 1 ))
  if [ "$exit_code" -eq 0 ]; then
    PASS_COUNT=$(( PASS_COUNT + 1 ))
    echo -e "  ${GREEN}✔${NC} ${name} (${elapsed}s)"
  else
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    echo -e "  ${RED}✘${NC} ${name} — exit ${exit_code} (${elapsed}s)"
  fi
done <<< "$SUITE_RESULTS"

echo ""
echo -e "  ${BOLD}Total suites:${NC} ${SUITE_COUNT}"
echo -e "  ${GREEN}Passed: ${PASS_COUNT}${NC}"
echo -e "  ${RED}Failed: ${FAIL_COUNT}${NC}"
echo -e "  ${BOLD}Elapsed:${NC} ${TOTAL_ELAPSED}s"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}✓ All E2E suites passed!${NC}"
  exit 0
else
  echo -e "${RED}✘ ${FAIL_COUNT} suite(s) failed${NC}"
  exit 1
fi
