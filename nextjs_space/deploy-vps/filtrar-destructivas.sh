#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# filtrar-destructivas.sh — ¿El SQL pendiente de migrar es destructivo?
#
# El `prisma migrate deploy` del despliegue no pregunta: aplica lo que
# hay sin leerlo. Una migración que llegue a producción con un `DROP
# TABLE` o un `DELETE` sin `WHERE` es la vía más rápida a perder datos
# de clientes. Este módulo convierte esa posibilidad silenciosa en un
# aborto explícito, ANTES de tocar la base.
#
# Es la capa de "revisión destructiva" del flujo de migraciones del
# VPS: `run-migrations.sh` (y su preflight) venden el estado actual;
# aquí se stoppea el deploy si algo en la serie pendiente pierde datos
# o estructura sin revisión.
#
# Qué hace
# --------
#   · Modo por ficheros (por defecto): recibe el directorio con las
#     migraciones pendientes (o un solo .sql), extrae el SQL y delegate
#     el cálculo a `sql_es_destructivo` (función PURA, importada
#     también por la guardia de tests para verificarla en frío).
#   · ≥1 pendiente destructiva → lista, exit 1.
#   · 0 pendientes → exit 0 silencioso (no ensucia el log del deploy).
#
# Modo query (opcional, para el preflight remoto):
#   bash filtrar-destructivas.sh --sql <fichero.sql>
#
# La lista de patrones es conservadora por diseño: cualquier duda
# cuenta como destructiva (`ALTER TABLE … SET NOT NULL`, `RENAME`,
# cambio de tipo...). Fallar "hacia el lado de no desplegar" es barato;
# fallar al revés perdió datos una vez ya en este proyecto (el 11-ago-
# 2026, ver tests/guardia-base-datos-produccion.ts).
#
# Uso:
#   bash deploy-vps/filtrar-destructivas.sh [dir_migraciones] [dir_base=prisma/migrations]
#   bash deploy-vps/filtrar-destructivas.sh --sql /tmp/pendiente.sql
#
# Guardia: tests/filtrar-destructivas-guard.test.ts
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Funciones puras (reutilizadas por tests/filtrar-destructivas-guard.test.ts) ──

# Normaliza SQL: sin comentarios `--` ni `/* */`, sin cadenas entre
# comillas simples (para que un nombre tipo `DELETE FROM users` no
# engañe al detector), sin saltos raros.
normalizar_sql() {
  sed -e 's/--[^\n]*//' \
      -e 's#/\*[^*]*\**\([^/*][^*]*\*+\)*/##g' \
      -e "s/'[^']*'//g" \
      -e "$ s/[[:space:]]+$//"
}

# Devuelve la PRIMERA sentencia destructiva que encuentre (una línea,
# para mensajes de error) o cadena vacía si el SQL es seguro.
# Ejercicio de patrón: cada uno cubre una familia real de pérdida.
sql_es_destructivo() {
  local sql
  # shellcheck disable=SC2001
  sql=$(echo "$1" | normalizar_sql)

  # 1. DROP de cualquier cosa (tabla, índice, columna, constraint, esquema).
  if echo "$sql" | grep -qiE '^(DROP (TABLE|INDEX|SCHEMA|VIEW|MATERIALIZED VIEW|FUNCTION|TRIGGER|SEQUENCE|DATABASE|TYPE|ROLE))|;[[:space:]]*(DROP (TABLE|INDEX|SCHEMA|VIEW|MATERIALIZED VIEW|FUNCTION|TRIGGER|SEQUENCE|DATABASE|TYPE|ROLE))|ALTER TABLE[^;]*DROP (COLUMN|CONSTRAINT|NOT NULL|DEFAULT)?'; then
    echo "$sql" | grep -iE 'DROP (TABLE|INDEX|SCHEMA|VIEW|MATERIALIZED|FUNCTION|TRIGGER|SEQUENCE|DATABASE|TYPE|ROLE)|ALTER TABLE[^;]*DROP' | head -1
    return 0
  fi

  # 2. TRUNCATE (equivalente a DELETE sin WHERE, con menos salvedades).
  if echo "$sql" | grep -qiE '(^|;)[[:space:]]*TRUNCATE'; then
    echo "$sql" | grep -iE '(^|;)[[:space:]]*TRUNCATE' | head -1
    return 0
  fi

  # 3. DELETE sin WHERE: busca "DELETE FROM <algo>;" sin cláusula WHERE entre medias.
  if echo "$sql" | grep -qiE 'DELETE FROM'; then
    if ! echo "$sql" | grep -qiE 'WHERE'; then
      echo "$sql" | grep -iE 'DELETE FROM' | head -1
      return 0
    fi
  fi

  # 4. UPDATE sin WHERE.
  if echo "$sql" | grep -qiE 'UPDATE[[:space:]]+[^;]+'; then
    # `tr ';' '\n'` parte por sentencia: cada UPDATE se mira solo, así que
    # un WHERE de OTRA sentencia no lo "salva". Una sentencia UPDATE sin
    # WHERE es suficiente para marcar el SQL como destructivo.
    if echo "$sql" | tr '\n' ' ' | tr ';' '\n' | grep -Ei 'UPDATE[[:space:]]+[^;]+' | grep -qviE 'WHERE'; then
      echo "$sql" | grep -iE 'UPDATE[[:space:]]+' | head -1
      return 0
    fi
  fi
  # 5. ALTER TABLE con cambio destructivo renombrar tabla/columna, cambiar
  #    tipo de columna (con pérdida potencial) o poner NOT NULL a un campo
  #    que ya tenga filas (fallaría / recortaría).
  if echo "$sql" | grep -qiE 'ALTER TABLE[^;]*\b(SET NOT NULL|RENAME (TO|COLUMN)|ALTER COLUMN[^;]*TYPE)'; then
    echo "$sql" | grep -iE 'ALTER TABLE' | head -1
    return 0
  fi

  return 1
}

export -f normalizar_sql
export -f sql_es_destructivo

# Cuando el script se importa (`source …`) para reutilizar sus funciones
# puras desde tests u otros scripts, NO ejecuta su main: es librería.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return 0
fi

# ── Modo query opcional ──
if [ "${1:-}" = "--sql" ]; then
  F="${2:-}"
  if [ -z "$F" ] || [ ! -f "$F" ]; then
    echo "✗ --sql necesita un fichero SQL existente" >&2
    exit 2
  fi
  SQL=$(cat "$F")
  if RESULTADO=$(sql_es_destructivo "$SQL"); then
    echo "✗ SQL destructivo detectado en $F: $RESULTADO" >&2
    exit 1
  fi
  echo "→ $F no contiene DDL destructivo."
  exit 0
fi

# ── Modo por ficheros: dir de pendientes (+ opcional base completa) ──
DIR_PENDIENTES="${1:-}"
DIR_BASE="${2:-prisma/migrations}"
if [ -z "$DIR_PENDIENTES" ] || [ ! -d "$DIR_PENDIENTES" ]; then
  echo "✗ Falta el directorio con las migraciones pendientes." >&2
  echo "  Uso: bash filtrar-destructivas.sh <dir_pendientes> [dir_base]" >&2
  exit 2
fi

DESTRUCTIVAS=()
DESTRUCTIVA_ARCHIVOS=()
for mig in "$DIR_PENDIENTES"/*/; do
  [ -f "$mig/migration.sql" ] || continue
  nombre=$(basename "$mig")
  sql=$(cat "$mig/migration.sql")
  if resultado=$(sql_es_destructivo "$sql"); then
    DESTRUCTIVAS+=("$resultado")
    DESTRUCTIVA_ARCHIVOS+=("$nombre")
  fi
done

if [ "${#DESTRUCTIVAS[@]}" -gt 0 ]; then
  echo "✗ Migraciones PENDIENTES con SQL destructivo — deploy ABORTADO:" >&2
  for i in "${!DESTRUCTIVAS[@]}"; do
    echo "" >&2
    echo "  · ${DESTRUCTIVA_ARCHIVOS[$i]}:" >&2
    echo "    ${DESTRUCTIVAS[$i]}" >&2
  done
  echo "" >&2
  echo "  Revisa cada sentencia del listado arriba: si de verdad se quiere" >&2
  echo "  ese DROP/ALTER imposible de revertir en producción, se hace a" >&2
  echo "  mano con backup inmediato previo, nunca dentro del deploy." >&2
  exit 1
fi

exit 0
