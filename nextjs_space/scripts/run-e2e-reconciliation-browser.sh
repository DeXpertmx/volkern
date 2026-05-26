#!/usr/bin/env bash
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
PORT="${PORT:-3099}"
BASE="http://localhost:${PORT}"
SEED_SCRIPT="scripts/seed-reconciliation-e2e.ts"
PID=""

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "  ${CYAN}→${NC} $1"; }
pass() { echo -e "  ${GREEN}✔${NC} $1"; }
header() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}\n"; }
highlight() { echo -e "${BLUE}$1${NC}"; }

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
    echo "  ${RED}✘${NC} $cmd not found — please install it"
    exit 1
  fi
done
pass "All prerequisite commands available"

# ─── Step 1: Kill existing dev server ─────────────────────────────────────────
header "Kill existing dev server (port ${PORT})"

EXISTING_PID=$(lsof -ti :"${PORT}" 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 2
  info "Killed existing process on port ${PORT}"
fi
pass "Port ${PORT} is free"

# ─── Step 2: Seed database ────────────────────────────────────────────────────
header "Seed database"

cd "$(dirname "$0")/.."
info "Running seed script..."
if npx tsx "$SEED_SCRIPT" 2>&1; then
  pass "Database seeded successfully"
else
  echo "  ${RED}✘${NC} Seed script failed"
  exit 1
fi

# ─── Step 3: Start dev server ────────────────────────────────────────────────
header "Start dev server"

info "Starting next dev on port ${PORT}..."
npx next dev --port "${PORT}" &
PID=$!

for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '%{http_code}' "${BASE}/" 2>/dev/null | grep -q '200\|302\|401'; then
    pass "Dev server is ready (${BASE})"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "  ${RED}✘${NC} Dev server did not start within 60 seconds"
    exit 1
  fi
  sleep 1
done

sleep 3

# ─── Step 4: Print instructions ──────────────────────────────────────────────
header "BROWSER-USE TEST INSTRUCTIONS"

echo ""
highlight "╔══════════════════════════════════════════════════════════════════════╗"
highlight "║      TEST E2E DE CONCILIACIÓN BANCARIA (BROWSER-USE)               ║"
highlight "╠══════════════════════════════════════════════════════════════════════╣"
highlight "║  Servidor listo en: http://localhost:${PORT}                              ║"
highlight "║  Login: e2e@test.com / Test1234!                                   ║"
highlight "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

echo -e "${YELLOW}Instrucciones:${NC}"
echo ""
echo "  1. Abre http://localhost:${PORT}/auth/login en Chrome"
echo ""
echo "  2. En el chat de Buffy (Codebuff CLI), pega el siguiente prompt:"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
cat <<'PROMPT_EOF'
Ejecuta un test e2e de la UI de conciliación bancaria con browser-use usando esta sesion autenticada.

El servidor dev ya esta corriendo en http://localhost:3099 con datos de prueba seedeados.

Resumen de datos disponibles:
- Login: e2e@test.com / Test1234!
- API Key: vk_prod_cafebabe12345678cafebabe12345678cafebabe12345678cafebabe12345678
- 1 conexion bancaria: Banco Santander E2E
- 5 transacciones pendientes: COBRO FACTURA #001 (121 EUR), PAGO NOMINA MARZO (-2100 EUR), etc.
- 3 asientos contables que matchean con las primeras 3 transacciones

Pasos del test:

PASO 1 - LOGIN:
Navega a http://localhost:3099/auth/login.
Llena el formulario con:
  - Email: e2e@test.com
  - Password: Test1234!
Haz clic en Iniciar sesion.
Espera 5 segundos a que redirija al dashboard.

PASO 2 - VERIFICAR UI:
Navega a http://localhost:3099/dashboard/finanzas/contabilidad/reconciliacion
Verifica que en la pagina se vea:
  - El titulo "Conciliacion Bancaria"
  - La conexion "Banco Santander E2E"
  - El contador de pendientes (5)
  - Las transacciones en la tabla (COBRO FACTURA, PAGO NOMINA, etc.)
Toma un screenshot.

PASO 3 - VERIFICAR API (opcional, en consola del navegador):
fetch('http://localhost:3099/api/accounting/reconciliation?view=transactions', {
  headers: { 'x-api-key': 'vk_prod_cafebabe12345678cafebabe12345678cafebabe12345678cafebabe12345678' }
}).then(r => r.json()).then(console.log)

Reporta: que elementos UI se ven, si hay errores de consola, y si el login fue exitoso.
PROMPT_EOF
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  3. Opcional: haz clic en el prompt de arriba en el chat de Buffy para ejecutar el test"
echo ""

# ─── Step 5: Open login page ─────────────────────────────────────────────────
if command -v xdg-open &>/dev/null; then
  info "Opening login page in browser..."
  xdg-open "${BASE}/auth/login" 2>/dev/null || true
elif command -v google-chrome &>/dev/null; then
  info "Opening login page in Chrome..."
  google-chrome "${BASE}/auth/login" 2>/dev/null || true
fi

# ─── Step 6: Wait for user ────────────────────────────────────────────────────
echo ""
header "SERVIDOR CORRIENDO"
echo "  El servidor dev está listo en ${BASE}"
echo "  Presiona ENTER para detener el servidor y finalizar."
echo ""
read -r -p "  [ENTER para detener] "

echo ""
info "Deteniendo servidor..."
