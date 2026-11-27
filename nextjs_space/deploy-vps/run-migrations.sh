#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Job de migraciones — Volkern ERP
# Aplica `prisma migrate deploy` contra la BD de producción usando la
# imagen mínima `volkern-erp:migrator` (CLI de Prisma 6.7.0 + schema) como
# servicio Swarm one-shot (replicated-job) en la red DXnet.
# Se ejecuta EN EL VPS, ANTES del `service update`.
#
# ── Capa de seguridad (12-oct-2026) ──────────────────────────────
# `migrate deploy` aplica sin leer lo que ejecuta. Este job ahora
# interroga lo pendiente ANTES de tocar la base:
#
#   1. PUERTA DESTRUCTIVA (siempre): copia el SQL de las migraciones
#      pendientes del migrator al host y pasa `filtrar-destructivas.sh`
#      por él. DROP / TRUNCATE / DELETE o UPDATE sin WHERE / ALTER con
#      pérdida → exit 1 y la base NO se toca. Escapar exige flag
#      consciente que queda en el log:  --permitir-destructivas
#   2. BACKUP PREVIO (siempre que haya pendientes): pg_dump del
#      contenedor de Postgres a /root/backups/ con verificación
#      `gzip -t`, ANTES de aplicar nada. Fallar hacia "no migrar" es
#      barato; migrar sin red de seguridad no lo es. Escaparlo con
#      --sin-backup queda avisado en el log.
#
# ── Atadura al commit ──────────────────────────────────────
# El migrator se hornea con `org.opencontainers.image.revision=<commit>`.
# Antes de tocar la base se comprueba que esa label coincide con el commit
# esperado (el del runner que se va a desplegar, enviado por deploy-app.sh):
# un tarball de migrator de otro commit no puede aplicar su SQL. Si se pide
# verificar y la imagen no declara la label, también se aborta: sin datos no
# se puede afirmar que corresponda.
#
# Uso (en el VPS):
#   bash deploy-vps/run-migrations.sh [ruta_tarball_migrator] [--commit <sha>]
#   (si se pasa un tarball, primero hace docker load)
#
# Guardias: tests/filtrar-destructivas-guard.test.ts
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

MIGRATOR_TARBALL=""
PERMITIR_DESTRUCTIVAS=0
SIN_BACKUP=0
COMMIT_ESPERADO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --permitir-destructivas) PERMITIR_DESTRUCTIVAS=1 ;;
    --sin-backup)            SIN_BACKUP=1 ;;
    --commit)
      if [ $# -lt 2 ]; then
        echo "✗ --commit necesita el SHA esperado." >&2
        exit 2
      fi
      COMMIT_ESPERADO="$2"
      shift
      ;;
    --commit=*) COMMIT_ESPERADO="${1#--commit=}" ;;
    *)
      if [ -n "$MIGRATOR_TARBALL" ]; then
        echo "✗ Argumento inesperado: $1" >&2
        exit 2
      fi
      MIGRATOR_TARBALL="$1"
      ;;
  esac
  shift
done

JOB_NAME="volkern-erp-migrate-job"
DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"

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

# 1b. El migrator tiene que ser del mismo commit que se va a desplegar.
#     Va ANTES de leer pendientes y, sobre todo, antes de `migrate deploy`.
MIGRATOR_COMMIT=$(docker image inspect volkern-erp:migrator \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)
[ "$MIGRATOR_COMMIT" = "<no value>" ] && MIGRATOR_COMMIT=""

if [ -n "$COMMIT_ESPERADO" ]; then
  if [ -z "$MIGRATOR_COMMIT" ]; then
    echo "✗ El migrator no declara org.opencontainers.image.revision." >&2
    echo "  Esperado: $COMMIT_ESPERADO. Sin label no se puede verificar: no se migra." >&2
    exit 1
  fi
  if [ "$MIGRATOR_COMMIT" != "$COMMIT_ESPERADO" ]; then
    echo "✗ El migrator es de otro commit: se aborta antes de tocar la base." >&2
    echo "  Esperado (runner a desplegar): $COMMIT_ESPERADO" >&2
    echo "  Migrator del tarball:          $MIGRATOR_COMMIT" >&2
    exit 1
  fi
  echo "   ✓ Migrator del commit $MIGRATOR_COMMIT (coincide con el runner)"
else
  echo "   ⚠️  Sin --commit: no se puede verificar de qué commit es el migrator."
  [ -n "$MIGRATOR_COMMIT" ] && echo "      (la imagen declara $MIGRATOR_COMMIT)"
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

# ══ Capa de seguridad ══════════════════════════════════════════
# 2a. PUERTA DESTRUCTIVA: qué pendiente hay y qué contiene.
#     `prisma migrate status` desde el migrator dice exactamente qué
#     carpetas de `prisma/migrations` no están en `_prisma_migrations`.
#     El SQL de esas carpetas es lo que revisa `filtrar-destructivas.sh`
#     (función `sql_es_destructivo`, misma mecánica que el preflight).
echo ""
echo "→ [seguridad 1/2] Analizando migraciones pendientes..."
PENDIENTES_DIR=$(mktemp -d /tmp/pendientes-migraciones.XXXXXX)

#     ¿Qué está APLICADO hoy? Metadatos puros de `_prisma_migrations` vía
#     psql del contenedor de Postgres (nunca toca datos de clientes).
PG_CID=$(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1 || true)
if [ -z "$PG_CID" ]; then
  echo "✗ No se encontró el contenedor de Postgres: no se puede saber qué hay pendiente." >&2
  echo "  Sin saber qué se va a aplicar, la base no se toca: aborta." >&2
  exit 1
fi
APLICADAS=$(docker exec "$PG_CID" psql -U volkern_erp -d volkern_erp -t -A -c \
  "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" \
  | sort -u)
if [ -z "$APLICADAS" ]; then
  echo "✗ _prisma_migrations no devolvió filas: base inaccesible o sin baseline." >&2
  echo "  Sin conocer lo aplicado no se puede saber lo pendiente: aborta." >&2
  exit 1
fi

#     ¿Qué lleva el migrator? Carpetas de migración dentro de la imagen
#     (solo directorios: `migration_lock.toml` no es una migración).
CATALOGO=$(docker run --rm --entrypoint sh volkern-erp:migrator -c \
  "find /app/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort -u" 2>/dev/null) \
  || true
if [ -z "${CATALOGO:-}" ]; then
  echo "✗ No se pudo listar el catálogo de migraciones del migrator (imagen rota o sin esquema)." >&2
  exit 1
fi

PENDIENTES=$(comm -23 <(echo "$CATALOGO") <(echo "$APLICADAS") || true)
N_PENDIENTES=$(echo "$PENDIENTES" | grep -c . || true)

echo "   ✓ Pendientes identificadas contra la base real: $N_PENDIENTES"
if [ "$N_PENDIENTES" -gt 0 ]; then
  echo "   · $(echo "$PENDIENTES" | tr '\n' ' ')"

  #   La migración 160000 borra whatsapp_send_receipts. Un recibo `en_curso`
  #   es un envío que pudo salir y no consta terminado: se exporta y se
  #   aborta. La comprobación es de solo lectura.
  if echo "$PENDIENTES" | grep -qx '20261127160000_mcp_aprobacion_operation_id_unico'; then
    echo ""
    echo "→ [seguridad previa] Recibos de WhatsApp en curso..."
    if ! PG_CID="$PG_CID" bash "$DIR_SCRIPT/verificar-recibos-whatsapp.sh"; then
      echo "✗ La comprobación de recibos falló: la base NO se toca." >&2
      rm -rf "$PENDIENTES_DIR"
      exit 1
    fi
  fi

  #   Extraer el SQL de cada pendiente al host y revisarlo ANTES de
  #   aplicar nada (aquí la base está intacta aún).
  for m in $PENDIENTES; do
    mkdir -p "$PENDIENTES_DIR/$m"
    if ! docker run --rm --entrypoint cat volkern-erp:migrator \
         "/app/prisma/migrations/$m/migration.sql" > "$PENDIENTES_DIR/$m/migration.sql" 2>/dev/null || [ ! -s "$PENDIENTES_DIR/$m/migration.sql" ]; then
      echo "✗ No se pudo extraer el SQL de la migración '$m' del migrator." >&2
      rm -rf "$PENDIENTES_DIR"
      exit 1
    fi
  done

  #   La puerta: exit 1 si alguna pendiente contiene SQL destructivo.
  if ! bash "$DIR_SCRIPT/filtrar-destructivas.sh" "$PENDIENTES_DIR"; then
    if [ "$PERMITIR_DESTRUCTIVAS" = "1" ]; then
      echo "   ⚠️  --permitir-destructivas: se continúa por petición explícita (queda en el log)."
    else
      echo "✗ SQL destructivo en la serie pendiente: la base NO se toca." >&2
      echo "  Si es una migración destructiva intencional, repásala a mano, verifica" >&2
      echo "  el backup y relanza con --permitir-destructivas." >&2
      rm -rf "$PENDIENTES_DIR"
      exit 1
    fi
  else
    echo "   ✓ Ninguna migración pendiente contiene SQL destructivo."
  fi
fi

rm -rf "$PENDIENTES_DIR"
if [ "$N_PENDIENTES" -gt 0 ]; then HAY_PENDIENTES=1; else HAY_PENDIENTES=0; fi

# 2b. BACKUP PREVIO: pg_dump completo y verificado del Postgres del VPS.
#     Solo si hay pendientes y el operador no pidió escaparse.
if [ "$HAY_PENDIENTES" = "1" ] && [ "$SIN_BACKUP" = "0" ]; then
  echo ""
  echo "→ [seguridad 2/2] Backup previo (pg_dump + gzip -t) ..."
  BACKUP_DIR=/root/backups
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/volkern_erp-pre-migraciones-$TIMESTAMP.sql.gz"
  if [ -n "$PG_CID" ]; then
    docker exec "$PG_CID" pg_dump -U volkern_erp -d volkern_erp | gzip > "$BACKUP_FILE"
    if gzip -t "$BACKUP_FILE"; then
      echo "   ✓ Backup verificado: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    else
      echo "✗ El backup quedó corrupto (gzip -t falló). NO se aplican migraciones." >&2
      rm -f "$BACKUP_FILE"
      exit 1
    fi
  else
    echo "✗ No se encontró el contenedor de Postgres para el backup." >&2
    echo "  Migrar sin backup es lo que este paso evita: aborta." >&2
    exit 1
  fi
elif [ "$SIN_BACKUP" = "1" ]; then
  echo ""
  echo "   ⚠️  --sin-backup: se omite el pg_dump por petición explícita (queda en el log)."
elif [ "$HAY_PENDIENTES" = "0" ]; then
  echo ""
  echo "→ [seguridad 2/2] Backup omitido: sin pendientes no hay nada que proteger."
fi

# 3. Limpiar job anterior si quedó
docker service rm "$JOB_NAME" >/dev/null 2>&1 || true

# 4. Ejecutar migrate deploy como servicio Swarm one-shot (replicated-job)
#    en la red DXnet (overlay, no attachable manualmente → requiere service).
# `timeout`: el CLI de Docker se ha quedado colgado en este punto con el servicio ya
# creado (imprime el ID, avisa de la falta de digest y nunca retorna). Con
# `set -euo pipefail` eso paraba el despliegue para siempre ANTES del `service
# update`, sin error y sin actualizar nada. Acotarlo no oculta el resultado: el job
# existe igualmente y el paso 5 comprueba lo que de verdad importa —si completó y
# qué dijo—, así que aquí solo se evita que un CLI mudo bloquee el pipeline.
echo "→ Ejecutando prisma migrate deploy (servicio job)..."
if ! timeout 120 docker service create --quiet \
  --name "$JOB_NAME" \
  --mode replicated-job \
  --restart-condition none \
  --network DXnet \
  --env "DATABASE_URL=$DATABASE_URL" \
  volkern-erp:migrator migrate deploy; then
  echo "   ⚠️  docker service create no retornó en 120s (o falló). Se comprueba igualmente el job."
fi

# 4b. Si el servicio no llegó a existir, no hay nada que esperar: mejor decirlo con
#     claridad que esperar 120s a un job que no está.
if ! docker service inspect "$JOB_NAME" >/dev/null 2>&1; then
  echo "✗ El job de migraciones no llegó a crearse ($JOB_NAME)." >&2
  exit 1
fi

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
