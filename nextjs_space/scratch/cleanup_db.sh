#!/usr/bin/env bash
#
# ⚠️ DESTRUCTIVO: pone a NULL la columna `dbUrl` de TODOS los tenants, deshaciendo
# el reparto por base de datos. Apunta a la base que indiques en DATABASE_URL:
# compruébala DOS veces antes de ejecutar.
#
# La conexión se lee del entorno. Antes estaba escrita en el archivo, apuntando a
# la base de datos de producción: ver docs/ROTACION-CREDENCIALES-ADMIN.md.
#
#   DATABASE_URL='postgresql://…' bash scratch/cleanup_db.sh
#
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL en el entorno antes de ejecutar.}"

psql "$DATABASE_URL" -c "UPDATE \"Tenant\" SET \"dbUrl\" = NULL;"
