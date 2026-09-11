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
# `|| true`: con `set -o pipefail`, un grep sin coincidencias haría fallar la
# asignación y abortaría el script antes de poder dar el error claro de abajo.
DATABASE_URL=$(docker service inspect volkern-erp_app \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep '^DATABASE_URL=' | cut -d= -f2- || true)
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
    docker service ps "$JOB_NAME" --format '{{.CurrentState}}' 2>/dev/null | head -3 || true
    break
  fi
  sleep 3
done

# 6. Mostrar el log del job (el resultado de migrate deploy)
echo "→ Log del job:"
docker service logs "$JOB_NAME" 2>&1 | tail -20 || true

# 7. Verificar el resultado real del job.
#
# OJO: NO usar el campo `.Status.Err`. Docker >= 26 lo eliminó de
# `docker service ps` y la consulta falla con «can't evaluate field Status
# in type *task.taskContext». Como el stderr iba a /dev/null y el script usa
# `set -euo pipefail`, la comprobación abortaba el script EN SILENCIO justo
# después de aplicar las migraciones y ANTES del `service update`: las
# migraciones quedaban aplicadas pero el servicio seguía con la imagen
# vieja, y nadie se enteraba. Se lee el estado real de la tarea.
#
# `|| true` en la sustitución: `head -1` cierra el pipe antes de tiempo y con
# `pipefail` un SIGPIPE haría fallar la asignación.
JOB_STATE=$(docker service ps "$JOB_NAME" --format '{{.CurrentState}} {{.Error}}' 2>/dev/null | head -1 || true)
echo "→ Estado del job: ${JOB_STATE:-desconocido}"

if echo "$JOB_STATE" | grep -qiE 'Failed|Rejected|Shutdown|Error'; then
  echo "✗ migrate deploy falló. Revisa el log del job." >&2
  docker service rm "$JOB_NAME" >/dev/null 2>&1 || true
  exit 1
fi

if ! echo "$JOB_STATE" | grep -qiE 'Complete'; then
  echo "✗ El job de migraciones no llegó a Complete. Estado: $JOB_STATE" >&2
  docker service rm "$JOB_NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo "=== Migraciones aplicadas correctamente ==="
docker service rm "$JOB_NAME" >/dev/null 2>&1 || true
