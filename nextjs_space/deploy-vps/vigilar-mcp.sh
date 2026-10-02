#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# vigilar-mcp.sh — centinela recurrente de la superficie MCP (VPS)
#
# Igual que auditar-superficie.sh vigila puertos y claves, este vigila la
# superficie MCP del entorno DESPLEGADO cada 15 minutos:
#
#   1. Server Card (/.well-known/mcp/server-card.json): 200 + tools.
#   2. initialize en /mcp: 200 + negociación 2025-11-25 + serverInfo.
#   3. tools/list: 200 y MISMO número de tools que la card.
#   4. tools/call sin credenciales → 401 / -32000 (la superficie no
#      puede quedar abierta).
#
# Notificación: solo en TRANSICIONES (ok→deriva y deriva→ok), vía el
# apprise del VPS (misma mecánica que auditar-superficie.sh: docker exec,
# las IPs overlay no son alcanzables desde el host). Sin estado de deriva
# previo no se avisa en cada fallo: se marca y el siguiente ciclo que
# recupere avisa de la recuperación. Un fallo de notificación jamás
# altera el resultado.
#
# El chequeo corre con node DENTRO del contenedor de la app (fetch):
# el host no garantiza node, y así no se depende de curl/jq.
#
# Instalación (cron del centinela, NUNCA en el crontab del ERP):
#   /etc/cron.d/vigilar-mcp:
#     */15 * * * * root /root/vigilar-mcp.sh >> /var/log/vigilar-mcp.log 2>&1
#
# Salida: exit 0 en reposo, 1 si deriva. Log: /var/log/vigilar-mcp.log.
# Marcador de estado: /root/DERIVA-MCP (mismo patrón que DERIVA-AUDITORIA).
# ═══════════════════════════════════════════════════════════════════
set -u

APP_URL="${VOLKERN_APP_URL:-https://volkern.app}"
MARCA=/root/DERIVA-MCP
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Aviso por Telegram via apprise del VPS (copiado de auditar-superficie.sh).
avisar() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^apprise_apprise-api' || return 0
  local A URLS BODY
  A=$(docker ps --filter name=apprise_apprise-api --format '{{.Names}}' | head -1)
  URLS=$(sed -n 's#^tgram://\([^?]*\)$#tgram://\1/646107192#p' /var/lib/docker/volumes/apprise_apprise-data/_data/apprise.cfg 2>/dev/null) || return 0
  [ -z "$URLS" ] && return 0
  BODY=$(python3 - "$URLS" "$1" "$2" <<'PYAP'
import json, sys
print(json.dumps({"urls": sys.argv[1], "title": sys.argv[2], "body": sys.argv[3], "type": "warning"}))
PYAP
) || return 0
  docker exec "$A" curl -s -m 20 -X POST http://127.0.0.1:8000/notify -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
  return 0
}

APP=$(docker ps --filter name=volkern-erp_app --format '{{.ID}}' | head -1)
if [ -z "$APP" ]; then
  DETALLE="sin contenedor volkern-erp_app corriendo"
  echo "[$STAMP] [mcp] DERIVA: $DETALLE"
  if [ ! -f "$MARCA" ]; then
    avisar "Vigilante MCP: SUPERFICIE MCP SIN VERIFICAR" "$DETALLE | hora: $(date -Is)"
    touch "$MARCA"
  fi
  exit 1
fi

# El chequeo corre con node dentro del contenedor (fetch, sin curl/jq).
RESULT=$(docker exec -i -e APP_URL="$APP_URL" "$APP" node - <<'NODEEOF' 2>/dev/null
const APP_URL = process.env.APP_URL || 'https://volkern.app'
const fallos = []
const j = async (path, opts) => {
  const r = await fetch(APP_URL + path, { signal: AbortSignal.timeout(20000), ...opts })
  let body = null
  try { body = await r.json() } catch { /* cuerpo no JSON */ }
  return { status: r.status, body }
}
const MCP_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }
const check = (nombre, cond, detalle) => { if (!cond) fallos.push(nombre + ': ' + detalle) }

const card = await j('/.well-known/mcp/server-card.json')
const toolNames = card.body?.capabilities?.tools?.tools
check('card', card.status === 200 && !!card.body?.name && Array.isArray(toolNames) && toolNames.length > 0, 'HTTP ' + card.status)
const nTools = Array.isArray(toolNames) ? toolNames.length : 0

const init = await j('/mcp', { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'vigilar-mcp', version: '1.0.0' } } }) })
check('initialize', init.status === 200 && init.body?.result?.protocolVersion === '2025-11-25' && !!init.body?.result?.serverInfo?.version, 'HTTP ' + init.status + ' ' + JSON.stringify(init.body?.error || ''))

const list = await j('/mcp', { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })
check('tools/list', list.status === 200 && Array.isArray(list.body?.result?.tools) && list.body.result.tools.length === nTools, `HTTP ${list.status}, /mcp=${list.body?.result?.tools?.length ?? '?'} vs card=${nTools}`)

const primera = Array.isArray(toolNames) ? toolNames[0] : 'volkern_list_contacts'
const call = await j('/mcp', { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: primera, arguments: {} } }) })
check('auth-tools/call', call.status === 401 && call.body?.error?.code === -32000, 'HTTP ' + call.status + ' (¡la superficie MCP podría quedar abierta!)')

console.log(JSON.stringify({ ok: fallos.length === 0, detalle: fallos.length ? fallos.join(' | ') : `card ${nTools} tools · initialize · tools/list · auth 401` }))
NODEEOF
)
RC=$?

if [ "$RC" -ne 0 ] || ! printf '%s' "$RESULT" | grep -q '"ok":true'; then
  DETALLE="$(printf '%s' "$RESULT" | grep -o '"detalle":"[^"]*"' | head -1 | sed 's/"detalle":"//;s/"$//')"
  [ -z "$DETALLE" ] && DETALLE="chequeo no ejecutable (exit $RC)"
  echo "[$STAMP] [mcp] DERIVA: $DETALLE"
  if [ ! -f "$MARCA" ]; then
    avisar "Vigilante MCP: SUPERFICIE MCP EN DERIVA" "$DETALLE | hora: $(date -Is)"
    touch "$MARCA"
  fi
  exit 1
fi

DETALLE_OK="$(printf '%s' "$RESULT" | grep -o '"detalle":"[^"]*"' | head -1 | sed 's/"detalle":"//;s/"$//')"
echo "[$STAMP] [mcp] en reposo: $DETALLE_OK"
if [ -f "$MARCA" ]; then
  avisar "Vigilante MCP: SUPERFICIE MCP RECUPERADA" "La superficie MCP volvió a CONFORME tras la deriva previa. Hora: $(date -Is)"
  rm -f "$MARCA"
fi
exit 0
