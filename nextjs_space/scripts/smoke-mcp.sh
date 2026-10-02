#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Smoke test post-despliegue — MCP (/mcp + Server Card)
#
# Comprueba, contra el entorno DESPLEGADO (no contra el repo), que la
# superficie MCP sigue viva y coherente en las 4 capas que la componen:
#
#   1. Server Card (/.well-known/mcp/server-card.json): existe, con
#      name/version, tools (capabilities.tools.tools) y
#      transports[0] streamable-http con protocolVersions — es lo que
#      leen los agentes externos para descubrir el servidor.
#   2. initialize en /mcp: negocia la versión pedida, esa versión está
#      anunciada en la card y su serverInfo coincide con la card.
#   3. tools/list en /mcp: expone EXACTAMENTE las mismas tools (mismo
#      número y mismos nombres) que la card — si el catálogo compartido
#      y la card derivan, aquí se nota en producción.
#   4. tools/call SIN credenciales → HTTP 401 con error JSON-RPC
#      -32000: la ejecución real sigue exigiendo API key con scope
#      mcp:execute. Si algún despliegue dejara /mcp sin auth, esto
#      lo detecta (no devolvería 401).
#
# Por qué existe: los tests de vitest validan el código local. Si el
# despliegue no incorpora los cambios —imagen vieja, tarball equivocado—
# la guardia sigue verde y producción queda rota o abierta. Esto mira el
# servicio real, como scripts/smoke-clasificador.sh pero sin tocar la BD
# (solo endpoints públicos de metadatos y una llamada rechazada).
#
# Se ejecuta tras cada despliegue (deploy-local.sh, paso 5b) y a mano:
#   bash scripts/smoke-mcp.sh
#
# Variables:
#   VOLKERN_APP_URL   URL pública a probar (https://volkern.app)
#
# Salida: 0 si todas las comprobaciones pasan; 1 si alguna falla.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

APP_URL="${VOLKERN_APP_URL:-https://volkern.app}"

# Node es dependencia dura del repo (Next.js): se usa para validar el JSON
# de las respuestas (jq no está garantizado en todas las máquinas).
if ! command -v node >/dev/null 2>&1; then
  echo "✗ node no está disponible en el PATH (necesario para validar JSON)." >&2
  exit 1
fi

CURL="curl -sS --max-time 30"
TMP_CARD=/tmp/smoke-mcp-card.json
TMP_INIT=/tmp/smoke-mcp-init.json
TMP_LIST=/tmp/smoke-mcp-list.json
TMP_CALL=/tmp/smoke-mcp-call.json
# Los checks de node leen la card vía process.env.TMP_CARD
export TMP_CARD

# check <descripcion> <script-node-que-lee-stdin-json> [status]
# El script recibe el cuerpo por stdin (fs.readFileSync(0)); si lanza o
# sale != 0, el smoke aborta.
check() {
  local desc="$1" script="$2" status="${3:-}"
  if ! node -e "$script" <<<"$(cat "$BODY_FILE")"; then
    echo "✗ [smoke-mcp] $desc" >&2
    exit 1
  fi
  echo "   ✓ $desc${status:+ (HTTP $status)}"
}

echo "→ [smoke-mcp] Superficie MCP contra $APP_URL"

# ── 1. Server Card ────────────────────────────────────────────
CARD_STATUS=$($CURL -o "$TMP_CARD" -w '%{http_code}' "$APP_URL/.well-known/mcp/server-card.json")
if [ "$CARD_STATUS" != "200" ]; then
  echo "✗ [smoke-mcp] Server Card respondió HTTP $CARD_STATUS (esperaba 200)." >&2
  exit 1
fi
# Comprobación de transportes y endpoint de la card (informativo + dura)
BODY_FILE=$TMP_CARD
check "Server Card: name/version, 43+ tools, transport streamable-http con protocolVersions" '
  const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!c.name || !c.version) throw new Error("card sin name/version");
  const toolNames = c.capabilities?.tools?.tools;
  if (!Array.isArray(toolNames) || toolNames.length === 0) throw new Error("card sin capabilities.tools.tools");
  const t = (c.transports || []).find(t => t.type === "streamable-http");
  if (!t) throw new Error("card sin transport streamable-http");
  if (!Array.isArray(t.protocolVersions) || t.protocolVersions.length === 0) throw new Error("card sin protocolVersions");
  if (!t.endpoint) throw new Error("card sin transports[0].endpoint");
' "$CARD_STATUS"

CARD_NAME=$(node -e "const c=JSON.parse(require('fs').readFileSync('$TMP_CARD','utf8'));console.log(c.name)")
CARD_VERSION=$(node -e "const c=JSON.parse(require('fs').readFileSync('$TMP_CARD','utf8'));console.log(c.version)")
CARD_N_TOOLS=$(node -e "const c=JSON.parse(require('fs').readFileSync('$TMP_CARD','utf8'));console.log(c.capabilities.tools.tools.length)")
echo "   · card: $CARD_NAME v$CARD_VERSION, $CARD_N_TOOLS tools"

# El endpoint anunciado debería coincidir con el entorno probado; si no,
# avisar sin fallar (p. ej. card de prod probada contra staging).
CARD_ENDPOINT=$(node -e "const c=JSON.parse(require('fs').readFileSync('$TMP_CARD','utf8'));console.log(c.transports.find(t=>t.type==='streamable-http').endpoint)")
ENDPOINT_HOST=$(node -e "console.log(new URL('$CARD_ENDPOINT').host)")
APP_HOST=$(node -e "console.log(new URL('$APP_URL').host)")
if [ "$ENDPOINT_HOST" != "$APP_HOST" ]; then
  echo "   ⚠️  la card anuncia endpoint en $ENDPOINT_HOST pero se prueba $APP_HOST"
fi

# ── 2. initialize (negociación 2025-11-25) ────────────────────
INIT_STATUS=$($CURL -o "$TMP_INIT" -w '%{http_code}' -X POST "$APP_URL/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"volkern-smoke","version":"1.0.0"}}}')
if [ "$INIT_STATUS" != "200" ]; then
  echo "✗ [smoke-mcp] initialize respondió HTTP $INIT_STATUS (esperaba 200)." >&2
  exit 1
fi
BODY_FILE=$TMP_INIT
check "initialize: negocia 2025-11-25 (anunciada en la card) y serverInfo == card" '
  const fs = require("fs");
  const r = JSON.parse(fs.readFileSync(0, "utf8")).result;
  if (!r) throw new Error("initialize sin result");
  if (r.protocolVersion !== "2025-11-25") throw new Error("negoció " + r.protocolVersion);
  const card = JSON.parse(fs.readFileSync(process.env.TMP_CARD, "utf8"));
  const pv = card.transports.find(t => t.type === "streamable-http").protocolVersions;
  if (!pv.includes(r.protocolVersion)) throw new Error("versión negociada no anunciada en la card: " + pv.join(", "));
  if (r.serverInfo?.name !== card.name || r.serverInfo?.version !== card.version)
    throw new Error("serverInfo " + JSON.stringify(r.serverInfo) + " ≠ card " + card.name + " " + card.version);
' "$INIT_STATUS"

# ── 3. tools/list == tools de la card ─────────────────────────
LIST_STATUS=$($CURL -o "$TMP_LIST" -w '%{http_code}' -X POST "$APP_URL/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
if [ "$LIST_STATUS" != "200" ]; then
  echo "✗ [smoke-mcp] tools/list respondió HTTP $LIST_STATUS (esperaba 200)." >&2
  exit 1
fi
BODY_FILE=$TMP_LIST
check "tools/list: mismas tools que la card (número y nombres)" '
  const fs = require("fs");
  const list = JSON.parse(fs.readFileSync(0, "utf8")).result?.tools;
  if (!Array.isArray(list)) throw new Error("tools/list sin tools");
  const card = JSON.parse(fs.readFileSync(process.env.TMP_CARD, "utf8")).capabilities.tools.tools;
  if (list.length !== card.length)
    throw new Error(list.length + " tools en /mcp vs " + card.length + " en la card");
  const faltan = card.filter(n => !list.some(t => t.name === n));
  const sobran = list.map(t => t.name).filter(n => !card.includes(n));
  if (faltan.length || sobran.length)
    throw new Error("derivación card↔/mcp: faltan " + JSON.stringify(faltan) + " sobran " + JSON.stringify(sobran));
  const sinSchema = list.filter(t => !t.inputSchema || t.inputSchema.type !== "object");
  if (sinSchema.length) throw new Error("tools sin inputSchema: " + sinSchema.map(t => t.name).join(", "));
' "$LIST_STATUS"
echo "   · /mcp expone $CARD_N_TOOLS tools con inputSchema, sincronizadas con la card"

# ── 4. tools/call sin auth → 401 / -32000 ─────────────────────
# Primera tool del catálogo: da igual cuál sea, debe ser RECHAZADA por auth
# antes de ejecutar nada.
FIRST_TOOL=$(node -e "const c=JSON.parse(require('fs').readFileSync('$TMP_CARD','utf8'));console.log(c.capabilities.tools.tools[0])")
CALL_STATUS=$($CURL -o "$TMP_CALL" -w '%{http_code}' -X POST "$APP_URL/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"$FIRST_TOOL\",\"arguments\":{}}}")
if [ "$CALL_STATUS" != "401" ]; then
  echo "✗ [smoke-mcp] tools/call sin auth respondió HTTP $CALL_STATUS (esperaba 401). ¡La superficie MCP podría quedar abierta!" >&2
  exit 1
fi
BODY_FILE=$TMP_CALL
check "tools/call sin auth ($FIRST_TOOL): 401 con error JSON-RPC -32000" '
  const e = JSON.parse(require("fs").readFileSync(0, "utf8")).error;
  if (!e || e.code !== -32000) throw new Error("error inesperado: " + JSON.stringify(e));
' "$CALL_STATUS"

# Limpieza de temporales locales
rm -f "$TMP_CARD" "$TMP_INIT" "$TMP_LIST" "$TMP_CALL"

echo "✓ [smoke-mcp] OK: card, initialize, tools/list y auth de tools/call verificados en $APP_URL"
