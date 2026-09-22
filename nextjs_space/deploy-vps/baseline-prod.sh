#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Baseline de migraciones de PRODUCCIÓN — volkern-erp
#
# Producción venía de la historia vieja de migraciones (era db push) y el
# repo ya trae el baseline nuevo (`0_init` + migraciones de Hospitality).
# Este script, ejecutado UNA VEZ en el VPS:
#   1. respalda la tabla de metadatos de Prisma y hace un backup completo
#   2. marca `0_init` como aplicada (NO ejecuta su SQL: el esquema ya existe)
#   3. aplica las migraciones pendientes con `prisma migrate deploy`
#
# Uso (EN EL VPS):
#   bash /root/deploy-vps/baseline-prod.sh [tarball_migrator] [--reset-metadata]
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

MIGRATOR_TARBALL="${1:-/tmp/volkern-erp-migrator.tar}"
RESET_METADATA="${2:-}"
JOB="volkern-erp-baseline-job"
OUTDIR=/root/deploy-vps/preflight
mkdir -p "$OUTDIR" /root/backups

echo "=== Baseline de producción ($(date)) ==="

# 1. Imagen migrator nueva
if [ -f "$MIGRATOR_TARBALL" ]; then
  echo "→ Cargando imagen migrator ..."
  docker load -i "$MIGRATOR_TARBALL"
fi
docker image inspect volkern-erp:migrator >/dev/null

PG_CID=$(docker ps --filter name=volkern-erp_postgres --format '{{.ID}}' | head -1 || true)
[ -z "$PG_CID" ] && { echo "✗ No se encontró el contenedor de Postgres." >&2; exit 1; }

# 2. Respaldos ANTES de tocar nada
STAMP=$(date +%Y%m%d-%H%M%S)
docker exec "$PG_CID" pg_dump -U volkern_erp -d volkern_erp --data-only --table=_prisma_migrations \
  > "$OUTDIR/_prisma_migrations-$STAMP.sql"
gzip -f "$OUTDIR/_prisma_migrations-$STAMP.sql"
echo "→ Metadatos de Prisma respaldados: $(du -h "$OUTDIR/_prisma_migrations-$STAMP.sql.gz" | cut -f1)"

docker exec "$PG_CID" pg_dump -U volkern_erp -d volkern_erp \
  | gzip > "/root/backups/volkern_erp-pre-baseline-$STAMP.sql.gz"
echo "→ Backup completo: $(du -h "/root/backups/volkern_erp-pre-baseline-$STAMP.sql.gz" | cut -f1)"

# 3. DATABASE_URL del servicio (no se imprime)
DATABASE_URL=$(docker service inspect volkern-erp_app \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' \
  | grep '^DATABASE_URL=' | cut -d= -f2- || true)
[ -z "$DATABASE_URL" ] && { echo "✗ No se pudo obtener DATABASE_URL." >&2; exit 1; }

# 4. Script que corre DENTRO del job (vive en el bind mount → legible por el job)
if [ "$RESET_METADATA" = "--reset-metadata" ]; then
  RESET_LINE='echo '"'"'DROP TABLE IF EXISTS "_prisma_migrations";'"'"' | "$PRISMA" db execute --stdin --url "$DATABASE_URL"'
else
  RESET_LINE=': # metadatos intactos (solo se añade la fila de 0_init)'
fi
cat > "$OUTDIR/baseline-step.sh" <<EOF
set -x
PRISMA=/app/node_modules/.bin/prisma
$RESET_LINE
"\$PRISMA" migrate resolve --applied 0_init > /out/baseline-resolve.txt 2>&1
echo "RESOLVE_EXIT=\$?" >> /out/baseline-resolve.txt
"\$PRISMA" migrate deploy > /out/baseline-deploy.txt 2>&1
echo "DEPLOY_EXIT=\$?" >> /out/baseline-deploy.txt
"\$PRISMA" migrate status > /out/baseline-status.txt 2>&1
echo "STATUS_EXIT=\$?" >> /out/baseline-status.txt
EOF
chmod +x "$OUTDIR/baseline-step.sh"

# 5. Job Swarm one-shot en la red DXnet (misma receta que run-migrations.sh)
echo "→ Ejecutando baseline + migrate deploy ..."
docker service rm "$JOB" >/dev/null 2>&1 || true
docker service create --quiet \
  --name "$JOB" \
  --mode replicated-job \
  --restart-condition none \
  --network DXnet \
  --env "DATABASE_URL=$DATABASE_URL" \
  --mount "type=bind,src=$OUTDIR,dst=/out" \
  --entrypoint /bin/sh \
  volkern-erp:migrator /out/baseline-step.sh

for i in $(seq 1 100); do
  COMPLETE=$(docker service ps "$JOB" --format '{{.CurrentState}}' 2>/dev/null | grep -c Complete || true)
  [ "$COMPLETE" -gt 0 ] && break
  sleep 3
done
JOB_STATE=$(docker service ps "$JOB" --format '{{.CurrentState}} {{.Error}}' 2>/dev/null | head -1 || true)
echo "→ Estado del job: $JOB_STATE"
docker service logs "$JOB" 2>&1 | tail -10 || true
docker service rm "$JOB" >/dev/null 2>&1 || true

# 6. Resultado
echo ""
echo "=== RESOLVE (marcar 0_init) ==="
tail -6 "$OUTDIR/baseline-resolve.txt" 2>/dev/null || echo "(sin salida)"
echo "=== DEPLOY (migraciones aplicadas) ==="
tail -30 "$OUTDIR/baseline-deploy.txt" 2>/dev/null || echo "(sin salida)"
echo "=== STATUS ==="
tail -12 "$OUTDIR/baseline-status.txt" 2>/dev/null || echo "(sin salida)"
echo "=== fin baseline ==="
