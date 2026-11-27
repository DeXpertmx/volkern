#!/usr/bin/env bash
#
# Valida las migraciones nuevas de MCP contra un Postgres desechable.
#
# Hace lo que un `migrate deploy` en producción, pero en un contenedor temporal:
#   1. aplica TODAS las migraciones anteriores al corte (20261127160000);
#   2. siembra filas con los duplicados que las migraciones dicen arreglar
#      (operationId repetido, solicitudes pendientes idénticas sin id);
#   3. aplica las migraciones nuevas con `prisma migrate deploy`;
#   4. comprueba que la deduplicación no perdió filas y que los índices únicos
#      impiden de verdad lo que tienen que impedir.
#
# Uso:  bash scripts/validar-migraciones-postgres.sh
# Requiere: docker, psql y las dependencias de nextjs_space instaladas.
#
set -euo pipefail

CORTE="20261127160000"          # primera migración nueva (todo lo anterior es el esquema previo)
IMAGEN="postgres:16-alpine"
PUERTO="55432"
NOMBRE="volkern-mig-validacion-$$"
USUARIO="test"
CLAVE="test"
BASE="volkern_validacion"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
FALLOS=0

limpiar() {
  docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpiar EXIT

export DATABASE_URL="postgresql://${USUARIO}:${CLAVE}@127.0.0.1:${PUERTO}/${BASE}"

echo "▶ Postgres desechable ${IMAGEN} en :${PUERTO}"
docker run --rm -d --name "$NOMBRE" \
  -e POSTGRES_USER="$USUARIO" -e POSTGRES_PASSWORD="$CLAVE" -e POSTGRES_DB="$BASE" \
  -p "${PUERTO}:5432" "$IMAGEN" >/dev/null

for _ in $(seq 1 60); do
  pg_isready -h 127.0.0.1 -p "$PUERTO" -U "$USUARIO" >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p "$PUERTO" -U "$USUARIO" >/dev/null

q() { psql "$DATABASE_URL" -t -A -v ON_ERROR_STOP=1 -c "$1"; }

comprobar() { # descripción | esperado | sql
  local real
  real="$(q "$3")"
  if [ "$real" = "$2" ]; then
    echo "  OK    $1"
  else
    echo "  FALLO $1 → esperado [$2], obtenido [$real]"
    FALLOS=$((FALLOS + 1))
  fi
}

debe_fallar() { # descripción | sql
  if psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1; then
    echo "  FALLO $1 → la base aceptó algo que debía rechazar"
    FALLOS=$((FALLOS + 1))
  else
    echo "  OK    $1"
  fi
}

debe_pasar() { # descripción | sql
  if psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "$2" >/dev/null 2>&1; then
    echo "  OK    $1"
  else
    echo "  FALLO $1 → la base rechazó algo que debía aceptar"
    FALLOS=$((FALLOS + 1))
  fi
}

# ── 1. Esquema previo ───────────────────────────────────────────────────
mkdir -p "$TMP/prisma/migrations"
cp "$RAIZ/prisma/schema.prisma" "$TMP/prisma/schema.prisma"
cp "$RAIZ/prisma/migrations/migration_lock.toml" "$TMP/prisma/migrations/"
PREVIAS=0
for dir in "$RAIZ"/prisma/migrations/*/; do
  nombre="$(basename "$dir")"
  if [[ "$nombre" < "$CORTE" ]]; then
    cp -R "$dir" "$TMP/prisma/migrations/$nombre"
    PREVIAS=$((PREVIAS + 1))
  fi
done

echo "▶ migrate deploy del esquema previo (${PREVIAS} migraciones)"
( cd "$RAIZ" && npx prisma migrate deploy --schema "$TMP/prisma/schema.prisma" >/dev/null )

# ── 2. Duplicados que las migraciones deben resolver ────────────────────
echo "▶ Sembrando filas con duplicados (id repetido y pendientes idénticas)"
# El índice de octubre impide las pendientes duplicadas, así que para probar la
# reparación se simula una base donde ese índice parcial no está (Prisma no
# puede modelarlo y un `db push` lo borraría).
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c 'DROP INDEX IF EXISTS "mcp_approval_requests_pendiente_unica"'
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "mcp_approval_requests"
  (id, "tenantId", "toolName", arguments, "argumentsHash", "operationId",
   "requestedById", via, status, "expiresAt", "createdAt")
VALUES
  -- mismo operationId y mismo usuario: solo debe quedar el más reciente
  ('ap-dup-1','tenant-a','volkern_delete_contact','{"id":"c-1"}','h-dup-1','op-1','user-ana','/mcp','pending', now()+interval '1 day', now()-interval '3 hours'),
  ('ap-dup-2','tenant-a','volkern_delete_contact','{"id":"c-1"}','h-dup-2','op-1','user-ana','/mcp','pending', now()+interval '1 day', now()-interval '2 hours'),
  ('ap-dup-3','tenant-a','volkern_delete_contact','{"id":"c-1"}','h-dup-3','op-1','user-ana','/mcp','pending', now()+interval '1 day', now()-interval '1 hour'),
  -- mismo operationId con OTRO usuario: no es un duplicado
  ('ap-otro-usuario','tenant-a','volkern_delete_contact','{"id":"c-9"}','h-dup-4','op-1','user-luis','/mcp','pending', now()+interval '1 day', now()-interval '1 hour'),
  -- pendientes idénticas sin operationId: solo una debe seguir pendiente
  ('ap-pend-1','tenant-a','volkern_delete_contact','{"id":"c-2"}','h-pend',NULL,'user-ana','/mcp','pending', now()+interval '1 day', now()-interval '2 hours'),
  ('ap-pend-2','tenant-a','volkern_delete_contact','{"id":"c-2"}','h-pend',NULL,'user-ana','/mcp','pending', now()+interval '1 day', now()-interval '1 hour'),
  -- misma huella pero ya ejecutada: no se toca
  ('ap-pend-ok','tenant-a','volkern_delete_contact','{"id":"c-4"}','h-ejecutada',NULL,'user-ana','/mcp','executed', now()+interval '1 day', now()-interval '30 minutes'),
  -- misma huella en otra empresa: no se toca
  ('ap-otra-empresa','tenant-b','volkern_delete_contact','{"id":"c-2"}','h-pend',NULL,'user-ana','/mcp','pending', now()+interval '1 day', now()-interval '1 hour');
SQL

FILAS_ANTES="$(q 'SELECT count(*) FROM "mcp_approval_requests"')"

# ── 3. Migraciones nuevas ───────────────────────────────────────────────
echo "▶ migrate deploy de las migraciones nuevas"
NUEVAS=0
for dir in "$RAIZ"/prisma/migrations/*/; do
  nombre="$(basename "$dir")"
  if [[ "$nombre" > "$CORTE" || "$nombre" == "$CORTE" ]]; then
    cp -R "$dir" "$TMP/prisma/migrations/$nombre"
    NUEVAS=$((NUEVAS + 1))
  fi
done
( cd "$RAIZ" && npx prisma migrate deploy --schema "$TMP/prisma/schema.prisma" )

echo "▶ Comprobaciones"
comprobar "no se pierde ninguna fila" "$FILAS_ANTES" 'SELECT count(*) FROM "mcp_approval_requests"'
comprobar "el operationId duplicado queda solo en el más reciente" "ap-dup-3" \
  "SELECT id FROM \"mcp_approval_requests\" WHERE \"operationId\" = 'op-1' AND \"requestedById\" = 'user-ana'"
comprobar "los duplicados anteriores quedan sin operationId" "2" \
  "SELECT count(*) FROM \"mcp_approval_requests\" WHERE id IN ('ap-dup-1','ap-dup-2') AND \"operationId\" IS NULL"
comprobar "el mismo id de otro usuario no se toca" "op-1" \
  "SELECT \"operationId\" FROM \"mcp_approval_requests\" WHERE id = 'ap-otro-usuario'"
comprobar "solo una pendiente idéntica sigue pendiente" "ap-pend-2" \
  "SELECT id FROM \"mcp_approval_requests\" WHERE \"tenantId\" = 'tenant-a' AND \"toolName\" = 'volkern_delete_contact' AND \"argumentsHash\" = 'h-pend' AND status = 'pending' AND \"operationId\" IS NULL"
comprobar "la pendiente duplicada anterior queda caducada" "expired" \
  "SELECT status FROM \"mcp_approval_requests\" WHERE id = 'ap-pend-1'"
comprobar "una fila ya ejecutada con la misma huella no se toca" "executed" \
  "SELECT status FROM \"mcp_approval_requests\" WHERE id = 'ap-pend-ok'"
comprobar "la misma huella en otra empresa sigue pendiente" "pending" \
  "SELECT status FROM \"mcp_approval_requests\" WHERE id = 'ap-otra-empresa'"
comprobar "la tabla de recibos desaparece" "" "SELECT to_regclass('public.whatsapp_send_receipts')::text"
comprobar "existe el índice único por usuario e id" "1" \
  "SELECT count(*) FROM pg_indexes WHERE indexname = 'mcp_approval_requests_tenantId_requestedById_operationId_key'"
comprobar "existe el índice parcial por contenido" "1" \
  "SELECT count(*) FROM pg_indexes WHERE indexname = 'mcp_approval_requests_pendiente_contenido_key' AND indexdef LIKE '%WHERE%'"
comprobar "el índice parcial antiguo se reemplaza, no se duplica" "0" \
  "SELECT count(*) FROM pg_indexes WHERE indexname = 'mcp_approval_requests_pendiente_unica'"
comprobar "migraciones aplicadas" "$((PREVIAS + NUEVAS))" \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'

echo "▶ Restricciones en uso"
debe_fallar "dos pendientes idénticas sin operationId" \
  "INSERT INTO \"mcp_approval_requests\" (id,\"tenantId\",\"toolName\",arguments,\"argumentsHash\",\"operationId\",\"requestedById\",via,status,\"expiresAt\") VALUES ('ap-nueva','tenant-a','volkern_delete_contact','{\"id\":\"c-2\"}','h-pend',NULL,'user-ana','/mcp','pending', now()+interval '1 day')"
debe_fallar "el mismo operationId para el mismo usuario" \
  "INSERT INTO \"mcp_approval_requests\" (id,\"tenantId\",\"toolName\",arguments,\"argumentsHash\",\"operationId\",\"requestedById\",via,status,\"expiresAt\") VALUES ('ap-op-repetido','tenant-a','volkern_delete_contact','{\"id\":\"c-3\"}','h-nueva','op-1','user-ana','/mcp','pending', now()+interval '1 day')"
debe_pasar "el mismo operationId para otro usuario" \
  "INSERT INTO \"mcp_approval_requests\" (id,\"tenantId\",\"toolName\",arguments,\"argumentsHash\",\"operationId\",\"requestedById\",via,status,\"expiresAt\") VALUES ('ap-op-otro','tenant-a','volkern_delete_contact','{\"id\":\"c-3\"}','h-nueva','op-1','user-marta','/mcp','pending', now()+interval '1 day')"
debe_pasar "reutilizar la huella cuando la anterior ya no está pendiente" \
  "INSERT INTO \"mcp_approval_requests\" (id,\"tenantId\",\"toolName\",arguments,\"argumentsHash\",\"operationId\",\"requestedById\",via,status,\"expiresAt\") VALUES ('ap-nueva-2','tenant-a','volkern_delete_contact','{\"id\":\"c-4\"}','h-ejecutada',NULL,'user-ana','/mcp','pending', now()+interval '1 day')"

echo
if [ "$FALLOS" -eq 0 ]; then
  echo "✅ Migraciones válidas (${NUEVAS} nuevas sobre ${FILAS_ANTES} filas existentes)"
else
  echo "❌ ${FALLOS} comprobaciones fallidas"
  exit 1
fi
