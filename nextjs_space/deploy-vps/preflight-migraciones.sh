#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Preflight de migraciones de PRODUCCIÓN — SOLO LECTURA.
#
# No aplica nada: consulta el estado de `_prisma_migrations` y calcula
# el diff entre el esquema FÍSICO de producción y el `schema.prisma` de
# la imagen nueva. Sirve para decidir el baseline ANTES de tocar nada.
#
# Se ejecuta EN EL VPS:
#   bash /root/deploy-vps/preflight-migraciones.sh [tarball_migrator]
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

MIGRATOR_TARBALL="${1:-/tmp/volkern-erp-migrator.tar}"
JOB_NAME="volkern-erp-preflight-job"
OUTDIR=/root/deploy-vps/preflight

echo "=== Preflight migraciones ($(date)) ==="

# 1. Imagen migrator (la nueva, con el esquema y las migraciones nuevas)
if [ -f "$MIGRATOR_TARBALL" ]; then
  echo "→ Cargando imagen migrator desde $MIGRATOR_TARBALL ..."
  docker load -i "$MIGRATOR_TARBALL"
fi
docker image inspect volkern-erp:migrator >/dev/null

# 2. DATABASE_URL del servicio en producción (nunca se imprime)
DATABASE_URL=$(docker service inspect volkern-erp_app \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep '^DATABASE_URL=' | cut -d= -f2- || true)
if [ -z "$DATABASE_URL" ]; then
  echo "✗ No se pudo obtener DATABASE_URL del servicio." >&2
  exit 1
fi
echo "→ DATABASE_URL obtenida (valor no impreso)"

mkdir -p "$OUTDIR"

# 3. Metadatos ACTUALES de Prisma en producción (solo lectura, vía psql del
#    contenedor de Postgres que ya corre en el host).
PG_CID=$(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1 || true)
if [ -n "$PG_CID" ]; then
  echo "→ Metadatos de Prisma en producción:"
  docker exec "$PG_CID" psql -U volkern_erp -d volkern_erp -t -A \
    -c "SELECT count(*) FROM _prisma_migrations;" > "$OUTDIR/applied-total.txt" 2>&1 || true
  cat "$OUTDIR/applied-total.txt" | sed 's/^/   filas en _prisma_migrations: /'
  docker exec "$PG_CID" psql -U volkern_erp -d volkern_erp -t -A \
    -c "SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY started_at;" \
    > "$OUTDIR/applied-prod.txt" 2>&1 || true
  echo "   primeras: $(head -3 "$OUTDIR/applied-prod.txt" | tr '\n' ' ')"
  echo "   últimas:  $(tail -3 "$OUTDIR/applied-prod.txt" | tr '\n' ' ')"
  # Tablas clave del módulo Hospitality (¿existen ya en producción?)
  # La lista se DERIVA del schema.prisma del job (los @@map de modelos
  # Hospitality*/Connectivity*) en vez de llevarse escrita a mano: la lista
  # manual envejeció mal (tres nombres en singular —hospitality_property,
  # hospitality_reservation, connectivity_provider— y hospitality_guest_registry
  # que no existe en ninguna base) y la consulta devolvía menos filas EN
  # SILENCIO. Ahora, si una tabla del esquema no existe aún en producción, se
  # avisa: es la señal de que falta aplicar una migración. En un futuro esquema
  # multi-fichero, extender el grep a los ficheros que toquen.
  # `if !`: con `set -e`, si el grep del contenedor no encontrara nada la
  # asignación moriría en silencio; así se aborta EN VOZ ALTA.
  if ! LISTA_TABLAS=$(docker run --rm --entrypoint sh volkern-erp:migrator -c \
      "grep -ohE '@@map\\(\"(hospitality|connectivity)[a-z_0-9]+\"\\)' /app/prisma/schema.prisma" \
      | sed -E 's/.*"([^"]+)".*/\1/' | sort -u); then
    echo "✗ No se pudo derivar la lista de tablas clave desde prisma/schema.prisma (sin coincidencias o fallo del contenedor)." >&2
    exit 1
  fi
  if [ -z "$LISTA_TABLAS" ]; then
    echo "✗ La lista de tablas clave derivada del esquema salió vacía." >&2
    exit 1
  fi
  N_ESPERADAS=$(echo "$LISTA_TABLAS" | grep -c . || true)
  IN_LIST=$(echo "$LISTA_TABLAS" | sed "s/.*/'&'/" | paste -sd, -)
  echo "→ Tablas clave en producción ($N_ESPERADAS esperadas del esquema):"
  docker exec "$PG_CID" psql -U volkern_erp -d volkern_erp -t -A -c "
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname IN ($IN_LIST)
    ORDER BY 1;" > "$OUTDIR/tablas-clave.txt" 2>/dev/null || true
  N_ENCONTRADAS=$(grep -c . "$OUTDIR/tablas-clave.txt" || true)
  sed 's/^/   /' "$OUTDIR/tablas-clave.txt"
  echo "   → encontradas $N_ENCONTRADAS/$N_ESPERADAS"
  if [ "$N_ENCONTRADAS" -ne "$N_ESPERADAS" ]; then
    echo "   ⚠️  FALTAN en producción: $(comm -23 <(echo "$LISTA_TABLAS") <(sort "$OUTDIR/tablas-clave.txt") | tr '\n' ' ')"
  fi
  echo "   total tablas public: $(docker exec "$PG_CID" psql -U volkern_erp -d volkern_erp -t -A -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';" 2>/dev/null | tr -d '[:space:]')"
else
  echo "⚠️  No se encontró el contenedor de Postgres; se omite la consulta de metadatos."
fi

# 4. Diff esquema físico de producción → schema.prisma de la imagen nueva.
#    Es la comprobación definitiva: dice EXACTAMENTE lo que le falta (o le
#    sobra) a producción para llegar al esquema del despliegue.
echo "→ Calculando diff de producción contra el esquema nuevo (job Swarm) ..."
docker service rm "$JOB_NAME" >/dev/null 2>&1 || true
# `timeout`: el CLI de Docker ya se ha quedado colgado en este punto con el
# servicio creado (imprime el ID, avisa de la falta de digest y no retorna).
# Acotarlo no oculta el resultado —el job existe igualmente y el bucle de abajo
# mira su estado real—, solo pone techo al silencio del CLI. Misma receta que
# run-migrations.sh.
if ! timeout 120 docker service create --quiet \
  --name "$JOB_NAME" \
  --mode replicated-job \
  --restart-condition none \
  --network DXnet \
  --env "DATABASE_URL=$DATABASE_URL" \
  --mount "type=bind,src=$OUTDIR,dst=/out" \
  --entrypoint /bin/sh \
  volkern-erp:migrator -c '
    /app/node_modules/.bin/prisma migrate status > /out/status.txt 2>&1
    echo "STATUS_EXIT=$?" >> /out/status.txt
    /app/node_modules/.bin/prisma migrate diff \
      --from-url "$DATABASE_URL" \
      --to-schema-datamodel /app/prisma/schema.prisma \
      --script > /out/prod-diff.sql 2> /out/prod-diff.err
    echo "DIFF_EXIT=$?" >> /out/prod-diff.err
  '; then
  echo "   ⚠️  docker service create no retornó en 120s (o falló). Se comprueba igualmente el job."
fi

# Si el servicio no llegó a existir, no hay nada que esperar: decirlo es más útil
# que agotar la espera en un job que nunca se creó.
if ! docker service inspect "$JOB_NAME" >/dev/null 2>&1; then
  echo "✗ El job de preflight no llegó a crearse ($JOB_NAME)." >&2
  exit 1
fi

for i in $(seq 1 60); do
  COMPLETE=$(docker service ps "$JOB_NAME" --format '{{.CurrentState}}' 2>/dev/null | grep -c Complete || true)
  [ "$COMPLETE" -gt 0 ] && break
  sleep 3
done
echo "→ Estado del job: $(docker service ps "$JOB_NAME" --format '{{.CurrentState}}' 2>/dev/null | head -1 || true)"
docker service logs "$JOB_NAME" 2>&1 | tail -5 || true
docker service rm "$JOB_NAME" >/dev/null 2>&1 || true

echo ""
echo "=== Resultado del preflight ==="
ls -la "$OUTDIR"
echo "--- status.txt (migrate status) ---"
cat "$OUTDIR/status.txt" 2>/dev/null || echo "(sin status)"
echo "--- prod-diff.sql (resumen) ---"
if [ -s "$OUTDIR/prod-diff.sql" ]; then
  echo "líneas: $(wc -l < "$OUTDIR/prod-diff.sql") · sentencias: $(grep -c ';' "$OUTDIR/prod-diff.sql")"
  echo "destructivas (DROP/ALTER DROP): $(grep -ciE '^\s*(DROP|ALTER TABLE .* DROP)' "$OUTDIR/prod-diff.sql")"
  grep -iE '^\s*(DROP|ALTER TABLE .* DROP)' "$OUTDIR/prod-diff.sql" | head -20 || true
else
  echo "(diff vacío)"
fi
cat "$OUTDIR/prod-diff.err" 2>/dev/null | tail -5 || true
echo "=== fin preflight ==="
