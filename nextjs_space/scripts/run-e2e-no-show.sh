#!/usr/bin/env bash
set -euo pipefail

# ─── Ensayo E2E del no-show y la disponibilidad ──────────────────────────────
# Arranca un servidor de desarrollo apuntando la conectividad a un mock local,
# y ejecuta el ensayo: reservar → marcar no-show → comprobar que la unidad vuelve
# a venderse y que la disponibilidad empujada al canal sube.
#
#   npm run test:e2e:noshow
#   PORT=3097 npm run test:e2e:noshow
#   E2E_KEEP=1 npm run test:e2e:noshow   # conserva los datos del ensayo
#
# El detalle de cada comprobación vive en scripts/e2e-no-show.ts.

# El entorno puede traer PORT=0 (algunos hosts lo exportan así); un puerto 0
# significa «aleatorio» para next y rompe la sonda de disponibilidad. Solo se
# acepta un PORT explícito con valor positivo.
PORT="${E2E_PORT:-${PORT:-}}"
case "${PORT}" in
  ''|0|*[!0-9]*) PORT=3098 ;;
esac
MOCK_PORT="${E2E_MOCK_PORT:-4599}"
BASE="http://localhost:${PORT}"
LOG="/tmp/next-e2e-no-show.log"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PID=""

VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
CIAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${VERDE}✔${NC} $1"; }
fail() { echo -e "  ${ROJO}✘${NC} $1"; }
info() { echo -e "  ${CIAN}→${NC} $1"; }
header() { echo -e "\n${AMARILLO}━━━ $1 ━━━${NC}"; }

cleanup() {
  if [ -n "${PID}" ] && kill -0 "${PID}" 2>/dev/null; then
    info "Deteniendo el servidor de desarrollo (PID ${PID})…"
    kill "${PID}" 2>/dev/null || true
    wait "${PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "${RAIZ}"

header "Prerrequisitos"
for cmd in node npx curl; do
  command -v "${cmd}" >/dev/null 2>&1 || { fail "${cmd} no encontrado"; exit 1; }
done
pass "Comandos disponibles (node, npx, curl)"

# El adaptador de conectividad resuelve CONNECTIVITY_BASE_URL al arrancar; el
# servidor de desarrollo debe apuntar al mock del ensayo para que el push real
# se capture en local (nunca se llama a un proveedor externo).
export CONNECTIVITY_BASE_URL="http://127.0.0.1:${MOCK_PORT}"
export E2E_MOCK_PORT="${MOCK_PORT}"
export BASE_URL="${BASE}"
pass "Conectividad apuntada al mock local (${CONNECTIVITY_BASE_URL})"

header "Puerto ${PORT}"
EXISTENTE_PID=$(ss -tlnp 'sport = :'"${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
if [ -n "${EXISTENTE_PID}" ]; then
  kill "${EXISTENTE_PID}" 2>/dev/null || true
  sleep 3
  info "Se liberó el puerto ${PORT} (PID ${EXISTENTE_PID})"
fi
# Un solo `next dev` por checkout: dos servidores comparten .next y se pisan.
OTROS=$(pgrep -f "next dev" 2>/dev/null | grep -v "$$" || true)
if [ -n "${OTROS}" ]; then
  info "Deteniendo otros 'next dev' del mismo checkout (PIDs: $(echo "${OTROS}" | tr '\n' ' '))"
  kill ${OTROS} 2>/dev/null || true
  sleep 3
fi
pass "Puerto ${PORT} libre y sin servidores previos"

header "Servidor de desarrollo"
info "Arrancando next dev en ${BASE} (log: ${LOG})…"
npx next dev --port "${PORT}" > "${LOG}" 2>&1 &
PID=$!

LISTO=0
for _ in $(seq 1 90); do
  CODIGO=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/public/booking/__preflight__" 2>/dev/null || echo "000")
  if [ "${CODIGO}" = "404" ] || [ "${CODIGO}" = "200" ]; then
    LISTO=1
    break
  fi
  sleep 1
done

if [ "${LISTO}" != "1" ]; then
  fail "El servidor no respondió a tiempo"
  info "=== log del servidor ==="
  tail -40 "${LOG}" 2>/dev/null || true
  exit 1
fi
pass "Servidor de desarrollo listo (${BASE})"

header "Ensayo de punta a punta"
if [ -n "${E2E_KEEP:-}" ]; then
  npx tsx --require dotenv/config scripts/e2e-no-show.ts --keep
else
  npx tsx --require dotenv/config scripts/e2e-no-show.ts
fi
