#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# E2E autenticado — MCP /mcp (auth → skill → audit log)
#
# Igual que scripts/smoke-mcp.sh valida la superficie pública, este
# valida el CIRCUITO COMPLETO con credenciales reales, contra el
# entorno DESPLEGADO:
#
#   1. Crea DOS API keys temporales en la BD (con y sin scope
#      mcp:execute). Se borran SIEMPRE al final, incluso si la
#      prueba falla o se interrumpe.
#   2. tools/call con la key SIN scope → 401 / -32000 (gating).
#   3. tools/call con la key CON scope → ejecución REAL del skill
#      search_catalog contra el catálogo del tenant autenticado.
#   4. Verifica en BD: audit log MCP_tool_execution y contadores
#      de la key (ultimoUso/totalUsos).
#
# Igual que el smoke del clasificador, el agente corre DENTRO del
# contenedor de la app: es el único sitio con el cliente Prisma de la
# imagen desplegada. El tenant usado solo recibe lecturas y las keys
# son temporales; el smoke-mcp.sh (paso 5b del deploy) no necesita
# tenant porque solo consulta metadatos y una llamada rechazada.
#
# Uso manual:
#   bash scripts/mcp-e2e.sh
#
# Variables (mismas convenciones que smoke-clasificador.sh):
#   VOLKERN_VPS       destino SSH              (root@62.171.134.195)
#   VOLKERN_SSH_KEY   clave SSH                ($HOME/.ssh/id_buffy_volkern)
#   VOLKERN_APP_URL   URL pública a probar     (https://volkern.app)
#   VOLKERN_SERVICE   servicio de Swarm        (volkern-erp_app)
#
# Salida: 0 si el circuito completo pasa; 1 si algo falla (las keys
# temporales se eliminan siempre).
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

VPS="${VOLKERN_VPS:-root@62.171.134.195}"
SSH_KEY="${VOLKERN_SSH_KEY:-$HOME/.ssh/id_buffy_volkern}"
# Igual que smoke-clasificador.sh: si corre elevado, la clave puede estar
# en un home de usuario real en lugar de /root/.ssh.
if [ ! -f "$SSH_KEY" ]; then
  for candidate in /home/*/.ssh/id_buffy_volkern; do
    if [ -f "$candidate" ]; then SSH_KEY="$candidate"; break; fi
  done
fi
APP_URL="${VOLKERN_APP_URL:-https://volkern.app}"
SERVICE="${VOLKERN_SERVICE:-volkern-erp_app}"

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=30"
SCP="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

AGENT_LOCAL="scripts/mcp-e2e-agent.js"
AGENT_NOMBRE="$(basename "$AGENT_LOCAL")"
AGENT_REMOTO="/tmp/$AGENT_NOMBRE"

if [ ! -f "$AGENT_LOCAL" ]; then
  echo "✗ Falta $AGENT_LOCAL. Ejecuta desde la raíz del repo." >&2
  exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
  echo "✗ No se encontró la clave SSH ($SSH_KEY). Define VOLKERN_SSH_KEY." >&2
  exit 1
fi

echo "→ [mcp-e2e] Circuito autenticado MCP (auth → skill → audit log) contra $APP_URL"
$SCP -q "$AGENT_LOCAL" "$VPS:$AGENT_REMOTO"

APP=$($SSH "$VPS" "docker ps --filter name=$SERVICE --format '{{.Names}}' | head -1")
if [ -z "$APP" ]; then
  echo "✗ No hay ningún contenedor de $SERVICE corriendo en el VPS." >&2
  exit 1
fi
echo "   · contenedor: $APP"

$SSH "$VPS" "docker cp $AGENT_REMOTO $APP:/tmp/ >/dev/null"

RC=0
$SSH "$VPS" "docker exec -w /app -e NODE_PATH=/app/node_modules -e VOLKERN_APP_URL=$APP_URL $APP \
  node /tmp/$AGENT_NOMBRE --url $APP_URL" || RC=$?

# Limpieza de los temporales (contenedor y VPS), siempre y sin enmascarar
# el resultado del E2E.
$SSH "$VPS" "docker exec $APP rm -f /tmp/$AGENT_NOMBRE 2>/dev/null; rm -f $AGENT_REMOTO" >/dev/null 2>&1 || true

if [ "$RC" -ne 0 ]; then
  echo "✗ [mcp-e2e] FALLIDO: el circuito auth→skill→audit no pasó en el entorno desplegado." >&2
fi
exit "$RC"
