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
#
# Uso (desde el repo, puede pedir sudo para docker):
#   bash deploy-vps/deploy-local.sh
#   bash deploy-vps/deploy-local.sh --skip-build     # solo re-exporta y despliega
#   bash deploy-vps/deploy-local.sh --skip-migrator  # no construye/subé migrator (sin cambios de BD)
#   bash deploy-vps/deploy-local.sh --skip-smoke     # no ejecuta el smoke post-despliegue
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

LATEST_TAR=/tmp/volkern-erp-latest.tar
MIGRATOR_TAR=/tmp/volkern-erp-migrator.tar
KEEP_LOCAL=0
KEEP_REMOTE=""
SKIP_BUILD=0
SKIP_MIGRATOR=0
SKIP_SMOKE=0

for a in "$@"; do
  case "$a" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-migrator) SKIP_MIGRATOR=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
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
  echo "→ [1/5] Build de volkern-erp:latest${SKIP_MIGRATOR:+ (sin migrator)} (puede tardar 10-20 min) ..."
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
for s in auditar-superficie.sh vigilar-crons-heredados.sh; do
  $SCP "deploy-vps/$s" "$VPS:/root/$s"
  $SSH "$VPS" "chmod 700 /root/$s"
done

# Verificación de identidad repo↔VPS de los centinelas: si las reglas del
# baseline derivan entre copias, los crons del VPS compararían contra un
# runbook viejo y la deriva real pasaría como conforme
# (docs/VPS-SEGURIDAD-PUERTOS.md §10–§11).
for s in auditar-superficie.sh vigilar-crons-heredados.sh; do
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
# Limpieza local opcional (los del VPS los limpia deploy-app.sh)
# ═══════════════════════════════════════════════════════════════
if [ "$KEEP_LOCAL" = "0" ]; then
  echo ""
  echo "→ Limpieza local: eliminando tarballs de /tmp ..."
  rm -f "$LATEST_TAR" "$MIGRATOR_TAR"
fi

# El smoke se evalúa AL FINAL para que la limpieza de tarballs ocurra siempre,
# pero un fallo no se silencia: la app ya corre la imagen nueva y hay que decirlo.
if [ "$SMOKE_RC" -ne 0 ]; then
  echo ""
  echo "=== Deploy aplicado, pero el SMOKE TEST FALLÓ ==="
  echo "La app ya corre la imagen nueva, pero no resolvió las frases del clasificador sin LLM."
  exit "$SMOKE_RC"
fi

echo ""
echo "=== Deploy completado (local → VPS) ==="
