#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Job de migraciones — Volkern ERP
# Aplica `prisma migrate deploy` contra la BD de producción usando la
# imagen mínima `volkern-erp:migrator` (CLI de Prisma 6.7.0 + schema) como
# servicio Swarm one-shot (replicated-job) en la red DXnet.
# Se ejecuta EN EL VPS, ANTES del `service update`.
#
# Uso (en el VPS):
#   bash deploy-vps/run-migrations.sh [ruta_tarball_migrator]
#   (si se pasa un tarball, primero hace docker load)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

MIGRATOR_TARBALL="${1:-/tmp/volkern-erp-migrator.tar}"
JOB_NAME="volkern-erp-migrate-job"

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

# 3. Limpiar job anterior si quedó
docker service rm "$JOB_NAME" >/dev/null 2>&1 || true

# 4. Ejecutar migrate deploy como servicio Swarm one-shot (replicated-job)
#    en la red DXnet (overlay, no attachable manualmente → requiere service).
echo "→ Ejecutando prisma migrate deploy (servicio job)..."
docker service create --quiet \
  --name "$JOB_NAME" \
  --mode replicated-job \
  --restart-condition none \
  --network DXnet \
  --env "DATABASE_URL=$DATABASE_URL" \
  volkern-erp:migrator migrate deploy

# 5. Esperar a que el job termine (máx. 120s)
echo "→ Esperando a que el job termine..."
for i in $(seq 1 40); do
  RUNNING=$(docker service ps "$JOB_NAME" --format '{{.CurrentState}}' 2>/dev/null | grep -cE 'Running' || true)
  COMPLETE=$(docker service ps "$JOB_NAME" --format '{{.CurrentState}}' 2>/dev/null | grep -cE 'Complete' || true)
  if [ "$COMPLETE" -gt 0 ]; then
    echo "   ✓ Job completado."
    break
  fi
  if [ "$RUNNING" -eq 0 ] && [ "$COMPLETE" -eq 0 ]; then
    echo "   ⚠️  Job no está corriendo ni completado; estado:"
    docker service ps "$JOB_NAME" --format '{{.CurrentState}}' | head -3
    break
  fi
  sleep 3
done

# 6. Mostrar el log del job (el resultado de migrate deploy)
echo "→ Log del job:"
docker service logs "$JOB_NAME" 2>&1 | tail -20 || true

# 7. Verificar el código de salida del task
EXIT_CODE=$(docker service ps "$JOB_NAME" --format '{{.Status.Err}} {{.Error}}' 2>/dev/null | head -1)
if echo "$EXIT_CODE" | grep -qiE 'task: non-zero exit'; then
  echo "✗ migrate deploy falló (exit != 0). Revisa el log del job." >&2
  docker service rm "$JOB_NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo "=== Migraciones aplicadas correctamente ==="
docker service rm "$JOB_NAME" >/dev/null 2>&1 || true
