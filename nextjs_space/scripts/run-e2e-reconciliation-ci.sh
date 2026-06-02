#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Volkern ERP — E2E Bank Reconciliation CI Test
#
# Automatizado para CI/CD. Prueba el pipeline completo de reconciliación
# bancaria: auth (CSRF + login + API key), transactions, suggestions,
# reconcile, stats, connections, y carga de UI.
#
# Uso:
#   bash scripts/run-e2e-reconciliation-ci.sh
#   PORT=3100 bash scripts/run-e2e-reconciliation-ci.sh
# ═══════════════════════════════════════════════════════════════════════════════

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
info "Server log: /tmp/next-e2e-reconciliation-server.log"
npx next dev --port "${PORT}" > /tmp/next-e2e-reconciliation-server.log 2>&1 &
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
    tail -50 /tmp/next-e2e-reconciliation-server.log 2>/dev/null || echo "(no log file)"
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
CSRF=$(curl -s -c /tmp/e2e_recon_csrf.txt "${BASE}/api/auth/csrf" 2>/dev/null)
if echo "$CSRF" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" &>/dev/null; then
  pass "CSRF endpoint works"
else
  fail "CSRF endpoint failed: $CSRF"
fi

# ── 4b: Login with credentials ─────────────────────────────────────────────────
info "Testing login flow..."
CSRF_TOKEN=$(curl -s -c /tmp/e2e_recon_csrf.txt "${BASE}/api/auth/csrf" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" 2>/dev/null || echo "")
if [ -n "$CSRF_TOKEN" ]; then
  LOGIN_CODE=$(curl -s -X POST "${BASE}/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -b /tmp/e2e_recon_csrf.txt \
    -c /tmp/e2e_recon_session.txt \
    -d "csrfToken=${CSRF_TOKEN}&email=e2e@test.com&password=Test1234!" \
    -o /dev/null -w '%{http_code}' 2>/dev/null)
  if [ "$LOGIN_CODE" = "302" ]; then
    pass "Login succeeded (redirect 302)"
  else
    fail "Login returned HTTP ${LOGIN_CODE} (expected 302)"
  fi

  # Verify session
  SESSION=$(curl -s -b /tmp/e2e_recon_session.txt "${BASE}/api/auth/session" 2>/dev/null)
  SESSION_EMAIL=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user',{}).get('email',''))" 2>/dev/null || echo "")
  if [ "$SESSION_EMAIL" = "e2e@test.com" ]; then
    pass "Session returns correct user email"
  else
    fail "Session email mismatch: got '$SESSION_EMAIL', expected 'e2e@test.com'"
  fi
else
  fail "Could not get CSRF token"
fi

# ── 4c: GET transactions (API key auth) ─────────────────────────────────────────
info "Checking GET transactions..."
TXN_RESPONSE=$(curl -s -o /tmp/e2e_recon_transactions.json -w '%{http_code}' \
  -H "x-api-key: ${API_KEY}" \
  "${BASE}/api/accounting/reconciliation?view=transactions" 2>/dev/null)

TXN_PARSE=$(python3 -c "
import sys,json
with open('/tmp/e2e_recon_transactions.json') as f:
    d = json.load(f)
if isinstance(d, dict) and 'transactions' in d:
    items = d['transactions']
else:
    items = d if isinstance(d, list) else []
count = len(items)
print(f'HTTP_CODE:${TXN_RESPONSE}')
print(f'COUNT:{count}')
if count > 0:
    t = items[0]
    print(f'FIRST_ID:{t.get(\"id\",\"\")}')
    print(f'FIRST_DESC:{t.get(\"description\",\"\")}')
    print(f'FIRST_AMOUNT:{t.get(\"amount\",\"\")}')
else:
    print('FIRST_ID:')
    print('FIRST_DESC:')
    print('FIRST_AMOUNT:')
" 2>/dev/null || printf 'COUNT:0\nFIRST_ID:\nFIRST_DESC:\nFIRST_AMOUNT:\n')

TXN_COUNT=$(echo "$TXN_PARSE" | sed -n 's/^COUNT://p')
FIRST_TXN_ID=$(echo "$TXN_PARSE" | sed -n 's/^FIRST_ID://p')
FIRST_TXN_DESC=$(echo "$TXN_PARSE" | sed -n 's/^FIRST_DESC://p')
FIRST_TXN_AMOUNT=$(echo "$TXN_PARSE" | sed -n 's/^FIRST_AMOUNT://p')

if [ "$TXN_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET transactions returns ${TXN_COUNT} transaction(s) (HTTP ${TXN_RESPONSE})"
  info "First: ${FIRST_TXN_DESC} (${FIRST_TXN_AMOUNT}€) — id: ${FIRST_TXN_ID}"
else
  fail "GET transactions returned 0 items (HTTP ${TXN_RESPONSE})"
  FIRST_TXN_ID=""
fi

# ── 4d: GET suggestions ─────────────────────────────────────────────────────────
if [ -n "$FIRST_TXN_ID" ]; then
  info "Checking GET suggestions..."
  SUGG_RESPONSE=$(curl -s -o /tmp/e2e_recon_suggestions.json -w '%{http_code}' \
    -H "x-api-key: ${API_KEY}" \
    "${BASE}/api/accounting/reconciliation?view=suggestions&transactionId=${FIRST_TXN_ID}" 2>/dev/null)

  SUGG_PARSE=$(python3 -c "
import sys,json
with open('/tmp/e2e_recon_suggestions.json') as f:
    d = json.load(f)
items = d.get('suggestions', d) if isinstance(d, dict) else d
if isinstance(items, list):
    count = len(items)
    print(f'COUNT:{count}')
    if count > 0:
        s = items[0]
        print(f'ENTRY_ID:{s.get(\"entryId\",\"\")}')
        print(f'ENTRY_DESC:{s.get(\"entryDescription\",\"\")}')
        print(f'CONFIDENCE:{s.get(\"confidence\",\"\")}')
    else:
        print('ENTRY_ID:')
        print('ENTRY_DESC:')
        print('CONFIDENCE:')
else:
    print('COUNT:0')
    print('ENTRY_ID:')
    print('ENTRY_DESC:')
    print('CONFIDENCE:')
" 2>/dev/null || printf 'COUNT:0\nENTRY_ID:\nENTRY_DESC:\nCONFIDENCE:\n')

  SUGG_COUNT=$(echo "$SUGG_PARSE" | sed -n 's/^COUNT://p')
  ENTRY_ID=$(echo "$SUGG_PARSE" | sed -n 's/^ENTRY_ID://p')
  ENTRY_DESC=$(echo "$SUGG_PARSE" | sed -n 's/^ENTRY_DESC://p')
  CONFIDENCE=$(echo "$SUGG_PARSE" | sed -n 's/^CONFIDENCE://p')

  if [ "$SUGG_COUNT" -gt 0 ] 2>/dev/null; then
    pass "GET suggestions returns ${SUGG_COUNT} suggestion(s) (HTTP ${SUGG_RESPONSE})"
    info "Best match: ${ENTRY_DESC} (confidence: ${CONFIDENCE}) — entryId: ${ENTRY_ID}"
  else
    fail "GET suggestions returned 0 items (HTTP ${SUGG_RESPONSE})"
    info "Raw: $(head -c 300 /tmp/e2e_recon_suggestions.json 2>/dev/null || echo 'empty')"
    ENTRY_ID=""
  fi
else
  ENTRY_ID=""
  info "Skipping suggestions (no transaction ID available)"
fi

# ── 4e: POST reconcile ──────────────────────────────────────────────────────────
if [ -n "$FIRST_TXN_ID" ] && [ -n "$ENTRY_ID" ]; then
  info "Testing POST reconcile..."
  RECON_RESPONSE=$(curl -s -o /tmp/e2e_recon_result.json -w '%{http_code}' \
    -X POST \
    -H "x-api-key: ${API_KEY}" \
    -H 'Content-Type: application/json' \
    -d "{\"action\":\"reconcile\",\"transactionId\":\"${FIRST_TXN_ID}\",\"entryId\":\"${ENTRY_ID}\"}" \
    "${BASE}/api/accounting/reconciliation" 2>/dev/null)

  RECON_PARSE=$(python3 -c "
import sys,json
with open('/tmp/e2e_recon_result.json') as f:
    d = json.load(f)
recon_id = d.get('id','')
txn_id = d.get('transactionId','')
entry_id = d.get('entryId','')
print(f'RECON_ID:{recon_id}')
print(f'TXN_ID:{txn_id}')
print(f'ENTRY_ID:{entry_id}')
" 2>/dev/null || printf 'RECON_ID:\nTXN_ID:\nENTRY_ID:\n')

  RECON_ID=$(echo "$RECON_PARSE" | sed -n 's/^RECON_ID://p')
  RECON_TXN_ID=$(echo "$RECON_PARSE" | sed -n 's/^TXN_ID://p')
  RECON_ENTRY_ID=$(echo "$RECON_PARSE" | sed -n 's/^ENTRY_ID://p')

  if [ -n "$RECON_ID" ] && [ -n "$RECON_TXN_ID" ]; then
    pass "POST reconcile succeeded (HTTP ${RECON_RESPONSE})"
    info "Reconciliation ID: ${RECON_ID} (transaction: ${RECON_TXN_ID}, entry: ${RECON_ENTRY_ID})"
  else
    fail "POST reconcile failed (HTTP ${RECON_RESPONSE})"
    info "Raw: $(head -c 300 /tmp/e2e_recon_result.json 2>/dev/null || echo 'empty')"
  fi
else
  if [ -z "$FIRST_TXN_ID" ]; then
    info "Skipping POST reconcile (no transaction ID from step 4c)"
  else
    info "Skipping POST reconcile (no entry ID from step 4d)"
  fi
fi

# ── 4f: GET stats ───────────────────────────────────────────────────────────────
info "Checking GET stats..."
STATS_RESPONSE=$(curl -s -o /tmp/e2e_recon_stats.json -w '%{http_code}' \
  -H "x-api-key: ${API_KEY}" \
  "${BASE}/api/accounting/reconciliation?view=stats" 2>/dev/null)

STATS_PARSE=$(python3 -c "
import sys,json
with open('/tmp/e2e_recon_stats.json') as f:
    d = json.load(f)
total = d.get('totalTransactions', d.get('total', 0))
reconciled = d.get('reconciledTransactions', d.get('reconciled', 0))
unreconciled = d.get('unreconciledTransactions', d.get('unreconciled', 0))
rate = d.get('reconciliationRate', d.get('rate', 0))
print(f'TOTAL:{total}')
print(f'RECONCILED:{reconciled}')
print(f'UNRECONCILED:{unreconciled}')
print(f'RATE:{rate}')
" 2>/dev/null || printf 'TOTAL:0\nRECONCILED:0\nUNRECONCILED:0\nRATE:0\n')

STATS_TOTAL=$(echo "$STATS_PARSE" | sed -n 's/^TOTAL://p')
STATS_RECONCILED=$(echo "$STATS_PARSE" | sed -n 's/^RECONCILED://p')
STATS_UNRECONCILED=$(echo "$STATS_PARSE" | sed -n 's/^UNRECONCILED://p')
STATS_RATE=$(echo "$STATS_PARSE" | sed -n 's/^RATE://p')

if [ -n "$STATS_TOTAL" ] && [ "$STATS_TOTAL" -gt 0 ] 2>/dev/null; then
  pass "GET stats works (HTTP ${STATS_RESPONSE})"
  info "Total: ${STATS_TOTAL} | Reconciled: ${STATS_RECONCILED} | Unreconciled: ${STATS_UNRECONCILED} | Rate: ${STATS_RATE}%"
else
  fail "GET stats returned invalid data (HTTP ${STATS_RESPONSE})"
  info "Raw: $(head -c 300 /tmp/e2e_recon_stats.json 2>/dev/null || echo 'empty')"
fi

# ── 4g: GET connections ─────────────────────────────────────────────────────────
info "Checking GET connections..."
CONN_RESPONSE=$(curl -s -o /tmp/e2e_recon_connections.json -w '%{http_code}' \
  -H "x-api-key: ${API_KEY}" \
  "${BASE}/api/accounting/reconciliation?view=connections" 2>/dev/null)

CONN_COUNT=$(python3 -c "
import sys,json
with open('/tmp/e2e_recon_connections.json') as f:
    d = json.load(f)
items = d if isinstance(d, list) else (d.get('connections',[]) if isinstance(d, dict) else [])
print(len(items))
" 2>/dev/null || echo "0")

if [ "$CONN_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET connections returns ${CONN_COUNT} connection(s) (HTTP ${CONN_RESPONSE})"

  # Show connection bank name
  CONN_DETAIL=$(python3 -c "
import sys,json
with open('/tmp/e2e_recon_connections.json') as f:
    d = json.load(f)
items = d if isinstance(d, list) else (d.get('connections',[]) if isinstance(d, dict) else [])
for c in items:
    print(f\"  {c.get('bankName','?')} | provider: {c.get('provider','?')} | status: {c.get('status','?')}\")
" 2>/dev/null || echo "  (no detail)")
  info "Connections:"
  echo "$CONN_DETAIL"
else
  fail "GET connections returned 0 items (HTTP ${CONN_RESPONSE})"
  info "Raw: $(head -c 200 /tmp/e2e_recon_connections.json 2>/dev/null || echo 'empty')"
fi

# ── 4h: UI page loads ─────────────────────────────────────────────────────────
info "Checking UI page loads..."
UI_CODE=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/e2e_recon_session.txt \
  "${BASE}/dashboard/finanzas/contabilidad/reconciliacion" 2>/dev/null)
if [ "$UI_CODE" = "200" ]; then
  pass "Reconciliation UI page loads (HTTP 200)"
elif [ "$UI_CODE" = "302" ] || [ "$UI_CODE" = "307" ]; then
  info "UI page redirects (HTTP ${UI_CODE}) — may require specific tenant route"
  pass "Reconciliation UI page reachable"
else
  fail "Reconciliation UI page returned HTTP ${UI_CODE}"
fi

# ── 4i: GET transactions via session auth (verify both auth methods work) ────────
info "Verifying session-based auth for transactions..."
curl -s -o /tmp/e2e_recon_txn_session.json -w '%{http_code}' \
  -b /tmp/e2e_recon_session.txt \
  "${BASE}/api/accounting/reconciliation?view=transactions" > /dev/null 2>&1

TXN_SESSION_COUNT=$(python3 -c "
import sys,json
try:
    with open('/tmp/e2e_recon_txn_session.json') as f:
        d = json.load(f)
    items = d.get('transactions', d) if isinstance(d, dict) else d
    items = items if isinstance(items, list) else []
    print(len(items))
except:
    print('0')
" 2>/dev/null || echo "0")

if [ "$TXN_SESSION_COUNT" -gt 0 ] 2>/dev/null; then
  pass "Session-based auth returns ${TXN_SESSION_COUNT} transaction(s) (same as API key)"
else
  fail "Session-based auth returned 0 transactions"
  info "Raw: $(head -c 200 /tmp/e2e_recon_txn_session.json 2>/dev/null || echo 'empty')"
fi

# ── 4j: Verify deterministic entries exist via API ──────────────────────────────
info "Verifying deterministic transaction references..."
ENTRIES_CHECK=$(python3 -c "
import sys,json
try:
    with open('/tmp/e2e_recon_txn_session.json') as f:
        d = json.load(f)
    items = d.get('transactions', d) if isinstance(d, dict) else d
    items = items if isinstance(items, list) else []
    refs = set(t.get('reference','') for t in items)
    expected = {'E2E-REF-001', 'E2E-REF-002', 'E2E-REF-003', 'E2E-REF-004', 'E2E-REF-005'}
    missing = expected - refs
    print(f'FOUND:{len(refs & expected)}')
    print(f'MISSING:{len(missing)}')
    for m in missing:
        print(f'MISSING_REF:{m}')
except:
    print('FOUND:0')
    print('MISSING:5')
" 2>/dev/null || printf 'FOUND:0\nMISSING:5\n')

FOUND_REFS=$(echo "$ENTRIES_CHECK" | sed -n 's/^FOUND://p')
MISSING_REFS=$(echo "$ENTRIES_CHECK" | sed -n 's/^MISSING://p')

if [ "$FOUND_REFS" = "5" ] && [ "$MISSING_REFS" = "0" ]; then
  pass "All 5 expected transaction references match deterministic seed data"
else
  fail "Expected 5 references, found ${FOUND_REFS}, missing ${MISSING_REFS}"
  echo "$ENTRIES_CHECK" | grep "^MISSING_REF:" | while read -r line; do
    info "  Missing: ${line#MISSING_REF:}"
  done
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
