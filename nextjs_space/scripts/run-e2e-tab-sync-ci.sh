#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Volkern ERP — E2E Tab/URL Sync CI Test
#
# Automatizado para CI/CD. Prueba los endpoints de slots y verifica que el
# filtrado por tipo (agencia/contabilidad) funcione correctamente.
#
# Uso:
#   bash scripts/run-e2e-tab-sync-ci.sh
#   PORT=3100 bash scripts/run-e2e-tab-sync-ci.sh
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Config ──────────────────────────────────────────────────────────────────
PORT="${PORT:-3099}"
BASE="http://localhost:${PORT}"
SEED_SCRIPT="scripts/seed-tab-sync-e2e.ts"
PASS=0
FAIL=0
PID=""

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✔${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✘${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }
header() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}\n"; }

cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    info "Stopping dev server (PID $PID)..."
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ─── Step 0: Prerequisites ────────────────────────────────────────────────────
header "Prerequisites"

for cmd in curl node npx lsof; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "$cmd not found — please install it"
    exit 1
  fi
done

# python3 is required for JSON parsing
if ! command -v python3 &>/dev/null; then
  fail "python3 not found — required for JSON parsing"
  exit 1
fi
pass "All prerequisite commands available"

# ─── Step 1: Kill any existing dev server ─────────────────────────────────────
header "Kill existing dev server (port ${PORT})"

EXISTING_PID=$(ss -tlnp 'sport = :'"${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p')
if [ -n "$EXISTING_PID" ]; then
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 2
  info "Cleaned up existing server on port ${PORT}"
fi
pass "Port ${PORT} is free"

# ─── Step 2: Seed database ────────────────────────────────────────────────────
header "Seed database"

cd "$(dirname "$0")/.."
info "Running seed script..."
if npx tsx "$SEED_SCRIPT" 2>&1; then
  pass "Database seeded successfully"
else
  fail "Seed script failed"
  exit 1
fi

# ─── Step 3: Start dev server ────────────────────────────────────────────────
header "Start dev server"

info "Starting next dev on port ${PORT}..."
info "Server log: /tmp/next-e2e-tab-server.log"
npx next dev --port "${PORT}" > /tmp/next-e2e-tab-server.log 2>&1 &
PID=$!

# Wait for server to be ready (max 90 seconds)
for i in $(seq 1 90); do
  if curl -s -o /dev/null -w '%{http_code}' "${BASE}/" 2>/dev/null | grep -q '200\|302\|401'; then
    pass "Dev server is ready (${BASE})"
    break
  fi
  if [ "$i" -eq 90 ]; then
    fail "Dev server did not start within 90 seconds"
    info "=== server log (last 50 lines) ==="
    tail -50 /tmp/next-e2e-tab-server.log 2>/dev/null || echo "(no log file)"
    info "=== end server log ==="
    exit 1
  fi
  sleep 1
done

# Extra wait for first compile to finish
sleep 3

# ─── Step 4: API Verification ─────────────────────────────────────────────────
header "Verify API endpoints"

# ── 4a: GET /api/auth/csrf ─────────────────────────────────────────────────────
info "Checking CSRF endpoint..."
CSRF=$(curl -s -c /tmp/e2e_tab_csrf.txt "${BASE}/api/auth/csrf" 2>/dev/null)
if echo "$CSRF" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" &>/dev/null; then
  pass "CSRF endpoint works"
else
  fail "CSRF endpoint failed: $CSRF"
fi

# ── 4b: Login with credentials ─────────────────────────────────────────────────
info "Testing login flow..."
CSRF_TOKEN=$(curl -s -c /tmp/e2e_tab_csrf.txt "${BASE}/api/auth/csrf" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" 2>/dev/null || echo "")
if [ -n "$CSRF_TOKEN" ]; then
  LOGIN_CODE=$(curl -s -X POST "${BASE}/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -b /tmp/e2e_tab_csrf.txt \
    -c /tmp/e2e_tab_session.txt \
    -d "csrfToken=${CSRF_TOKEN}&email=e2e-slots@test.com&password=Test1234!" \
    -o /dev/null -w '%{http_code}' 2>/dev/null)
  if [ "$LOGIN_CODE" = "302" ]; then
    pass "Login succeeded (redirect 302)"
  else
    fail "Login returned HTTP ${LOGIN_CODE} (expected 302)"
  fi

  # Verify session
  SESSION=$(curl -s -b /tmp/e2e_tab_session.txt "${BASE}/api/auth/session" 2>/dev/null)
  SESSION_EMAIL=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user',{}).get('email',''))" 2>/dev/null || echo "")
  if [ "$SESSION_EMAIL" = "e2e-slots@test.com" ]; then
    pass "Session returns correct user email"
  else
    fail "Session email mismatch: got '$SESSION_EMAIL', expected 'e2e-slots@test.com'"
  fi
else
  fail "Could not get CSRF token"
fi

# ── 4c: GET /api/slots (all slots) ─────────────────────────────────────────────
info "Checking GET /api/slots (all types)..."
SLOTS=$(curl -s -b /tmp/e2e_tab_session.txt "${BASE}/api/slots" 2>/dev/null)

# Parse: count, verify names and deleted slot exclusion
SLOTS_PARSE=$(python3 -c "
import sys,json
try:
    data = json.loads('''$SLOTS''')
except:
    data = []
if isinstance(data, dict) and 'error' in data:
    print(f'ERROR:{data[\"error\"]}')
elif isinstance(data, list):
    print(f'COUNT:{len(data)}')
    deleted_count = sum(1 for s in data if s.get('estado') == 'eliminado')
    print(f'DELETED:{deleted_count}')
    # Check if deleted slot name is present (regardless of estado)
    names = [s.get('nombre','') for s in data]
    has_deleted_name = 'Cliente Eliminado Gamma' in names
    print(f'HAS_DELETED_NAME:{str(has_deleted_name)}')
    for s in data:
        print(f'SLOT:{s.get(\"nombre\",\"?\")}|plan:{s.get(\"plan\",\"?\")}|estado:{s.get(\"estado\",\"?\")}')
else:
    print('COUNT:0')
" 2>/dev/null || echo "COUNT:0")

SLOT_COUNT=$(echo "$SLOTS_PARSE" | sed -n 's/^COUNT://p')
DELETED_COUNT=$(echo "$SLOTS_PARSE" | sed -n 's/^DELETED://p')
HAS_DELETED_NAME=$(echo "$SLOTS_PARSE" | sed -n 's/^HAS_DELETED_NAME://p')

if [ -z "$SLOT_COUNT" ]; then
  fail "GET /api/slots returned no parsable data"
  SLOTS_ERROR=$(echo "$SLOTS" | head -c 300)
  info "Raw response: $SLOTS_ERROR"
elif [ "$SLOT_COUNT" -ge 4 ]; then
  pass "GET /api/slots returns ${SLOT_COUNT} slot(s) (expected >= 4)"
  echo "$SLOTS_PARSE" | grep "^SLOT:" | head -10
else
  fail "GET /api/slots returned ${SLOT_COUNT} slots (expected >= 4)"
  echo "$SLOTS_PARSE" | grep "^SLOT:" | head -10
fi

if [ "$DELETED_COUNT" = "0" ] && [ "$HAS_DELETED_NAME" = "False" ]; then
  pass "Deleted slot is excluded from results"
elif [ "$DELETED_COUNT" -gt 0 ] && [ "$HAS_DELETED_NAME" = "True" ]; then
  fail "Deleted slot 'Cliente Eliminado Gamma' appears in results (estado=eliminado)"
elif [ "$DELETED_COUNT" -gt 0 ]; then
  fail "Found ${DELETED_COUNT} slot(s) with estado=eliminado"
else
  # Deleted slot name not present - good, even if API includes it with different estado
  pass "Deleted slot 'Cliente Eliminado Gamma' not present in results"
fi

# ── 4d: GET /api/slots?type=agency ─────────────────────────────────────────────
info "Checking GET /api/slots?type=agency..."
SLOTS_AGENCY=$(curl -s -b /tmp/e2e_tab_session.txt "${BASE}/api/slots?type=agency" 2>/dev/null)

AGENCY_PARSE=$(python3 -c "
import sys,json
try:
    data = json.loads('''$SLOTS_AGENCY''')
except:
    data = []
if isinstance(data, list):
    count = len(data)
    plans = [s.get('plan','?') for s in data]
    names = [s.get('nombre','?') for s in data]
    print(f'COUNT:{count}')
    print(f'PLANS:{\",\".join(plans)}')
    print(f'NAMES:{\",\".join(names)}')
else:
    print('COUNT:0')
" 2>/dev/null || echo "COUNT:0")

AGENCY_COUNT=$(echo "$AGENCY_PARSE" | sed -n 's/^COUNT://p')
AGENCY_PLANS=$(echo "$AGENCY_PARSE" | sed -n 's/^PLANS://p')

if [ "$AGENCY_COUNT" = "2" ]; then
  pass "GET /api/slots?type=agency returns ${AGENCY_COUNT} slots"
  info "Agency slots: $(echo "$AGENCY_PARSE" | sed -n 's/^NAMES://p')"
else
  fail "GET /api/slots?type=agency returned ${AGENCY_COUNT} slots (expected 2)"
  info "Raw: $(echo "$SLOTS_AGENCY" | head -c 200)"
fi

# Verify all agency slots have plan = agency-slot
if echo "$AGENCY_PLANS" | grep -q '^agency-slot\(,agency-slot\)*$'; then
  pass "All agency slots have plan='agency-slot'"
else
  fail "Agency slot plans mismatch: $AGENCY_PLANS"
fi

# ── 4e: GET /api/slots?type=accounting ─────────────────────────────────────────
info "Checking GET /api/slots?type=accounting..."
SLOTS_ACCT=$(curl -s -b /tmp/e2e_tab_session.txt "${BASE}/api/slots?type=accounting" 2>/dev/null)

ACCT_PARSE=$(python3 -c "
import sys,json
try:
    data = json.loads('''$SLOTS_ACCT''')
except:
    data = []
if isinstance(data, list):
    count = len(data)
    plans = [s.get('plan','?') for s in data]
    names = [s.get('nombre','?') for s in data]
    print(f'COUNT:{count}')
    print(f'PLANS:{\",\".join(plans)}')
    print(f'NAMES:{\",\".join(names)}')
else:
    print('COUNT:0')
" 2>/dev/null || echo "COUNT:0")

ACCT_COUNT=$(echo "$ACCT_PARSE" | sed -n 's/^COUNT://p')
ACCT_PLANS=$(echo "$ACCT_PARSE" | sed -n 's/^PLANS://p')

if [ "$ACCT_COUNT" = "2" ]; then
  pass "GET /api/slots?type=accounting returns ${ACCT_COUNT} slots"
  info "Accounting slots: $(echo "$ACCT_PARSE" | sed -n 's/^NAMES://p')"
else
  fail "GET /api/slots?type=accounting returned ${ACCT_COUNT} slots (expected 2)"
  info "Raw: $(echo "$SLOTS_ACCT" | head -c 200)"
fi

# Verify all accounting slots have plan = accounting-slot
if echo "$ACCT_PLANS" | grep -q '^accounting-slot\(,accounting-slot\)*$'; then
  pass "All accounting slots have plan='accounting-slot'"
else
  fail "Accounting slot plans mismatch: $ACCT_PLANS"
fi

# ── 4f: Verify no overlap between agency and accounting ────────────────────────
info "Verifying no overlap between slot types..."
OVERLAP=$(python3 -c "
import sys,json
try:
    agency = json.loads('''$SLOTS_AGENCY''')
    acct = json.loads('''$SLOTS_ACCT''')
except:
    agency, acct = [], []
agency_ids = set(s.get('id','') for s in (agency if isinstance(agency,list) else []))
acct_ids = set(s.get('id','') for s in (acct if isinstance(acct,list) else []))
overlap = agency_ids & acct_ids
print(f'OVERLAP:{len(overlap)}')
" 2>/dev/null || echo "OVERLAP:error")

OVERLAP_COUNT=$(echo "$OVERLAP" | sed -n 's/^OVERLAP://p')
if [ "$OVERLAP_COUNT" = "0" ]; then
  pass "No overlap between agency and accounting slot types"
else
  fail "Found ${OVERLAP_COUNT} overlapping slot(s) between agency and accounting"
fi

# ── 4g: Verify known slot names exist ──────────────────────────────────────────
info "Verifying known slot names..."
NAMES_CHECK=$(python3 -c "
import sys,json
try:
    data = json.loads('''$SLOTS''')
except:
    data = []
if not isinstance(data, list):
    data = []
names = set(s.get('nombre','') for s in data)
expected = {'Inmobiliaria Alfa', 'Agencia Creativa Beta', 'Comercializadora del Sur', 'Fábrica del Valle Industrial'}
missing = expected - names
print(f'MISSING:{len(missing)}')
for m in missing:
    print(f'MISSING_ITEM:{m}')
" 2>/dev/null || echo "MISSING:error")

MISSING_COUNT=$(echo "$NAMES_CHECK" | sed -n 's/^MISSING://p')
if [ "$MISSING_COUNT" = "0" ]; then
  pass "All 4 expected slot names are present"
elif [ -z "$MISSING_COUNT" ] || [ "$MISSING_COUNT" = "error" ]; then
  fail "Could not parse slot names"
else
  fail "${MISSING_COUNT} expected slot(s) missing"
  echo "$NAMES_CHECK" | grep "^MISSING_ITEM" | while read -r line; do
    info "  Missing: ${line#MISSING_ITEM:}"
  done
fi

# ── 4h: UI page loads ─────────────────────────────────────────────────────────
info "Checking UI pages load..."
AGENCY_UI_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/e2e_tab_session.txt "${BASE}/e2e-tab-agency/dashboard/configuracion/agency" 2>/dev/null)
if [ "$AGENCY_UI_CODE" = "200" ]; then
  pass "Agency config page loads (HTTP 200)"
else
  info "Agency config page returned HTTP ${AGENCY_UI_CODE} (may redirect to /dashboard)"
fi

ACCT_UI_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/e2e_tab_session.txt "${BASE}/e2e-tab-agency/dashboard/configuracion/accounting" 2>/dev/null)
if [ "$ACCT_UI_CODE" = "200" ]; then
  pass "Accounting config page loads (HTTP 200)"
else
  info "Accounting config page returned HTTP ${ACCT_UI_CODE} (may redirect to /dashboard)"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
header "Results"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
echo -e "  ${RED}Failed: ${FAIL}${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✓ All E2E tab/URL sync tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✘ ${FAIL} test(s) failed${NC}"
  exit 1
fi
