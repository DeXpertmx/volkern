#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Deploy UN SOLO COMANDO — Volkern ERP
#
# Encadena todo el pipeline local → VPS:
#   1. Build local de volkern-erp:latest (runner) + :migrator
#   2. docker save → tarballs en /tmp
#   3. scp de los tarballs (+ scripts de deploy) al VPS
#   4. Ejecuta deploy-app.sh EN el VPS (load → migraciones → update → verificar)
#   5. Smoke test del clasificador determinista contra el entorno desplegado
#      (scripts/smoke-clasificador.sh). Falla el despliegue si el servicio
#      desplegado no resuelve las frases sin LLM.
#   5b. Smoke test MCP (scripts/smoke-mcp.sh): valida contra el entorno
#      desplegado la Server Card, initialize, tools/list (catálogo sincronizado
#      con la card) y que tools/call sin credenciales responda 401. Falla el
#      despliegue si la superficie MCP está rota o abierta.
#   5c. (Opcional, --e2e-mcp) E2E autenticado MCP (scripts/mcp-e2e.sh):
#      circuito completo auth→skill→audit con API keys temporales creadas en
#      BD y borradas al final. Recomendado tras despliegues que tocan /mcp,
#      la auth de API keys o los skills.
#   5d. (Opcional, --e2e-flujo) E2E de flujo comercial completo además del
#      circuito (5c): lead→deal→cotización→orden vía /mcp con los contratos
#      del catálogo; crea datos temporales en BD y los borra al final
#      (dispara 1 aviso Telegram puntual). Recomendado tras despliegues que
#      toquen leads, deals, cotizaciones u órdenes.
#
#      El RESULTADO de smokes y E2E se notifica por Telegram vía apprise del
#      VPS (best-effort): aviso de fallo con el componente roto, y de cierre
#      correcto al terminar.
#
#      Además, el centinela vigilar-mcp.sh se sincroniza al VPS junto con
#      los otros (con verificación SHA-256) y su cron cada 15 minutos
#      (/etc/cron.d/vigilar-mcp) se asegura aquí de forma idempotente.
#
# Uso (desde el repo, puede pedir sudo para docker):
#   bash deploy-vps/deploy-local.sh
#   bash deploy-vps/deploy-local.sh --skip-build     # solo re-exporta y despliega
#   bash deploy-vps/deploy-local.sh --skip-migrator  # no construye/subé migrator (sin cambios de BD)
#   bash deploy-vps/deploy-local.sh --skip-smoke     # no ejecuta el smoke del clasificador
#   bash deploy-vps/deploy-local.sh --skip-smoke-mcp # no ejecuta el smoke MCP (/mcp + Server Card)
#   bash deploy-vps/deploy-local.sh --e2e-mcp        # ejecuta también el E2E autenticado MCP (paso 5c)
#   bash deploy-vps/deploy-local.sh --e2e-flujo      # 5c + 5d: circuito + flujo comercial completo (leads/deals/cotizaciones/órdenes)
#   bash deploy-vps/deploy-local.sh --keep-tarballs  # no borra tarballs en /tmp local
#   bash deploy-vps/deploy-local.sh --keep           # pasa --keep a deploy-app.sh (no limpia en VPS)
#
# Flags de deploy-app.sh (migraciones opcionales) se pueden añadir después de --:
#   bash deploy-vps/deploy-local.sh -- --cleanup      # (por defecto ya limpia)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."

VPS="root@62.171.134.195"
SSH_KEY="${VOLKERN_SSH_KEY:-$HOME/.ssh/id_buffy_volkern}"
# Si el script corre elevado (sudo/root) y la clave no está en /root/.ssh,
# buscarla en los homes de usuarios reales (ej. /home/*/.ssh).
if [ ! -f "$SSH_KEY" ]; then
  for candidate in /home/*/.ssh/id_buffy_volkern; do
    if [ -f "$candidate" ]; then SSH_KEY="$candidate"; break; fi
  done
fi
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=30"
SCP="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

# ── Aviso por Telegram vía apprise del VPS ────────────────────────
# Misma mecánica que vigilar-mcp.sh (que corre EN el VPS): aquí va por SSH
# porque el pipeline corre en local. Best-effort: un fallo del aviso nunca
# afecta al resultado del deploy, y el HTTP de apprise queda en el log.
avisar_telegram() {
  local SALIDA
  # ssh concatena sus argumentos en una sola línea y el shell remoto los parte
  # por espacios: pasar título/cuerpo como args posicionales los fragmentaba
  # (y "${3:-warning}" recibía una palabra del cuerpo → apprise HTTP 400).
  # Se viajan como asignaciones TITLE/MSG/TYPE escapadas con printf %q, que
  # sobreviven al particionado del shell remoto y llegan íntegras al entorno
  # de bash -s.
  SALIDA=$($SSH "$VPS" "$(printf 'TITLE=%q MSG=%q TYPE=%q bash -s' "$1" "$2" "${3:-warning}")" <<'EOF_APRISE'
docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^apprise_apprise-api' || exit 0
A=$(docker ps --filter name=apprise_apprise-api --format '{{.Names}}' | head -1)
URLS=$(sed -n 's#^tgram://\([^?]*\)$#tgram://\1/646107192#p' /var/lib/docker/volumes/apprise_apprise-data/_data/apprise.cfg 2>/dev/null) || exit 0
[ -z "$URLS" ] && exit 0
JSON=$(python3 - "$URLS" "$TITLE" "$MSG" "$TYPE" <<'PYAP'
import json, sys
print(json.dumps({"urls": sys.argv[1], "title": sys.argv[2], "body": sys.argv[3], "type": sys.argv[4]}))
PYAP
) || exit 0
HTTP=$(docker exec "$A" curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8000/notify -H 'Content-Type: application/json' -d "$JSON") || exit 0
echo "Telegram: apprise respondió HTTP $HTTP"
EOF_APRISE
) || true
  if [ -n "$SALIDA" ]; then echo "   · $SALIDA"; fi
  return 0
}

LATEST_TAR=/tmp/volkern-erp-latest.tar
MIGRATOR_TAR=/tmp/volkern-erp-migrator.tar
KEEP_LOCAL=0
KEEP_REMOTE=""
SKIP_BUILD=0
SKIP_MIGRATOR=0
SKIP_SMOKE=0
SKIP_SMOKE_MCP=0
E2E_MCP=0
E2E_FLUJO=0

for a in "$@"; do
  case "$a" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-migrator) SKIP_MIGRATOR=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    --skip-smoke-mcp) SKIP_SMOKE_MCP=1 ;;
    --e2e-mcp) E2E_MCP=1 ;;
    --e2e-flujo) E2E_FLUJO=1; E2E_MCP=1 ;;   # el flujo corre además del circuito (5c)
    --keep-tarballs) KEEP_LOCAL=1 ;;
    --keep) KEEP_REMOTE="--keep" ;;
  esac
done

# ── Wrapper docker: usa sudo si el usuario no tiene acceso al daemon ──
docker_cmd() {
  if docker version >/dev/null 2>&1; then
    docker "$@"
  else
    echo "→ docker sin acceso directo, usando sudo..."
    sudo docker "$@"
  fi
}

# ═══════════════════════════════════════════════════════════════
# 1. BUILD
# ═══════════════════════════════════════════════════════════════
if [ "$SKIP_BUILD" = "1" ]; then
  echo "→ [1/5] Build: omitido (--skip-build). Usando imágenes ya construidas."
else
  echo ""
  # Ojo con `${SKIP_MIGRATOR:+…}`: la variable es 0/1, así que con "0" (el
  # migrator SÍ se construye) la expansión también imprimía «sin migrator» y la
  # línea mentía sobre lo que se iba a construir. Se decide por valor, no por
  # estar definida.
  if [ "$SKIP_MIGRATOR" = "1" ]; then
    MIGRATOR_SUFIJO=" (sin migrator)"
  else
    MIGRATOR_SUFIJO=" (con migrator)"
  fi
  echo "→ [1/5] Build de volkern-erp:latest${MIGRATOR_SUFIJO} (puede tardar 10-20 min) ..."
  if ! docker_cmd version >/dev/null 2>&1; then
    echo "✗ docker no accesible ni con sudo. Revisa el daemon." >&2
    exit 1
  fi
  if [ "$SKIP_MIGRATOR" = "1" ]; then
    bash deploy-vps/build-imagen.sh --skip-migrator
  else
    bash deploy-vps/build-imagen.sh
  fi
fi

# ═══════════════════════════════════════════════════════════════
# 2. EXPORT (docker save → tarballs)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "→ [2/5] Exportando imágenes a tarballs ..."
docker_cmd save -o "$LATEST_TAR" volkern-erp:latest
TARBALLS="$LATEST_TAR"
if [ "$SKIP_MIGRATOR" = "1" ]; then
  echo "   · migrator omitido (--skip-migrator)"
  rm -f "$MIGRATOR_TAR"
else
  docker_cmd save -o "$MIGRATOR_TAR" volkern-erp:migrator
  TARBALLS="$TARBALLS $MIGRATOR_TAR"
fi
# docker save con sudo crea archivos root; hay que hacerlos legibles para scp
for t in $TARBALLS; do
  [ -r "$t" ] || sudo chmod 644 "$t"
done
ls -lh $TARBALLS

# ═══════════════════════════════════════════════════════════════
# 3. SCP al VPS
# ═══════════════════════════════════════════════════════════════
echo ""
echo "→ [3/5] Subiendo tarballs y scripts al VPS ..."
$SSH "$VPS" "mkdir -p /root/deploy-vps" >/dev/null 2>&1 || true
$SCP $TARBALLS "$VPS:/tmp/"
# Los scripts del repo son la fuente de verdad; se sincronizan en cada deploy
$SCP deploy-vps/deploy-app.sh deploy-vps/run-migrations.sh "$VPS:/root/deploy-vps/"
# Los centinelas de seguridad del VPS se sincronizan (el repo manda sobre
# la copia del VPS) y su identidad se verifica abajo, antes de tocar nada.
for s in auditar-superficie.sh vigilar-crons-heredados.sh vigilar-mcp.sh; do
  $SCP "deploy-vps/$s" "$VPS:/root/$s"
  $SSH "$VPS" "chmod 700 /root/$s"
done

# Verificación de identidad repo↔VPS de los centinelas: si las reglas del
# baseline derivan entre copias, los crons del VPS compararían contra un
# runbook viejo y la deriva real pasaría como conforme
# (docs/VPS-SEGURIDAD-PUERTOS.md §10–§11).
for s in auditar-superficie.sh vigilar-crons-heredados.sh vigilar-mcp.sh; do
  LOCAL_SHA=$(sha256sum "deploy-vps/$s" | cut -d' ' -f1)
  REMOTE_SHA=$($SSH "$VPS" "sha256sum /root/$s | cut -d' ' -f1")
  if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
    echo "✗ El $s del VPS NO es idéntico al del repo" >&2
    echo "  repo=$LOCAL_SHA  vps=$REMOTE_SHA" >&2
    echo "  No se continúa: sincroniza la copia y revisa quién la cambió en el VPS." >&2
    exit 1
  fi
  echo "   · $s repo↔VPS idéntico (${LOCAL_SHA:0:12}…)"
done

# Cron del centinela MCP: cada 15 minutos, idempotente (si el fichero ya
# existe NO se toca: el horario local del VPS manda sobre el del repo).
$SSH "$VPS" "if [ ! -f /etc/cron.d/vigilar-mcp ]; then printf '%s\n' \
  'SHELL=/bin/bash' \
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
  '# Vigilante MCP cada 15 min: superficie /mcp + Server Card del entorno desplegado' \
  '*/15 * * * * root /root/vigilar-mcp.sh >> /var/log/vigilar-mcp.log 2>&1 || true' \
  > /etc/cron.d/vigilar-mcp && chmod 644 /etc/cron.d/vigilar-mcp; fi"

# ═══════════════════════════════════════════════════════════════
# 4. DEPLOY REMOTO (load → migraciones → update → verificar → limpiar)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "→ [4/5] Ejecutando deploy en el VPS ..."
if [ "$SKIP_MIGRATOR" = "1" ]; then
  $SSH "$VPS" "bash /root/deploy-vps/deploy-app.sh /tmp/volkern-erp-latest.tar $KEEP_REMOTE"
else
  $SSH "$VPS" "bash /root/deploy-vps/deploy-app.sh /tmp/volkern-erp-latest.tar /tmp/volkern-erp-migrator.tar $KEEP_REMOTE"
fi

# ═══════════════════════════════════════════════════════════════
# 5. SMOKE TEST POST-DESPLIEGUE
# ═══════════════════════════════════════════════════════════════
# Comprueba contra el servicio YA desplegado (no contra el repo) que las
# frases del clasificador se resuelven sin LLM. Sin este paso, un despliegue
# que no incorpore el arreglo pasa en verde: la guardia de vitest valida el
# código local, no la imagen que está sirviendo.
SMOKE_RC=0
echo ""
if [ "$SKIP_SMOKE" = "1" ]; then
  echo "→ [5/5] Smoke test: omitido (--skip-smoke)."
else
  echo "→ [5/5] Smoke test del clasificador determinista ..."
  bash scripts/smoke-clasificador.sh || SMOKE_RC=$?
fi

# ═══════════════════════════════════════════════════════════════
# 5b. SMOKE TEST MCP (/mcp + Server Card)
# ═══════════════════════════════════════════════════════════════
# Misma razón que el paso 5: un despliegue que no incorpore los cambios del
# MCP (catálogo desincronizado de la card, /mcp sin auth, initialize roto)
# pasa en verde si solo se mira el código local. Esto mira el servicio real.
SMOKE_MCP_RC=0
echo ""
if [ "$SKIP_SMOKE_MCP" = "1" ]; then
  echo "→ [5b/5] Smoke test MCP: omitido (--skip-smoke-mcp)."
else
  echo "→ [5b/5] Smoke test MCP (/mcp + Server Card) ..."
  bash scripts/smoke-mcp.sh || SMOKE_MCP_RC=$?
fi

# ═══════════════════════════════════════════════════════════════
# 5c. (Opcional) E2E AUTENTICADO MCP
# ═══════════════════════════════════════════════════════════════
# Corre SOLO con --e2e-mcp: crea API keys temporales en BD (se borran al
# final, incluso si falla) y valida el circuito auth→skill→audit contra
# el entorno desplegado.
E2E_MCP_RC=0
echo ""
if [ "$E2E_MCP" = "1" ]; then
  echo "→ [5c/5] E2E autenticado MCP (circuito auth→skill→audit) ..."
  bash scripts/mcp-e2e.sh || E2E_MCP_RC=$?
else
  echo "→ [5c/5] E2E autenticado MCP: omitido (usa --e2e-mcp o --e2e-flujo para ejecutarlo)."
fi

# ═══════════════════════════════════════════════════════════════
# 5d. (Opcional) E2E DE FLUJO COMERCIAL COMPLETO
# ═══════════════════════════════════════════════════════════════
# Corre con --e2e-flujo (implica --e2e-mcp): además del circuito del paso
# anterior, ejecuta el flujo completo lead→deal→cotización→orden vía /mcp
# con los contratos del catálogo. Crea datos temporales en BD y los borra al
# final (incluso si falla); dispara 1 notificación Telegram puntual.
E2E_FLUJO_RC=0
echo ""
if [ "$E2E_FLUJO" = "1" ]; then
  echo "→ [5d/5] E2E MCP flujo comercial completo (lead→deal→cotización→orden) ..."
  bash scripts/mcp-e2e.sh --flujo-completo || E2E_FLUJO_RC=$?
else
  echo "→ [5d/5] E2E flujo comercial: omitido (usa --e2e-flujo para ejecutarlo)."
fi

# ═══════════════════════════════════════════════════════════════
# Limpieza local opcional (los del VPS los limpia deploy-app.sh)
# ═══════════════════════════════════════════════════════════════
if [ "$KEEP_LOCAL" = "0" ]; then
  echo ""
  echo "→ Limpieza local: eliminando tarballs de /tmp ..."
  rm -f "$LATEST_TAR" "$MIGRATOR_TAR"
fi

# Los smokes se evalúan AL FINAL para que la limpieza de tarballs ocurra
# siempre, pero un fallo no se silencia: la app ya corre la imagen nueva y
# hay que decirlo.
if [ "$SMOKE_RC" -ne 0 ] || [ "$SMOKE_MCP_RC" -ne 0 ] || [ "$E2E_MCP_RC" -ne 0 ] || [ "$E2E_FLUJO_RC" -ne 0 ]; then
  echo ""
  echo "=== Deploy aplicado, pero un SMOKE/E2E FALLÓ ==="
  if [ "$SMOKE_RC" -ne 0 ]; then
    echo "· Clasificador: la app no resolvió las frases sin LLM."
  fi
  if [ "$SMOKE_MCP_RC" -ne 0 ]; then
    echo "· MCP: la superficie /mcp (card, initialize, tools/list, auth) está rota o abierta en el entorno desplegado."
  fi
  if [ "$E2E_MCP_RC" -ne 0 ]; then
    echo "· E2E MCP: el circuito autenticado (auth→skill→audit) falló en el entorno desplegado."
  fi
  if [ "$E2E_FLUJO_RC" -ne 0 ]; then
    echo "· E2E flujo: el flujo comercial completo (lead→deal→cotización→orden) falló en el entorno desplegado."
  fi
  FALLIDOS=""
  if [ "$SMOKE_RC" -ne 0 ]; then FALLIDOS="$FALLIDOS clasificador"; fi
  if [ "$SMOKE_MCP_RC" -ne 0 ]; then FALLIDOS="$FALLIDOS smoke-mcp"; fi
  if [ "$E2E_MCP_RC" -ne 0 ]; then FALLIDOS="$FALLIDOS e2e-circuito"; fi
  if [ "$E2E_FLUJO_RC" -ne 0 ]; then FALLIDOS="$FALLIDOS e2e-flujo"; fi
  avisar_telegram "Deploy Volkern: verificación FALLIDA" "Deploy aplicado en https://volkern.app pero falló:$FALLIDOS · hora: $(date -Is)"
  for rc in "$SMOKE_RC" "$SMOKE_MCP_RC" "$E2E_MCP_RC" "$E2E_FLUJO_RC"; do
    if [ "$rc" -ne 0 ]; then exit "$rc"; fi
  done
fi

echo ""
echo "=== Deploy completado (local → VPS) ==="
avisar_telegram "Deploy Volkern completado" "volkern-erp desplegado en https://volkern.app · smokes/E2E sin fallos · $(date -Is)" info
