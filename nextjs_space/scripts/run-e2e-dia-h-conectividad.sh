#!/usr/bin/env bash
set -euo pipefail

# ─── Ensayo del DÍA H de Conectividad de Canales ─────────────────────────────
# Levanta el producto (next dev) en un puerto aislado y ejecuta el ensayo contra
# el SIMULADOR LOCAL del proveedor. Nada de esto habla con el proveedor real ni
# con producción: el simulador es un servidor local y la base de datos es la de
# DATABASE_URL, que en local vive en `.env.local` (ver scripts/cargar-entorno.cjs).
#
#   npm run test:e2e:dia-h
#   E2E_PORT=3097 npm run test:e2e:dia-h
#   npm run test:e2e:dia-h -- --keep    # deja los datos del ensayo
#
# El detalle de cada comprobación vive en scripts/e2e-dia-h-conectividad.ts, y
# el simulador del proveedor en scripts/simulador-conectividad.mjs.
#
# APAGADOR: el ensayo escribe en la base de datos; el script del ensayo exige
# E2E_DIA_H=1 y este lanzador lo pone. Lanzarlo a mano contra otra DATABASE_URL
# es una decisión consciente, no un accidente.

PORT="${E2E_PORT:-${PORT:-}}"
case "${PORT}" in
  ''|0|*[!0-9]*) PORT=3097 ;;
esac
BASE="http://localhost:${PORT}"
LOG="/tmp/next-e2e-dia-h-conectividad.log"
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
    kill -- "-${PID}" 2>/dev/null || true
    kill "${PID}" 2>/dev/null || true
    wait "${PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Un puerto ocupado por un servidor huérfano de otra corrida haría que el ensayo
# hablara con la app equivocada: se libera antes de empezar.
liberar_puerto() {
  local puerto="$1" pid
  pid=$(ss -tlnp 'sport = :'"${puerto}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
  if [ -n "${pid}" ]; then
    kill "${pid}" 2>/dev/null || true
    sleep 2
    info "Se liberó el puerto ${puerto} (PID ${pid})"
  fi
}

cd "${RAIZ}"

header "Prerrequisitos"
for cmd in node npx curl; do
  command -v "${cmd}" >/dev/null 2>&1 || { fail "${cmd} no encontrado"; exit 1; }
done
pass "Comandos disponibles (node, npx, curl)"
if [ -z "${DATABASE_URL:-}" ]; then
  info "DATABASE_URL no está en el entorno: se tomará de .env.local (y si no, de .env) vía ./scripts/cargar-entorno.cjs"
fi

header "Puerto ${PORT} (producto)"
liberar_puerto "${PORT}"
pkill -f "next dev --port ${PORT}" 2>/dev/null || true
pass "Puerto ${PORT} libre"

header "Servidor de desarrollo"
info "Arrancando next dev en ${BASE} (log: ${LOG})…"
if command -v setsid >/dev/null 2>&1; then
  setsid npx next dev --port "${PORT}" > "${LOG}" 2>&1 &
else
  npx next dev --port "${PORT}" > "${LOG}" 2>&1 &
fi
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

header "Ensayo del día H (el simulador del proveedor lo levanta el propio ensayo)"
export E2E_DIA_H=1
export BASE_URL="${BASE}"
npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-dia-h-conectividad.ts "$@"
