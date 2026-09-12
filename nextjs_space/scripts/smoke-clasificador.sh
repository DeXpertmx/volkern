#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Smoke test post-despliegue — clasificador determinista
#
# Comprueba, contra el entorno DESPLEGADO (no contra el repo), que un conjunto
# de frases se resuelve por la ruta determinista del clasificador. La evidencia
# es el marcador '[determinista]' que la propia ruta escribe en el audit log:
# esa ruta retorna antes de llamar a ningún modelo, así que si aparece el
# marcador la frase NO necesitó el LLM.
#
# Por qué existe: la guardia de vitest valida el detector puro en local. Si el
# despliegue no incorpora el arreglo —imagen vieja, tarball equivocado—, esa
# guardia sigue verde y producción sigue roma. Esto mira el servicio real.
#
# Se ejecuta solo tras cada despliegue (deploy-local.sh) y también a mano:
#   bash scripts/smoke-clasificador.sh
#
# Variables (con los valores del pipeline por defecto):
#   VOLKERN_VPS       destino SSH              (root@62.171.134.195)
#   VOLKERN_SSH_KEY   clave SSH                ($HOME/.ssh/id_buffy_volkern)
#   VOLKERN_APP_URL   URL pública a probar     (https://volkern.app)
#   VOLKERN_SERVICE   servicio de Swarm        (volkern-erp_app)
#
# Salida: 0 si todas las frases se resolvieron de forma determinista; 1 si
# alguna no. El agente que corre dentro del contenedor elimina siempre su
# tenant temporal, incluso si la prueba falla o se interrumpe.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

VPS="${VOLKERN_VPS:-root@62.171.134.195}"
SSH_KEY="${VOLKERN_SSH_KEY:-$HOME/.ssh/id_buffy_volkern}"
# Igual que deploy-local.sh: si corre elevado, la clave puede estar en un home
# de usuario real en lugar de /root/.ssh.
if [ ! -f "$SSH_KEY" ]; then
  for candidate in /home/*/.ssh/id_buffy_volkern; do
    if [ -f "$candidate" ]; then SSH_KEY="$candidate"; break; fi
  done
fi
APP_URL="${VOLKERN_APP_URL:-https://volkern.app}"
SERVICE="${VOLKERN_SERVICE:-volkern-erp_app}"

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=30"
SCP="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

AGENT_LOCAL="scripts/smoke-clasificador-agent.js"
CASOS_LOCAL="scripts/smoke-clasificador.casos.json"
AGENT_NOMBRE="$(basename "$AGENT_LOCAL")"
CASOS_NOMBRE="$(basename "$CASOS_LOCAL")"
AGENT_REMOTO="/tmp/$AGENT_NOMBRE"
CASOS_REMOTO="/tmp/$CASOS_NOMBRE"

if [ ! -f "$AGENT_LOCAL" ] || [ ! -f "$CASOS_LOCAL" ]; then
  echo "✗ Faltan $AGENT_LOCAL o $CASOS_LOCAL. Ejecuta desde la raíz del repo." >&2
  exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
  echo "✗ No se encontró la clave SSH ($SSH_KEY). Define VOLKERN_SSH_KEY." >&2
  exit 1
fi

echo "→ [smoke] Clasificador determinista contra $APP_URL"
$SCP -q "$AGENT_LOCAL" "$CASOS_LOCAL" "$VPS:/tmp/"

APP=$($SSH "$VPS" "docker ps --filter name=$SERVICE --format '{{.Names}}' | head -1")
if [ -z "$APP" ]; then
  echo "✗ No hay ningún contenedor de $SERVICE corriendo en el VPS." >&2
  exit 1
fi
echo "   · contenedor: $APP"

# El agente corre DENTRO del contenedor: es el único sitio con el cliente de
# Prisma ya generado que usa la app desplegada, y con node disponible.
$SSH "$VPS" "docker cp $AGENT_REMOTO $APP:/tmp/ >/dev/null && docker cp $CASOS_REMOTO $APP:/tmp/ >/dev/null"

RC=0
$SSH "$VPS" "docker exec -w /app -e NODE_PATH=/app/node_modules $APP \
  node /tmp/$AGENT_NOMBRE --url $APP_URL --casos /tmp/$CASOS_NOMBRE" || RC=$?

# Limpieza de los temporales (contenedor y VPS). Se hace siempre y sin
# enmascarar el resultado del smoke.
$SSH "$VPS" "docker exec $APP rm -f /tmp/$AGENT_NOMBRE /tmp/$CASOS_NOMBRE 2>/dev/null; \
  rm -f $AGENT_REMOTO $CASOS_REMOTO" >/dev/null 2>&1 || true

if [ "$RC" -ne 0 ]; then
  echo "✗ [smoke] FALLIDO: el entorno desplegado no resolvió alguna frase sin LLM." >&2
fi
exit "$RC"
