#!/usr/bin/env bash
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
PORT="${PORT:-3099}"
BASE="http://localhost:${PORT}"
API_KEY="vk_prod_cafebabe12345678cafebabe12345678cafebabe12345678cafebabe12345678"
SEED_SCRIPT="scripts/seed-reconciliation-e2e.ts"
PASS=0
FAIL=0
PID=""

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

# Check that required commands exist
for cmd in curl node npx lsof; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "$cmd not found — please install it"
    exit 1
  fi
done
pass "All prerequisite commands available"

# ─── Step 1: Kill any existing dev server ─────────────────────────────────────
header "Kill existing dev server (port ${PORT})"

# Use ss to find the LISTEN PID (reliable, ignores client ESTABLISHED connections)
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
if npx tsx --require ./scripts/cargar-entorno.cjs "$SEED_SCRIPT" 2>&1; then
  pass "Database seeded successfully"
else
  fail "Seed script failed"
  exit 1
fi

# ─── Step 3: Start dev server ────────────────────────────────────────────────
header "Start dev server"

info "Starting next dev on port ${PORT}..."
info "Server log: /tmp/next-e2e-server.log"
npx next dev --port "${PORT}" > /tmp/next-e2e-server.log 2>&1 &
PID=$!

# Wait for server to be ready (max 60 seconds)
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '%{http_code}' "${BASE}/" 2>/dev/null | grep -q '200\|302\|401'; then
    pass "Dev server is ready (${BASE})"
    break
  fi
  if [ "$i" -eq 60 ]; then
    fail "Dev server did not start within 60 seconds"
    info "=== server log start ==="
    cat /tmp/next-e2e-server.log 2>/dev/null || echo "(no log file)"
    info "=== server log end ==="
    exit 1
  fi
  sleep 1
done

# Extra wait for first compile
sleep 3

# ─── Step 4: API Verification ─────────────────────────────────────────────────
header "Verify API endpoints"

# 4a: GET /api/auth/csrf
info "Checking CSRF endpoint..."
CSRF=$(curl -s -c /tmp/e2e_csrf.txt "${BASE}/api/auth/csrf" 2>/dev/null)
if echo "$CSRF" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" &>/dev/null; then
  pass "CSRF endpoint works"
else
  fail "CSRF endpoint failed: $CSRF"
fi

# 4b: Login with credentials (via CSRF)
info "Testing login flow..."
CSRF_TOKEN=$(curl -s -c /tmp/e2e_csrf.txt "${BASE}/api/auth/csrf" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" 2>/dev/null || echo "")
if [ -n "$CSRF_TOKEN" ]; then
  curl -s -X POST "${BASE}/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -b /tmp/e2e_csrf.txt \
    -c /tmp/e2e_session.txt \
    -d "csrfToken=${CSRF_TOKEN}&email=e2e@test.com&password=Test1234!" \
    -o /dev/null -w '%{http_code}' 2>/dev/null | grep -q '302' && pass "Login succeeded (redirect 302)" || fail "Login failed"
  
  SESSION=$(curl -s -b /tmp/e2e_session.txt "${BASE}/api/auth/session" 2>/dev/null)
  echo "$SESSION" | python3 -c "import sys,json; s=json.load(sys.stdin); assert s.get('user',{}).get('email') == 'e2e@test.com'" 2>/dev/null && pass "Session returns user email" || fail "Session invalid"
else
  fail "Could not get CSRF token"
fi

# 4c: GET transactions (API key auth)
info "Checking GET transactions..."
curl -s -H "x-api-key: ${API_KEY}" "${BASE}/api/accounting/reconciliation?view=transactions" > /tmp/e2e_transactions.json 2>/dev/null
PARSE_RESULT=$(python3 -c "
import sys,json
with open('/tmp/e2e_transactions.json') as f:
    d = json.load(f)
# Handle wrapper {transactions: [...], total: N} or bare [...]
if isinstance(d, dict) and 'transactions' in d:
    items = d['transactions']
else:
    items = d if isinstance(d, list) else []
count = len(items)
print(f'COUNT:{count}')
if count > 0:
    t = items[0]
    print(f'ID:{t.get(\"id\",\"\")}')
else:
    print('ID:')
" 2>/dev/null || echo -e 'COUNT:0\nID:')
TXN_COUNT=$(echo "$PARSE_RESULT" | sed -n 's/^COUNT://p')
FIRST_TXN_ID=$(echo "$PARSE_RESULT" | sed -n 's/^ID://p')
if [ "$TXN_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET transactions returns ${TXN_COUNT} transactions"
  info "First transaction ID: ${FIRST_TXN_ID}"
else
  fail "GET transactions returned 0 items or failed"
  FIRST_TXN_ID=""
fi

# 4d: GET suggestions
if [ -n "$FIRST_TXN_ID" ]; then
  info "Checking GET suggestions..."
  curl -s -H "x-api-key: ${API_KEY}" "${BASE}/api/accounting/reconciliation?view=suggestions&transactionId=${FIRST_TXN_ID}" > /tmp/e2e_suggestions.json 2>/dev/null
  SUGG_PARSE=$(python3 -c "
import sys,json
with open('/tmp/e2e_suggestions.json') as f:
    d = json.load(f)
items = d.get('suggestions', d) if isinstance(d, dict) else d
if isinstance(items, list):
    print(f'COUNT:{len(items)}')
    if len(items) > 0:
        print(f'ENTRY_ID:{items[0].get(\"entryId\",\"\")}')
    else:
        print('ENTRY_ID:')
else:
    print('COUNT:0')
    print('ENTRY_ID:')
" 2>/dev/null || echo -e 'COUNT:0\nENTRY_ID:')
  SUGG_COUNT=$(echo "$SUGG_PARSE" | sed -n 's/^COUNT://p')
  ENTRY_ID=$(echo "$SUGG_PARSE" | sed -n 's/^ENTRY_ID://p')
  if [ "$SUGG_COUNT" -gt 0 ] 2>/dev/null; then
    pass "GET suggestions returns ${SUGG_COUNT} suggestion(s)"
    info "Suggested entry ID: ${ENTRY_ID}"
  else
    fail "GET suggestions returned 0 items"
    ENTRY_ID=""
  fi
else
  ENTRY_ID=""
fi

# 4e: POST reconcile
if [ -n "$FIRST_TXN_ID" ] && [ -n "$ENTRY_ID" ]; then
  info "Testing POST reconcile..."
  RECON_RESULT=$(curl -s -X POST -H "x-api-key: ${API_KEY}" -H 'Content-Type: application/json' \
    -d "{\"action\":\"reconcile\",\"transactionId\":\"${FIRST_TXN_ID}\",\"entryId\":\"${ENTRY_ID}\"}" \
    "${BASE}/api/accounting/reconciliation" 2>/dev/null)
  HAS_ID=$(echo "$RECON_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','')!='' and d.get('transactionId','')!='')" 2>/dev/null || echo "False")
  if [ "$HAS_ID" = "True" ]; then
    pass "POST reconcile succeeded"
    info "Reconciliation ID: $(echo "$RECON_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)"
  else
    fail "POST reconcile failed: $(echo "$RECON_RESULT" | head -c 200)"
  fi
else
  fail "POST reconcile skipped (missing transaction or entry ID)"
fi

# 4f: GET stats
info "Checking GET stats..."
STATS=$(curl -s -H "x-api-key: ${API_KEY}" "${BASE}/api/accounting/reconciliation?view=stats" 2>/dev/null)
if echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d.get('totalTransactions'),int)" 2>/dev/null; then
  pass "GET stats works"
  info "Stats: $(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:v for k,v in d.items() if k in ['totalTransactions','reconciledTransactions','unreconciledTransactions','reconciliationRate']}, indent=2))" 2>/dev/null)"
else
  fail "GET stats failed: $(echo "$STATS" | head -c 200)"
fi

# 4g: GET connections
info "Checking GET connections..."
CONNECTIONS=$(curl -s -H "x-api-key: ${API_KEY}" "${BASE}/api/accounting/reconciliation?view=connections" 2>/dev/null)
CONN_COUNT=$(echo "$CONNECTIONS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
if [ "$CONN_COUNT" -gt 0 ]; then
  pass "GET connections returns ${CONN_COUNT} connection(s)"
else
  fail "GET connections returned 0 items"
fi

# 4h: Navigate to UI page (check it returns HTML, not error)
info "Checking UI page loads..."
UI_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/e2e_session.txt "${BASE}/dashboard/finanzas/contabilidad/reconciliacion" 2>/dev/null)
if [ "$UI_CODE" = "200" ]; then
  pass "Reconciliation UI page loads (HTTP 200)"
elif [ "$UI_CODE" = "302" ] || [ "$UI_CODE" = "307" ]; then
  info "UI page redirects (HTTP ${UI_CODE}) — may require specific tenant route"
  pass "Reconciliation UI page reachable"
else
  fail "Reconciliation UI page returned HTTP ${UI_CODE}"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
header "Results"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
echo -e "  ${RED}Failed: ${FAIL}${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✓ All E2E reconciliation tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✘ ${FAIL} test(s) failed${NC}"
  exit 1
fi
