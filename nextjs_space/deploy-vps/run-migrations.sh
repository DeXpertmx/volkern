#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Job de migraciones — Volkern ERP
# Aplica `prisma migrate deploy` contra la BD de producción usando la
# imagen mínima `volkern-erp:migrator` (CLI de Prisma 6.7.0 + schema).
# Se ejecuta EN EL VPS, ANTES del `service update` (ver flujo en
# deploy-vps/README o el deploy manual).
#
# Uso (en el VPS):
#   bash deploy-vps/run-migrations.sh [ruta_tarball_migrator]
#   (si se pasa un tarball, primero hace docker load)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

MIGRATOR_TARBALL="${1:-/tmp/volkern-erp-migrator.tar}"

echo "=== Job de migraciones Volkern ERP ($(date)) ==="

# 1. Cargar la imagen migrator si viene un tarball
if [ -f "$MIGRATOR_TARBALL" ]; then
  echo "→ Cargando imagen migrator desde $MIGRATOR_TARBALL..."
  docker load -i "$MIGRATOR_TARBALL"
fi

if ! docker image inspect volkern-erp:migrator >/dev/null 2>&1; then
  echo "✗ Imagen volkern-erp:migrator no disponible. Cárgala primero (docker load)." >&2
  exit 1
fi

# 2. Obtener el DATABASE_URL del servicio en producción
echo "→ Obteniendo DATABASE_URL del servicio volkern-erp_app..."
DATABASE_URL=$(docker service inspect volkern-erp_app \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep '^DATABASE_URL=' | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then
  echo "✗ No se pudo obtener DATABASE_URL del servicio." >&2
  exit 1
fi

# 3. Ejecutar migrate deploy (job one-shot en la red DXnet)
echo "→ Ejecutando prisma migrate deploy..."
docker run --rm \
  --network DXnet \
  -e DATABASE_URL="$DATABASE_URL" \
  volkern-erp:migrator migrate deploy

echo "=== Migraciones aplicadas correctamente ==="
