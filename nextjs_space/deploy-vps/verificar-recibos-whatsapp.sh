#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Comprobación previa al DROP de `whatsapp_send_receipts`.
#
# La migración 20261127160000 borra la tabla de recibos de idempotencia.
# Antes de migrar:
#
#   1. consulta el estado de la tabla (solo lectura),
#   2. exporta a CSV 600 en /root/backups los envíos que pudieron salir,
#   3. sale con 1 si algún recibo es la ÚNICA traza de un envío: NO se migra.
#
# Criterio:
#   · tabla ausente (migración ya aplicada)                  → 0, nada que comprobar
#   · 0 `en_curso` y ningún `incierto` sin traza             → 0, se puede migrar
#   · ≥1 fila `en_curso`                                     → 1, NO-GO
#   · ≥1 `incierto` que no consta en su solicitud            → 1, NO-GO
#   · error de consulta/entorno                              → 2, fail closed
#
# `en_curso` bloquea SIEMPRE: el proceso creó la clave antes de llamar al
# proveedor y no escribió ningún desenlace (murió, OOM, reinicio). No hay traza
# en ningún otro sitio de que el mensaje pudiera salir.
#
# `incierto` (timeout, red, 5xx) significa lo mismo —pudo salir— pero, cuando el
# proceso terminó, el desenlace quedó TAMBIÉN en la solicitud de aprobación
# (`result.desenlace = 'incierto'`), que es el recibo nuevo y no se borra.
# Bloquearlo por sí solo bloquearía el despliegue para siempre: la clave solo se
# libera con un rechazo confirmado del proveedor y ningún barrido resuelve un
# `incierto` (el de la app vieja nunca se re-toma). Aun así se exporta siempre,
# para tener la lista de envíos sin confirmar cuando la tabla ya no exista.
#
# La excepción es el `incierto` cuya solicitud no guardó ese desenlace: proceso
# muerto entre marcar el recibo y cerrar la solicitud (el barrido la deja en
# `failed` sin desenlace), o solicitud ya inexistente. Ahí el recibo es la única
# prueba de que el mensaje pudo salir y sí bloquea.
#
# Resolver un `en_curso` es una decisión de negocio (confirmar entrega o marcar
# fallo), no la toma este script. Primero se exporta; después se reconcilia con
# aprobación.
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

contar() { # sql → número; falla si la respuesta no es un número
  local n
  n=$(psql_q "$1" 2>/dev/null) || return 1
  case "$n" in
    ''|*[!0-9]*) return 1 ;;
  esac
  echo "$n"
}

# Exporta los recibos que cumplen `origen` (FROM ... WHERE ...) y deja la ruta
# en ARCHIVO_RECIBOS. Aborta con 2 si no se puede exportar: sin el archivo no
# hay constancia de lo que se iba a borrar.
exportar() { # etiqueta | origen_sql
  local etiqueta="$1" origen="$2"
  if ! mkdir -p "$BACKUP_DIR"; then
    echo "✗ No se pudo crear $BACKUP_DIR: no se migra." >&2
    exit 2
  fi
  umask 077
  ARCHIVO_RECIBOS="$BACKUP_DIR/whatsapp_send_receipts-$etiqueta-$(date -u +%Y%m%d-%H%M%S).csv"
  if ! docker exec "$PG_CID" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
    -c "COPY (
          SELECT r.\"key\", r.\"tenantId\", r.\"toolName\", r.\"approvalId\",
                 r.status, r.result, r.\"createdAt\", r.\"updatedAt\"
          FROM $origen
          ORDER BY r.\"createdAt\"
        ) TO STDOUT WITH CSV HEADER" > "$ARCHIVO_RECIBOS"; then
    echo "✗ No se pudieron exportar los recibos $etiqueta: no se migra." >&2
    rm -f "$ARCHIVO_RECIBOS"
    exit 2
  fi
  if [ ! -s "$ARCHIVO_RECIBOS" ]; then
    echo "✗ La exportación de $etiqueta quedó vacía pese a haber recibos: no se migra." >&2
    rm -f "$ARCHIVO_RECIBOS"
    exit 2
  fi
  chmod 600 "$ARCHIVO_RECIBOS"
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

# ── 1. Envíos en curso: única traza, bloquean ──────────────────
EN_CURSO=$(contar \
  "SELECT count(*) FROM whatsapp_send_receipts WHERE status = 'en_curso';") || {
  echo "✗ No se pudo contar los recibos en_curso: no se migra." >&2
  exit 2
}
if [ "$EN_CURSO" != "0" ]; then
  exportar en_curso "whatsapp_send_receipts r WHERE r.status = 'en_curso'"
  echo "✗ Hay $EN_CURSO recibo(s) en_curso; exportados en $ARCHIVO_RECIBOS" >&2
  echo "  NO se migra mientras queden pendientes: confirma la entrega o el fallo" >&2
  echo "  de cada envío y vuelve a ejecutar esta comprobación." >&2
  exit 1
fi

# ── 2. Envíos inciertos: bloquean solo si su desenlace no consta ─
INCIERTO=$(contar \
  "SELECT count(*) FROM whatsapp_send_receipts WHERE status = 'incierto';") || {
  echo "✗ No se pudo contar los recibos inciertos: no se migra." >&2
  exit 2
}
if [ "$INCIERTO" != "0" ]; then
  # El desenlace de un envío incierto se guarda también en su solicitud
  # (`result.desenlace`), que sobrevive al DROP. Si no está ahí, el recibo es
  # lo único que dice que el mensaje pudo salir.
  ORIGEN_SIN_TRAZA="whatsapp_send_receipts r
          LEFT JOIN \"mcp_approval_requests\" a ON a.id = r.\"approvalId\"
          WHERE r.status = 'incierto'
            AND (a.id IS NULL OR a.result->>'desenlace' IS DISTINCT FROM 'incierto')"
  SIN_TRAZA=$(contar "SELECT count(*) FROM $ORIGEN_SIN_TRAZA;") || {
    echo "✗ No se pudo comprobar la traza de los recibos inciertos: no se migra." >&2
    exit 2
  }
  if [ "$SIN_TRAZA" != "0" ]; then
    exportar incierto-sin-traza "$ORIGEN_SIN_TRAZA"
    echo "✗ Hay $SIN_TRAZA recibo(s) incierto sin desenlace en su solicitud;" >&2
    echo "  exportados en $ARCHIVO_RECIBOS" >&2
    echo "  Ese recibo es la única prueba de que el mensaje pudo salir: NO se migra." >&2
    echo "  Reconcilia cada envío (búscalo en el proveedor) antes de reintentar." >&2
    exit 1
  fi
  exportar incierto "whatsapp_send_receipts r WHERE r.status = 'incierto'"
  echo "· $INCIERTO recibo(s) incierto exportados en $ARCHIVO_RECIBOS; su desenlace"
  echo "  queda en la solicitud de aprobación, que no se borra."
fi

echo "✓ 0 recibos en_curso y ningún incierto sin traza: se puede eliminar la tabla."
exit 0
