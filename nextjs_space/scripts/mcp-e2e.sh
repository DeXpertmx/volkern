#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# E2E autenticado — MCP /mcp (auth → skill → audit log)
#
# Igual que scripts/smoke-mcp.sh valida la superficie pública, este
# valida el CIRCUITO COMPLETO con credenciales reales, contra el
# entorno DESPLEGADO:
#
#   1. Crea un TENANT DEDICADO (tenant + rol OWNER + usuario admin) y DOS
#      API keys temporales (con y sin scope mcp:execute). Todo se borra
#      SIEMPRE al final, incluso si la prueba falla o se interrumpe.
#   2. tools/call con la key SIN scope → 401 / -32000 (gating).
#   3. tools/call con la key CON scope → ejecución REAL del skill
#      search_catalog con el contrato del catálogo (query) sobre el
#      catálogo vacío del tenant dedicado (prueba también el aislamiento).
#   4. Verifica en BD: audit log MCP_tool_execution y contadores
#      de la key (ultimoUso/totalUsos).
#
# Igual que el smoke del clasificador, el agente corre DENTRO del
# contenedor de la app: es el único sitio con el cliente Prisma de la
# imagen desplegada. El tenant es creado y borrado por el propio agente:
# nada toca datos de tenants reales. El smoke-mcp.sh (paso 5b del deploy)
# no necesita tenant porque solo consulta metadatos y una llamada rechazada.
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
# Modo flujo comercial completo (opcional):
#   bash scripts/mcp-e2e.sh --flujo-completo
#   Además del circuito, crea lead → deal → cotización → orden de venta en
#   el tenant dedicado, TODO vía /mcp tools/call con los contratos del
#   catálogo, verifica la orden por GET, comprueba la IDEMPOTENCIA de la
#   conversión (segunda llamada → yaExistia=true, sin duplicado) y elimina
#   el tenant completo al terminar. Sin avisos externos (el tenant E2E no
#   tiene Telegram/push configurados).
#
# Salida: 0 si todo pasa; 1 si algo falla (las keys y datos temporales
# se eliminan siempre).
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

# Modo flujo comercial completo (--flujo-completo)
FLUJO=0
for a in "$@"; do
  case "$a" in
    --flujo-completo) FLUJO=1 ;;
  esac
done

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

if [ "$FLUJO" = "1" ]; then
  echo "→ [mcp-e2e] Flujo comercial completo MCP (lead→deal→cotización→orden, datos temporales) contra $APP_URL"
else
  echo "→ [mcp-e2e] Circuito autenticado MCP (auth → skill → audit log) contra $APP_URL"
fi
$SCP -q "$AGENT_LOCAL" "$VPS:$AGENT_REMOTO"

APP=$($SSH "$VPS" "docker ps --filter name=$SERVICE --format '{{.Names}}' | head -1")
if [ -z "$APP" ]; then
  echo "✗ No hay ningún contenedor de $SERVICE corriendo en el VPS." >&2
  exit 1
fi
echo "   · contenedor: $APP"

$SSH "$VPS" "docker cp $AGENT_REMOTO $APP:/tmp/ >/dev/null"

RC=0
AGENT_FLAGS="--url $APP_URL"
if [ "$FLUJO" = "1" ]; then AGENT_FLAGS="$AGENT_FLAGS --flujo"; fi
$SSH "$VPS" "docker exec -w /app -e NODE_PATH=/app/node_modules -e IN_CONTAINER=1 -e VOLKERN_APP_URL=$APP_URL $APP \
  node /tmp/$AGENT_NOMBRE $AGENT_FLAGS" || RC=$?

# Limpieza de los temporales (contenedor y VPS), siempre y sin enmascarar
# el resultado del E2E.
$SSH "$VPS" "docker exec $APP rm -f /tmp/$AGENT_NOMBRE 2>/dev/null; rm -f $AGENT_REMOTO" >/dev/null 2>&1 || true

if [ "$RC" -ne 0 ]; then
  echo "✗ [mcp-e2e] FALLIDO en el entorno desplegado (revisa los ✗ de arriba; los datos temporales se limpian igualmente)." >&2
fi
exit "$RC"
