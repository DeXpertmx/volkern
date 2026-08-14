#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Build de la imagen volkern-erp con NEXT_PUBLIC_* horneados
# Corre en background con log en /tmp/volkern-build.log
# Uso (con elevación): bash deploy-vps/build-imagen.sh
# ═══════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

LOG=/tmp/volkern-build.log
exec > >(tee "$LOG") 2>&1

echo "=== Build volkern-erp ($(date)) ==="
echo "Contexto: $(pwd)"
docker version --format 'docker {{.Server.Version}}' || { echo "✗ docker no accesible"; exit 1; }

# ── Reunir NEXT_PUBLIC_* (producción local + dev como fallback) ──
declare -A VARS
while IFS='=' read -r k v; do
  [ -n "$k" ] && VARS["$k"]="${v%\"}"; VARS["$k"]="${VARS[$k]#\"}"
done < <(cat .env.production.local .env 2>/dev/null | grep -E '^NEXT_PUBLIC_[A-Z_]+=')

# Dominio canónico: se lee de deploy-vps/.env.vps (fuente de verdad del despliegue)
APP_URL=$(grep -E '^NEXT_PUBLIC_APP_URL=' deploy-vps/.env.vps 2>/dev/null | cut -d= -f2-)
APP_URL="${APP_URL%\"}"; APP_URL="${APP_URL#\"}"   # quitar comillas literales si las trae
VARS[NEXT_PUBLIC_APP_URL]="${APP_URL:-https://volkern.app}"

ARGS=()
for k in "${!VARS[@]}"; do
  ARGS+=(--build-arg "$k=${VARS[$k]}")
done
echo "Build args NEXT_PUBLIC (${#ARGS[@]}/2 claves): $(printf '%s\n' "${!VARS[@]}" | sort | tr '\n' ' ')"

echo "=== docker build (puede tardar 10-20 min) ==="
docker build --progress=plain "${ARGS[@]}" -t volkern-erp:latest .
echo "=== Build OK: $(docker image inspect volkern-erp:latest --format '{{.Size}} bytes') ==="

# ── Imagen migrator (job de migraciones, sin el CLI en el runner) ──
# Se construye con el mismo contexto y las capas del builder ya cacheadas.
# docker build --target migrator usa la misma cache de las etapas deps/builder.
echo "=== docker build migrator (target) ==="
docker build --progress=plain "${ARGS[@]}" --target migrator -t volkern-erp:migrator .
echo "=== Migrator OK: $(docker image inspect volkern-erp:migrator --format '{{.Size}} bytes') ==="
