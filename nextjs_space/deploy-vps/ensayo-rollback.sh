#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Ensayo de restauración y rollback — SOLO SOBRE UNA COPIA.
#
# Levanta un PostgreSQL desechable (red y volumen propios), restaura el backup
# en una base, aplica las migraciones con la imagen migrator, restaura el mismo
# backup en una segunda base y comprueba que esquema y datos vuelven al estado
# inicial. Cada fase queda medida en tiempos.tsv.
#
# Alcance: fases de base de datos. El smoke de las imágenes nueva/anterior
# sigue siendo manual; aquí no se arranca la aplicación.
#
# La imagen de --migrator debe estar construida con el prisma/ del commit que
# se va a desplegar: es la que aplica las migraciones del ensayo. Con una
# imagen vieja (sin las migraciones nuevas) `migrate deploy` no tiene nada que
# aplicar y la fase "Verificar migración" aborta con el esquema sin cambiar;
# el ensayo no mide nada. Compruébalo antes: la imagen tiene que listar las
# cuatro migraciones nuevas (20261127160000, 20261127200000, 20261127210000 y
# 20261127220000) dentro de prisma/migrations.
#
# No usa compose, ni el contenedor, ni la red de producción: solo crea y usa
# recursos `volkern-ensayo-*`. Guardas y opciones: --help.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
BACKUP=""
MIGRATOR_IMAGE="volkern-erp:migrator"
PG_IMAGE="postgres:16-alpine"
CONSERVAR=0
CONFIRMO=0

uso() {
  cat <<'EOF'
Ensayo de restauración y rollback — SOLO SOBRE UNA COPIA.

Uso:
  bash deploy-vps/ensayo-rollback.sh --backup <archivo.sql.gz> --confirmo-copia

Opciones:
  --backup <archivo>    Dump gzip de la copia a ensayar (obligatorio)
  --migrator <imagen>   Imagen con Prisma y prisma/migrations construida con el
                        prisma/ del commit a desplegar (def. volkern-erp:migrator).
                        Una imagen vieja hace abortar "Verificar migración".
  --pg-image <imagen>   Imagen PostgreSQL (def. postgres:16-alpine)
  --conservar           No borrar contenedor/volumen/red al terminar bien
  --confirmo-copia      Obligatorio: declara que el backup es una copia
  --help                Esta ayuda

Variables:
  ENSAYO_OUT            Directorio de salida (def. /tmp/volkern-ensayo-<ts>)

Fases medidas: preparar entorno, restaurar base, estado base, recibos en_curso,
migrar, verificar migración, restaurar rollback y verificar rollback. Un fallo
en cualquiera aborta con código 1 y conserva el entorno para inspección.
EOF
}

morir() { echo "✗ $*" >&2; exit 2; }

asignar() { # opción | valor
  case "$1" in
    --backup)   BACKUP="$2" ;;
    --migrator) MIGRATOR_IMAGE="$2" ;;
    --pg-image) PG_IMAGE="$2" ;;
    *)          morir "Argumento desconocido: $1" ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --backup|--migrator|--pg-image)
      [ $# -ge 2 ] || morir "$1 necesita un valor."
      asignar "$1" "$2"
      shift 2
      continue
      ;;
    --backup=*|--migrator=*|--pg-image=*) asignar "${1%%=*}" "${1#*=}" ;;
    --conservar)                          CONSERVAR=1 ;;
    --confirmo-copia)                     CONFIRMO=1 ;;
    --help|-h)                            uso; exit 0 ;;
    *)                                    morir "Argumento desconocido: $1" ;;
  esac
  shift
done

# ── Guardas de copia ───────────────────────────────────────────
[ "$CONFIRMO" -eq 1 ] || {
  echo "✗ Falta --confirmo-copia." >&2
  echo "  Este ensayo restaura un backup en recursos desechables; no debe" >&2
  echo "  ejecutarse por accidente. Confirma que trabajas sobre una copia." >&2
  exit 2
}
[ -z "${DATABASE_URL:-}" ] || {
  echo "✗ DATABASE_URL está definida: el ensayo construye sus propias bases y" >&2
  echo "  no acepta URLs externas. Deslígala antes de ejecutarlo." >&2
  exit 2
}
[ -n "$BACKUP" ] || morir "Falta --backup."
[ -f "$BACKUP" ] && [ -r "$BACKUP" ] || morir "El backup no existe o no se puede leer: $BACKUP"

for cmd in docker gzip sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || morir "Falta '$cmd' en PATH."
done
docker info >/dev/null 2>&1 || morir "Docker no responde."
gzip -t "$BACKUP" 2>/dev/null || morir "El backup no es un gzip válido: $BACKUP"
docker image inspect "$MIGRATOR_IMAGE" >/dev/null 2>&1 ||
  morir "No está la imagen migrator '$MIGRATOR_IMAGE'."
docker image inspect "$PG_IMAGE" >/dev/null 2>&1 ||
  morir "No está la imagen PostgreSQL '$PG_IMAGE'."
[ -f "$AQUI/verificar-recibos-whatsapp.sh" ] ||
  morir "Falta $AQUI/verificar-recibos-whatsapp.sh."

SUFIJO="$(date -u +%Y%m%d-%H%M%S)-$$"
NET="volkern-ensayo-net-$SUFIJO"
PG="volkern-ensayo-pg-$SUFIJO"
VOL="volkern-ensayo-data-$SUFIJO"
OUT="${ENSAYO_OUT:-/tmp/volkern-ensayo-$SUFIJO}"
TIEMPOS="$OUT/tiempos.tsv"

# Nombres libres: el ensayo nunca reutiliza ni renombra algo que ya exista.
for recurso in "container:$PG" "network:$NET" "volume:$VOL"; do
  if docker "${recurso%%:*}" inspect "${recurso#*:}" >/dev/null 2>&1; then
    morir "Ya existe ${recurso%%:*} '${recurso#*:}': el ensayo no reutiliza recursos."
  fi
done

SHA256="$(sha256sum "$BACKUP" | cut -d' ' -f1)"
TAMANO="$(stat -c %s "$BACKUP")"

umask 077
mkdir -p "$OUT"
printf 'fase\ttiempo_ms\tresultado\n' > "$TIEMPOS"
{
  echo "fecha=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "backup=$BACKUP"
  echo "sha256=$SHA256"
  echo "bytes=$TAMANO"
  echo "pg_image=$PG_IMAGE"
  echo "migrator=$MIGRATOR_IMAGE"
  echo "contenedor=$PG"
  echo "red=$NET"
  echo "volumen=$VOL"
} > "$OUT/metadatos.txt"

limpiar() {
  local rc=$?
  trap - EXIT
  if [ "$rc" -eq 0 ] && [ "$CONSERVAR" -eq 0 ]; then
    docker rm -f "$PG" >/dev/null 2>&1 || true
    docker volume rm "$VOL" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    echo "→ Entorno de ensayo eliminado."
  else
    echo "→ Entorno conservado para inspección:"
    echo "    contenedor=$PG red=$NET volumen=$VOL"
    echo "    salida=$OUT"
  fi
  exit "$rc"
}
trap limpiar EXIT

ms() { date +%s%3N; }

FALLOS_FASE=0

# Ejecuta una fase, la mide y devuelve 1 si falló. Las funciones de fase se
# invocan desde aquí (contexto condicional, donde `set -e` no actúa), así que
# cada comprobación decide por sí misma: lo que no se comprueba, no aborta.
fase() {
  local nombre="$1"; shift
  local t0 t1 rc
  t0="$(ms)"
  echo ""
  echo "▶ $nombre"
  FALLOS_FASE=0
  rc=0
  "$@" || rc=$?
  t1="$(ms)"
  if [ "$rc" -eq 0 ]; then
    printf '%s\t%s\tOK\n' "$nombre" "$((t1 - t0))" >> "$TIEMPOS"
    echo "  ✓ $nombre ($((t1 - t0)) ms)"
  else
    printf '%s\t%s\tFALLO\n' "$nombre" "$((t1 - t0))" >> "$TIEMPOS"
    echo "  ✗ $nombre falló ($((t1 - t0)) ms)" >&2
  fi
  return "$rc"
}

q() { # base | sql
  docker exec "$PG" psql -U postgres -d "$1" -t -A -v ON_ERROR_STOP=1 -c "$2"
}

afirmar() { # descripción | esperado | real
  if [ "$3" = "$2" ]; then
    echo "  ✓ $1"
  else
    echo "  ✗ $1 → esperado [$2], obtenido [$3]" >&2
    FALLOS_FASE=$((FALLOS_FASE + 1))
  fi
}

# Consultas compartidas por la verificación de migración y la de rollback.
indice() { # base | nombre
  q "$1" "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='$2';"
}
columnas_entrega() { # base
  q "$1" "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='mcp_approval_requests' AND column_name IN ('whatsappMessageId','entregaEstado','entregaActualizadaEn');"
}
op_duplicados() { # base
  q "$1" "SELECT count(*) FROM (SELECT 1 FROM \"mcp_approval_requests\" WHERE \"operationId\" IS NOT NULL GROUP BY \"tenantId\",\"requestedById\",\"operationId\" HAVING count(*) > 1) d;"
}
pendientes_duplicadas() { # base
  q "$1" "SELECT count(*) FROM (SELECT 1 FROM \"mcp_approval_requests\" WHERE status='pending' AND \"operationId\" IS NULL GROUP BY \"tenantId\",\"requestedById\",\"toolName\",\"argumentsHash\" HAVING count(*) > 1) d;"
}

MIGRACIONES_NUEVAS="'20261127160000_mcp_aprobacion_operation_id_unico','20261127200000_mcp_aprobacion_entrega','20261127210000_mcp_aprobacion_reserva_por_usuario','20261127220000_mcp_aprobacion_ambito_operation_id'"

preparar_entorno() {
  echo "  creando red, volumen y PostgreSQL desechable..."
  docker network create "$NET" >/dev/null || return 1
  docker volume create "$VOL" >/dev/null || return 1
  docker run -d --name "$PG" --network "$NET" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_DB=ensayo \
    -v "$VOL:/var/lib/postgresql/data" \
    "$PG_IMAGE" >/dev/null || return 1

  local listo=0
  for _ in $(seq 1 60); do
    if docker exec "$PG" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      listo=1
      break
    fi
    sleep 1
  done
  if [ "$listo" -ne 1 ]; then
    echo "  ✗ PostgreSQL no respondió en 60 s." >&2
    docker logs --tail 20 "$PG" >&2 2>&1 || true
    return 1
  fi

  # El dump incluye ALTER ... OWNER TO volkern_erp; el rol debe existir.
  docker exec -i "$PG" psql -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || return 1
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'volkern_erp') THEN
    CREATE ROLE volkern_erp LOGIN;
  END IF;
END
$$;
SQL
  local db
  for db in ensayo_base ensayo_rollback; do
    docker exec "$PG" createdb -U postgres "$db" >/dev/null || return 1
  done
}

restaurar() { # base
  local log="$OUT/restaurar-$1.log"
  echo "  restaurando $1..."
  if ! gunzip -c "$BACKUP" | docker exec -i "$PG" \
      psql -U postgres -d "$1" -v ON_ERROR_STOP=1 >"$log" 2>&1; then
    echo "  ✗ Falló la restauración de $1. Últimas líneas:" >&2
    tail -20 "$log" >&2 || true
    return 1
  fi
}

aplicar_migraciones() {
  local log="$OUT/migrar.log"
  echo "  aplicando migraciones sobre ensayo_base..."
  if ! docker run --rm --network "$NET" \
      -e DATABASE_URL="postgresql://postgres@$PG:5432/ensayo_base" \
      "$MIGRATOR_IMAGE" migrate deploy >"$log" 2>&1; then
    echo "  ✗ Falló migrate deploy. Últimas líneas:" >&2
    tail -30 "$log" >&2 || true
    return 1
  fi
}

# Foto del estado previo: es contra esto contra lo que se comprueba el rollback.
# Una consulta fallida devuelve vacío; entonces no hay ensayo.
tomar_estado_base() {
  local db=ensayo_base
  BASE_APROBACIONES="$(q "$db" 'SELECT count(*) FROM "mcp_approval_requests";')"
  BASE_MIGRACIONES="$(q "$db" 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;')"
  BASE_OP_NULOS="$(q "$db" 'SELECT count(*) FROM "mcp_approval_requests" WHERE "operationId" IS NULL;')"
  BASE_RECIBOS_EXISTE="$(q "$db" "SELECT to_regclass('public.whatsapp_send_receipts') IS NOT NULL;")"
  BASE_OP_DUPES="$(op_duplicados "$db")"
  BASE_INDICE_ANTIGUO="$(indice "$db" mcp_approval_requests_pendiente_unica)"
  BASE_RECIBOS=0
  BASE_EN_CURSO=0
  if [ "$BASE_RECIBOS_EXISTE" = t ]; then
    BASE_RECIBOS="$(q "$db" 'SELECT count(*) FROM whatsapp_send_receipts;')"
    BASE_EN_CURSO="$(q "$db" "SELECT count(*) FROM whatsapp_send_receipts WHERE status='en_curso';")"
    [ -n "$BASE_RECIBOS" ] && [ -n "$BASE_EN_CURSO" ] || return 1
  fi
  for valor in "$BASE_APROBACIONES" "$BASE_MIGRACIONES" "$BASE_OP_NULOS" \
               "$BASE_OP_DUPES" "$BASE_INDICE_ANTIGUO" "$BASE_RECIBOS_EXISTE"; do
    [ -n "$valor" ] || return 1
  done
  echo "  $BASE_APROBACIONES solicitudes, $BASE_RECIBOS recibos ($BASE_EN_CURSO en_curso), $BASE_MIGRACIONES migraciones."
}

exportar_recibos() {
  if [ "$BASE_RECIBOS_EXISTE" != t ]; then
    echo "  sin tabla de recibos en el backup: nada que exportar."
    return 0
  fi
  PG_CID="$PG" PG_USER=postgres PG_DB=ensayo_base BACKUP_DIR="$OUT/recibos" \
    bash "$AQUI/verificar-recibos-whatsapp.sh"
}

comprobar_migracion() {
  local db=ensayo_base
  afirmar "la tabla de recibos desaparece" t \
    "$(q "$db" "SELECT to_regclass('public.whatsapp_send_receipts') IS NULL;")"
  afirmar "las cuatro migraciones nuevas están aplicadas" 4 \
    "$(q "$db" "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND migration_name IN ($MIGRACIONES_NUEVAS);")"
  afirmar "existe el índice único por usuario y operationId" 1 \
    "$(indice "$db" mcp_approval_requests_tenantId_requestedById_operationId_key)"
  afirmar "existe el índice de entrega" 1 \
    "$(indice "$db" mcp_approval_requests_whatsappMessageId_idx)"
  afirmar "existe el índice parcial por contenido" 1 \
    "$(indice "$db" mcp_approval_requests_pendiente_contenido_key)"
  afirmar "el índice parcial antiguo desaparece" 0 \
    "$(indice "$db" mcp_approval_requests_pendiente_unica)"
  afirmar "existen las tres columnas de entrega" 3 "$(columnas_entrega "$db")"
  afirmar "no quedan operationId duplicados por usuario" 0 "$(op_duplicados "$db")"
  afirmar "no quedan pendientes idénticas por usuario" 0 "$(pendientes_duplicadas "$db")"
  afirmar "no se pierden solicitudes de aprobación" "$BASE_APROBACIONES" \
    "$(q "$db" 'SELECT count(*) FROM "mcp_approval_requests";')"
  [ "$FALLOS_FASE" -eq 0 ]
}

comprobar_rollback() {
  local db=ensayo_rollback
  afirmar "vuelven las migraciones del backup" "$BASE_MIGRACIONES" \
    "$(q "$db" 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;')"
  afirmar "vuelven las solicitudes de aprobación" "$BASE_APROBACIONES" \
    "$(q "$db" 'SELECT count(*) FROM "mcp_approval_requests";')"
  afirmar "vuelven los operationId nulos" "$BASE_OP_NULOS" \
    "$(q "$db" 'SELECT count(*) FROM "mcp_approval_requests" WHERE "operationId" IS NULL;')"
  afirmar "vuelven los duplicados de operationId" "$BASE_OP_DUPES" "$(op_duplicados "$db")"
  afirmar "vuelve el índice parcial antiguo" "$BASE_INDICE_ANTIGUO" \
    "$(indice "$db" mcp_approval_requests_pendiente_unica)"
  afirmar "no queda el índice único nuevo" 0 \
    "$(indice "$db" mcp_approval_requests_tenantId_requestedById_operationId_key)"
  afirmar "no queda el índice de entrega" 0 \
    "$(indice "$db" mcp_approval_requests_whatsappMessageId_idx)"
  afirmar "no quedan las columnas de entrega" 0 "$(columnas_entrega "$db")"
  afirmar "la tabla de recibos vuelve como en el backup" "$BASE_RECIBOS_EXISTE" \
    "$(q "$db" "SELECT to_regclass('public.whatsapp_send_receipts') IS NOT NULL;")"
  if [ "$BASE_RECIBOS_EXISTE" = t ]; then
    afirmar "vuelven las filas de recibos" "$BASE_RECIBOS" \
      "$(q "$db" 'SELECT count(*) FROM whatsapp_send_receipts;')"
    afirmar "vuelven los recibos en_curso" "$BASE_EN_CURSO" \
      "$(q "$db" "SELECT count(*) FROM whatsapp_send_receipts WHERE status='en_curso';")"
  fi
  [ "$FALLOS_FASE" -eq 0 ]
}

echo "=== Ensayo de rollback sobre copia ==="
echo "Backup: $BACKUP"
echo "SHA256: $SHA256 ($TAMANO bytes)"
echo "Salida: $OUT"
echo "Nada de esto usa el contenedor ni la base de producción."

fase "Preparar entorno desechable" preparar_entorno || exit 1
fase "Restaurar copia base" restaurar ensayo_base || exit 1
fase "Capturar estado base" tomar_estado_base || exit 1
fase "Comprobar recibos en_curso" exportar_recibos || exit 1
fase "Aplicar migraciones" aplicar_migraciones || exit 1
fase "Verificar migración" comprobar_migracion || exit 1
fase "Restaurar rollback" restaurar ensayo_rollback || exit 1
fase "Verificar rollback" comprobar_rollback || exit 1

echo ""
echo "=== Tiempos por fase ==="
printf '%-42s %10s  %s\n' "Fase" "ms" "Resultado"
TOTAL=0
while IFS=$'\t' read -r nombre dur resultado; do
  [ "$nombre" = fase ] && continue
  printf '%-42s %10s  %s\n' "$nombre" "$dur" "$resultado"
  TOTAL=$((TOTAL + dur))
done < "$TIEMPOS"
printf '%-42s %10s\n' "TOTAL" "$TOTAL"

echo ""
echo "✓ Ensayo completado. Resultados en $OUT"
echo "Pendiente y manual: smoke de las imágenes nueva y anterior (aquí no se arranca la app)."
