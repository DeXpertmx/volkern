#!/usr/bin/env bash
set -euo pipefail

# ─── Ensayo E2E del booking engine (FASE 3.D) ────────────────────────────────
# Arranca un servidor de desarrollo en un puerto aislado y ejecuta el ensayo:
# publicar una propiedad de prueba, reservar por la API pública (la misma que
# usa /booking/[slug]) y comprobar que la reserva entra en el planning.
#
#   npm run test:e2e:booking
#   PORT=3098 npm run test:e2e:booking
#   E2E_KEEP=1 npm run test:e2e:booking   # conserva los datos del ensayo
#
# El detalle de cada comprobación vive en scripts/e2e-booking-engine.mjs.

# El entorno puede traer PORT=0 (algunos hosts lo exportan así); un puerto 0
# deja a `next dev` en un puerto aleatorio y el ensayo no encuentra el servidor.
# Se acepta un PORT explícito con valor positivo (o E2E_PORT) y, si no, 3098.
PORT="${E2E_PORT:-${PORT:-}}"
case "${PORT}" in
  ''|0|*[!0-9]*) PORT=3098 ;;
esac
BASE="http://localhost:${PORT}"
# El mock del Servicio de Hospedajes (bloque 4c del ensayo): el servidor de
# desarrollo envía ahí el registro de viajeros, así que ninguna comunicación
# sale al Ministerio. El script lo levanta en ese puerto solo cuando detecta
# E2E_MIR_ENDPOINT, que es la señal de que el servidor está apuntado al mock.
# El mock NO usa un puerto fijo: se pide uno libre al sistema. Un puerto fijo se
# puede encontrar ya servido por otra corrida (o por un mock anterior) y
# entonces el servidor de desarrollo hablaría con el mock equivocado; el ensayo
# se cree verde y no lo está. `E2E_MIR_PORT` sigue mandando si se informa.
MIR_MOCK_PORT="${E2E_MIR_PORT:-}"
if [ -z "${MIR_MOCK_PORT}" ]; then
  MIR_MOCK_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})')"
fi
LOG="/tmp/next-e2e-booking-engine.log"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PID=""
# Si el servidor arranca en su propio grupo de procesos, el cleanup puede
# llevarse el árbol completo (npx → next dev → next-server).
EN_GRUPO=0

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
    # `npx next dev` es el lanzador: el que escucha es su hijo `next-server`.
    # Matar solo al lanzador deja un servidor huérfano vivo que sigue apuntando
    # al mock del ensayo y contesta a la corrida siguiente. Por eso se mata el
    # grupo entero (y, de propina, el lanzador por si no quedó en ninguno).
    if [ "${EN_GRUPO}" = "1" ]; then
      kill -- "-${PID}" 2>/dev/null || true
    fi
    kill "${PID}" 2>/dev/null || true
    wait "${PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Deja un puerto en manos de nadie: mata a quien esté escuchando en él. Un
# puerto ocupado (por otra corrida o por un servidor huérfano) no es un detalle
# estético: el ensayo leería el mock de otro proceso y sus comprobaciones
# mentirían.
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

header "Puertos ${PORT} (servidor) y ${MIR_MOCK_PORT} (mock)"
liberar_puerto "${PORT}"
# El lanzador puede sobrevivir al servidor al que lanzó: se retira también.
pkill -f "${RAIZ}/nextjs_space/node_modules/.bin/next dev --port ${PORT}" 2>/dev/null || true
liberar_puerto "${MIR_MOCK_PORT}"
pass "Puertos ${PORT} y ${MIR_MOCK_PORT} libres"

header "Servidor de desarrollo"
# El módulo del registro de viajeros solo honra este override fuera de
# producción y contra loopback (ver lib/hospitality/registro-viajeros-service.ts).
export MIR_E2E_ENDPOINT="http://127.0.0.1:${MIR_MOCK_PORT}/hospedajes-web/ws/v1/comunicacion"
export E2E_MIR_ENDPOINT="${MIR_E2E_ENDPOINT}"
# El email del ensayo (aviso de partes sin reintentar) también va al mock: sin
# esto, el aviso del barrido mandaría correos REALES con las credenciales del
# entorno. La ruta la sirve el mismo mock que el MIR (ver levantarMockMIR).
export EMAIL_E2E_ENDPOINT="http://127.0.0.1:${MIR_MOCK_PORT}/email"
export E2E_MIR_PORT="${MIR_MOCK_PORT}"
info "Registro de viajeros apuntado al mock local (${MIR_E2E_ENDPOINT})"
info "Arrancando next dev en ${BASE} (log: ${LOG})…"
if command -v setsid >/dev/null 2>&1; then
  EN_GRUPO=1
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

header "Ensayo de punta a punta"
export BASE_URL="${BASE}"
if [ -n "${E2E_KEEP:-}" ]; then
  node scripts/e2e-booking-engine.mjs --keep
else
  node scripts/e2e-booking-engine.mjs
fi
