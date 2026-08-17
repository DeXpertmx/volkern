#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Deploy de la app en el VPS — Volkern ERP (Docker Swarm)
#
# Encadena todo el lado remoto del despliegue para que NUNCA se
# olvide cargar la imagen antes del `service update` (bug histórico:
# se actualizaba el servicio con la imagen local vieja porque el
# tarball `latest` no se había hecho `docker load`).
#
#   PASOS:
#     1. docker load del tarball volkern-erp-latest.tar (OBLIGATORIO)
#     2. Opcional: migraciones (si se pasa un tarball migrator)
#     3. service update --force --image volkern-erp:latest
#     4. Esperar convergencia de la nueva tarea
#     5. Verificar HTTP 200 de la app
#     6. Limpieza automática de los tarballs del /tmp (incluye residuos
#        de despliegues anteriores) para que no se acumulen
#
# Ejecutar EN EL VPS (root@62.171.134.195):
#   bash deploy-vps/deploy-app.sh
#   bash deploy-vps/deploy-app.sh /tmp/volkern-erp-latest.tar
#   bash deploy-vps/deploy-app.sh /tmp/volkern-erp-latest.tar /tmp/volkern-erp-migrator.tar
#
# Flags:
#   --keep      NO limpia los tarballs tras el deploy (por defecto se limpian)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

LATEST_TARBALL="${1:-/tmp/volkern-erp-latest.tar}"
MIGRATOR_TARBALL="${2:-}"
CLEANUP=1
for a in "$@"; do [ "$a" = "--keep" ] && CLEANUP=0; done

SERVICE="volkern-erp_app"
IMAGE="volkern-erp:latest"
APP_URL="https://volkern.app"

# ── Notificación Telegram (al terminar o fallar) ──────────────────
# Credenciales: override por env DEPLOY_TELEGRAM_* o resolución automática
# en el VPS (token del contenedor, admin_chat_id de la BD de integraciones).
# Si no se puede resolver, el deploy continúa sin notificar.
TG_BOT_TOKEN="${DEPLOY_TELEGRAM_BOT_TOKEN:-}"
TG_CHAT_ID="${DEPLOY_TELEGRAM_CHAT_ID:-}"
DEPLOY_OK=0

tg_resolve_credentials() {
  if [ -z "$TG_BOT_TOKEN" ]; then
    local app_cid
    app_cid=$(docker ps --filter name=volkern-erp_app --format '{{.ID}}' | head -1)
    [ -n "$app_cid" ] && TG_BOT_TOKEN=$(docker exec "$app_cid" printenv TELEGRAM_BOT_TOKEN 2>/dev/null || true)
  fi
  if [ -z "$TG_CHAT_ID" ]; then
    local pg_cid
    pg_cid=$(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1)
    [ -n "$pg_cid" ] && TG_CHAT_ID=$(docker exec "$pg_cid" psql -U volkern_erp -d volkern_erp -t -A -c "SELECT credenciales->>'admin_chat_id' FROM integrations WHERE credenciales->>'admin_chat_id' IS NOT NULL LIMIT 1" 2>/dev/null | tr -d '[:space:]' || true)
  fi
}

tg_notify() { # $1 = emoji, $2 = título, $3 = detalle
  if [ -z "$TG_BOT_TOKEN" ] || [ -z "$TG_CHAT_ID" ]; then
    return 0
  fi
  local emoji="$1" titulo="$2" detalle="$3"
  local text
  text=$(printf '%s <b>%s</b>\n%s\n<i>%s</i>' "$emoji" "$titulo" "$detalle" "$(date -u '+%Y-%m-%d %H:%M UTC')")
  # Construir el JSON con python3 (escapado correcto); fallback a json con comillas simples
  local payload
  payload=$(TG_TEXT="$text" TG_CHAT="$TG_CHAT_ID" python3 -c '
import json, os
print(json.dumps({"chat_id": os.environ["TG_CHAT"], "text": os.environ["TG_TEXT"], "parse_mode": "HTML"}))
' 2>/dev/null) || payload=$(printf '{"chat_id": "%s", "text": "%s"}' "$TG_CHAT_ID" "$text")
  curl -s -o /dev/null --max-time 15 \
    -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    -d "$payload" \
    || true
}

on_exit() {
  local code=$?
  if [ "$DEPLOY_OK" = "1" ]; then
    tg_notify "✅" "Deploy Volkern ERP completado" "Imagen $IMAGE ($NEW_ID) corriendo en $SERVICE · $APP_URL OK"
  elif [ "$code" -ne 0 ]; then
    tg_notify "❌" "Deploy Volkern ERP FALLÓ" "El script abortó en el paso actual (exit $code). Revisa los logs en el VPS."
  fi
}
trap on_exit EXIT

tg_resolve_credentials
if [ -n "$TG_BOT_TOKEN" ] && [ -n "$TG_CHAT_ID" ]; then
  echo "→ Notificación Telegram: activa"
else
  echo "→ Notificación Telegram: no disponible (faltan credenciales)"
fi

echo "=== Deploy Volkern ERP ($(date)) ==="
echo "Tarball app:     $LATEST_TARBALL"
echo "Tarball migrator:${MIGRATOR_TARBALL:- (no se corren migraciones)}"

# ── 0. Preflight ────────────────────────────────────────────────
if ! docker node ls >/dev/null 2>&1; then
  echo "✗ docker no accesible o no es nodo Swarm. Ejecuta esto EN el VPS." >&2
  exit 1
fi
if [ ! -f "$LATEST_TARBALL" ]; then
  echo "✗ No existe $LATEST_TARBALL. Sube el tarball primero (scp)." >&2
  exit 1
fi

# ── 1. docker load del tarball latest (NUNCA omitir) ────────────
echo ""
echo "→ [1/5] docker load $LATEST_TARBALL ..."
docker load -i "$LATEST_TARBALL"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "✗ La imagen $IMAGE no quedó disponible tras el load." >&2
  exit 1
fi
NEW_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}' | cut -c8-19)
echo "   ✓ Imagen cargada: $IMAGE = $NEW_ID"

# ── 2. Migraciones (opcional) ───────────────────────────────────
if [ -n "$MIGRATOR_TARBALL" ]; then
  echo ""
  echo "→ [2/5] Migraciones con $MIGRATOR_TARBALL ..."
  bash "$(dirname "$0")/run-migrations.sh" "$MIGRATOR_TARBALL"
else
  echo ""
  echo "→ [2/5] Migraciones: omitidas (no se pasó tarball migrator)."
fi

# ── 3. service update forzado con la imagen recién cargada ──────
echo ""
echo "→ [3/5] service update --force --image $IMAGE en $SERVICE ..."
docker service update --force --image "$IMAGE" "$SERVICE"

# ── 4. Esperar convergencia de la nueva tarea ───────────────────
echo "→ [4/5] Esperando convergencia (máx. 180s) ..."
CONVERGED=0
for i in $(seq 1 60); do
  STATE=$(docker service ps "$SERVICE" --format '{{.CurrentState}} {{.Image}}' 2>/dev/null | head -1)
  # La primera tarea listada es la más reciente; converge cuando está
  # Running (o Complete para jobs; aquí es un servicio, así que Running).
  if echo "$STATE" | grep -qE '^Running'; then
    CONVERGED=1
    echo "   ✓ Tarea nueva corriendo: $STATE"
    break
  fi
  if echo "$STATE" | grep -qiE '(Shutdown|Failed|Rejected|Error)'; then
    echo "   ⚠️  La tarea no converge: $STATE"
    docker service ps "$SERVICE" --no-trunc --format '{{.CurrentState}} {{.Error}}' | head -3
    exit 1
  fi
  sleep 3
done
if [ "$CONVERGED" -eq 0 ]; then
  echo "✗ La tarea no llegó a Running en 180s. Estado:" >&2
  docker service ps "$SERVICE" --no-trunc | head -5 >&2
  exit 1
fi

# ── 5. Verificar que la app responde ────────────────────────────
echo "→ [5/5] Verificando $APP_URL ..."
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$APP_URL" || true)
  if [ "$CODE" = "200" ]; then
    echo "   ✓ $APP_URL responde HTTP 200"
    break
  fi
  echo "   · intento $i/10: HTTP ${CODE:-sin respuesta}, reintentando..."
  sleep 5
done
if [ "$CODE" != "200" ]; then
  echo "✗ La app no respondió 200 tras el deploy. Revisa los logs:" >&2
  docker service logs "$SERVICE" --tail 30 >&2
  exit 1
fi

# ── 6. Limpieza automática (por defecto; --keep la desactiva) ──
if [ "$CLEANUP" = "1" ]; then
  echo ""
  echo "→ [6/6] Limpieza automática de tarballs en /tmp ..."
  # Se eliminan también los residuos de despliegues anteriores para que
  # /tmp no acumule GBs (los tarballs ya están cargados en Docker).
  STALE=$(ls /tmp/volkern-erp-*.tar 2>/dev/null || true)
  if [ -z "$STALE" ]; then
    echo "   ✓ No hay tarballs que limpiar."
  else
    for t in $STALE; do rm -v "$t"; done
  fi
else
  echo ""
  echo "→ [6/6] Limpieza: omitida (--keep). Los tarballs se conservan en /tmp."
fi

DEPLOY_OK=1
echo ""
echo "=== Deploy completado: $IMAGE ($NEW_ID) corriendo en $SERVICE ==="
