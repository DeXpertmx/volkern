#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Comprobación previa al DROP de `whatsapp_send_receipts`.
#
# La migración 20261127160000 borra la tabla de recibos de idempotencia.
# Un recibo `en_curso` significa que el proceso creó la clave antes de llamar
# al proveedor y no consta que el envío terminara: borrarlo pierde la única
# traza de un mensaje que pudo salir. Antes de migrar:
#
#   1. consulta el estado de la tabla (solo lectura),
#   2. exporta las filas `en_curso` a un CSV 600 en /root/backups,
#   3. sale con 1 si queda alguna: NO se migra.
#
# Criterio:
#   · tabla ausente (migración ya aplicada)          → 0, nada que comprobar
#   · 0 filas `en_curso`                            → 0, se puede migrar
#   · ≥1 fila `en_curso`                            → 1, NO-GO hasta resolverla
#   · error de consulta/entorno                      → 2, fail closed
#
# `enviado` es un recibo cerrado: no bloquea. Resolver un `en_curso` es una
# decisión de negocio (confirmar entrega o marcar fallo), no la toma este
# script. Primero se exporta; después se reconcilia con aprobación.
#
# Uso, en el VPS:
#   bash /root/deploy-vps/verificar-recibos-whatsapp.sh
#   PG_CID=<id> PG_USER=volkern_erp PG_DB=volkern_erp \
#     BACKUP_DIR=/root/backups bash .../verificar-recibos-whatsapp.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

PG_USER="${PG_USER:-volkern_erp}"
PG_DB="${PG_DB:-volkern_erp}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"

if [ -z "${PG_CID:-}" ]; then
  PG_CID=$(docker ps --filter name=volkern-erp_postgres \
    --format '{{.ID}}' | head -1 || true)
fi
if [ -z "$PG_CID" ]; then
  echo "✗ No se encontró el contenedor de Postgres: no se puede comprobar la tabla." >&2
  exit 2
fi

psql_q() {
  docker exec "$PG_CID" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -t -A -c "$1"
}

# Sin tabla no hay nada que perder: la migración ya se aplicó o la base es nueva.
EXISTE=$(psql_q "SELECT to_regclass('public.whatsapp_send_receipts') IS NOT NULL;" 2>/dev/null) || {
  echo "✗ No se pudo consultar si existe whatsapp_send_receipts: no se migra." >&2
  exit 2
}
if [ "$EXISTE" != "t" ]; then
  echo "✓ whatsapp_send_receipts no existe: no hay recibos que comprobar."
  exit 0
fi

EN_CURSO=$(psql_q \
  "SELECT count(*) FROM whatsapp_send_receipts WHERE status = 'en_curso';" \
  2>/dev/null) || {
  echo "✗ No se pudo contar los recibos en_curso: no se migra." >&2
  exit 2
}

if [ "$EN_CURSO" = "0" ]; then
  echo "✓ 0 recibos en_curso: se puede eliminar la tabla."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
umask 077
ARCHIVO="$BACKUP_DIR/whatsapp_send_receipts-en_curso-$(date -u +%Y%m%d-%H%M%S).csv"
if ! docker exec "$PG_CID" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
  -c "COPY (
        SELECT \"key\", \"tenantId\", \"toolName\", \"approvalId\",
               status, result, \"createdAt\", \"updatedAt\"
        FROM whatsapp_send_receipts
        WHERE status = 'en_curso'
        ORDER BY \"createdAt\"
      ) TO STDOUT WITH CSV HEADER" > "$ARCHIVO"; then
  echo "✗ No se pudieron exportar los recibos en_curso: no se migra." >&2
  rm -f "$ARCHIVO"
  exit 2
fi
if [ ! -s "$ARCHIVO" ]; then
  echo "✗ La exportación quedó vacía pese a haber recibos en_curso: no se migra." >&2
  rm -f "$ARCHIVO"
  exit 2
fi
chmod 600 "$ARCHIVO"

echo "✗ Hay $EN_CURSO recibo(s) en_curso; exportados en $ARCHIVO" >&2
echo "  NO se migra mientras queden pendientes: confirma la entrega o el fallo" >&2
echo "  de cada envío y vuelve a ejecutar esta comprobación." >&2
exit 1
