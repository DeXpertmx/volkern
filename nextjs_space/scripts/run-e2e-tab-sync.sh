#!/usr/bin/env bash
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
PORT="${PORT:-3099}"
BASE="http://localhost:${PORT}"
SEED_SCRIPT="scripts/seed-tab-sync-e2e.ts"
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
highlight "║      TEST E2E DE SINCRONIZACIÓN TABS ↔ URL                         ║"
highlight "╠══════════════════════════════════════════════════════════════════════╣"
highlight "║  Servidor listo en: http://localhost:${PORT}                              ║"
highlight "║  Login: e2e-slots@test.com / Test1234!                             ║"
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
Ejecuta un test E2E de la UI de sincronización tabs↔URL con browser-use usando esta sesion autenticada.

El servidor dev ya esta corriendo en http://localhost:3099 con datos de prueba seedeados.

IMPORTANTE: Las URL usan prefijo de tenant: e2e-tab-agency (tanto slug como id funcionan)

Resumen de datos disponibles:
- Login: e2e-slots@test.com / Test1234!
- 4 slots visibles: 2 AGENCY_SLOT (Inmobiliaria Alfa, Agencia Creativa Beta) + 2 ACCOUNTING_SLOT (Comercializadora del Sur, Fábrica del Valle Industrial)
- 1 slot eliminado (Cliente Eliminado Gamma) — no debe aparecer
- URLs base: /e2e-tab-agency/dashboard/configuracion/agency y /e2e-tab-agency/dashboard/configuracion/accounting

Pasos del test:

PASO 1 - LOGIN:
Navega a http://localhost:3099/auth/login.
Llena el formulario con las credenciales. USA ESTE METODO: busca los inputs por placeholder o etiqueta "Correo electrónico" y "Contraseña".
  - Email: e2e-slots@test.com
  - Password: Test1234!
Haz clic en "Iniciar sesion".
Espera 5-8 segundos a que redirija al dashboard.
NOTA: Si ves un error de que el formulario no se encuentra, intenta usando document.querySelector o usando los selectores name/type.

PASO 2 - AGENCY PAGE: TAB "TODOS" (default)
Navega a http://localhost:3099/e2e-tab-agency/dashboard/configuracion/agency
Verifica que:
  - La URL NO tenga ?tab (debe estar limpia, sin query params)
  - El tab "Todos" aparezca seleccionado/activo (tiene estilo visual diferente)
  - Se muestren 4 slots en total (Inmobiliaria Alfa, Agencia Creativa Beta, Comercializadora del Sur, Fábrica del Valle Industrial)
  - El contador diga "4" en el tab Todos
Toma un screenshot.

PASO 3 - AGENCY PAGE: TAB "AGENCIA"
Haz clic en el tab "Agencia".
Verifica que:
  - La URL cambie a ?tab=agency
  - Solo se muestren 2 slots: Inmobiliaria Alfa, Agencia Creativa Beta
  - El tab "Agencia" aparezca seleccionado/activo
Toma un screenshot.

PASO 4 - AGENCY PAGE: TAB "CONTABILIDAD"
Haz clic en el tab "Contabilidad".
Verifica que:
  - La URL cambie a ?tab=accounting
  - Solo se muestren 2 slots: Comercializadora del Sur, Fábrica del Valle Industrial
  - El tab "Contabilidad" aparezca seleccionado/activo
Toma un screenshot.

PASO 5 - AGENCY PAGE: URL DIRECTA con ?tab=accounting
Navega directamente a http://localhost:3099/e2e-tab-agency/dashboard/configuracion/agency?tab=accounting
Verifica que:
  - El tab "Contabilidad" aparezca seleccionado automáticamente (sin hacer clic)
  - Se muestren solo los 2 slots contables
  - La URL contenga ?tab=accounting

PASO 6 - AGENCY PAGE: TAB "TODOS" limpia URL
Haz clic en el tab "Todos".
Verifica que:
  - La URL se limpie (sin ?tab) — el param desaparece de la barra de direcciones
  - Se muestren los 4 slots nuevamente

PASO 7 - ACCOUNTING PAGE: TAB "CONTABILIDAD" (default)
Navega a http://localhost:3099/e2e-tab-agency/dashboard/configuracion/accounting
Verifica que:
  - La URL tenga ?tab=accounting (default de la pagina contable)
  - El tab "Contabilidad" aparezca seleccionado
  - Solo se muestren 2 slots contables
Toma un screenshot.

PASO 8 - ACCOUNTING PAGE: TAB "AGENCIA"
Haz clic en el tab "Agencia".
Verifica que:
  - La URL cambie a ?tab=agency
  - Solo se muestren 2 slots de agencia
  - El tab "Agencia" aparezca seleccionado

PASO 9 - ACCOUNTING PAGE: TAB "TODOS"
Haz clic en el tab "Todos".
Verifica que:
  - La URL se limpie (sin ?tab)
  - Se muestren los 4 slots

PASO 10 - ACCOUNTING PAGE: URL DIRECTA con ?tab=agency
Navega directamente a http://localhost:3099/e2e-tab-agency/dashboard/configuracion/accounting?tab=agency
Verifica que:
  - El tab "Agencia" aparezca seleccionado automáticamente
  - Solo se muestren los 2 slots de agencia

PASO 11 - NAVEGACION ENTRE PAGINAS PERSISTE
Estando en accounting con ?tab=agency, navega manualmente a http://localhost:3099/e2e-tab-agency/dashboard/configuracion/agency
Verifica que la URL en agency NO tenga ?tab (default de agency es mostrar Todos)

Reporta: resultados de cada paso, errores de consola, y capturas de pantalla.
PROMPT_EOF
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  3. Alternativamente, puedes ejecutar el prompt de arriba manualmente en el chat de Buffy"
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
