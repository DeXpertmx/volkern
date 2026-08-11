#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# checkpoint.sh — Snapshot READ-ONLY de la BD de Volkern (versión psql-only)
#
# Por qué sin pg_dump: el server de Neon corre PostgreSQL 17 pero el cliente
# local disponible es pg_dump 16 — pg_dump aborta por version mismatch.
# Solución: usar psql + COPY TO CSV por tabla. Todo pure SQL estándar,
# no requiere cliente que matche versión del server.
#
# Uso:    bash scripts/checkpoint.sh [descripción]
# Ejemplo: bash scripts/checkpoint.sh "baseline antes de fix X"
#
# Genera en nextjs_space/.checkpoints/<timestamp>/:
#   - schema.json     estructura de todas las tablas (columnas, FKs, enums)
#   - data/<table>.csv dump por tabla vía COPY ... CSV HEADER
#   - state.json       conteos de tablas críticas
#   - README.md        cómo restaurar + garantías
#
# Garantías:
#   - NUNCA escribe en la BD. Solo SELECT, COPY TO, pg_catalog reads.
#   - Sin --accept-data-loss / --force / --reset.
#   - Las copias CSV pueden restaurarse con COPY ... FROM, regenerando datos,
#     pero sólo si la tabla está vacía (o si el operador decide explícitamente).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DESCRIPTION="${1:-manual}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CHECKPOINT_DIR="nextjs_space/.checkpoints/${TIMESTAMP}"
DATA_DIR="${CHECKPOINT_DIR}/data"
BACKEND_DIR="nextjs_space"

# ── 1. Cargar DATABASE_URL desde el primer .env* que la defina ──────────────
load_db_url() {
  local envfile
  for envfile in \
    "${BACKEND_DIR}/.env" \
    "${BACKEND_DIR}/.env.local" \
    "${BACKEND_DIR}/.env.production" \
    "${BACKEND_DIR}/.env.production.local" \
    "${BACKEND_DIR}/.env.vercel"; do
    if [[ -f "$envfile" ]]; then
      local line
      line=$(grep -E '^(export )?(DATABASE_URL|POSTGRES_URL|PRISMA_DATABASE_URL|NEON_DATABASE_URL)=' \
              "$envfile" 2>/dev/null | head -1)
      if [[ -n "$line" ]]; then
        eval "${line#export }"
        return 0
      fi
    fi
  done
  return 1
}

if ! load_db_url; then
  printf "ERROR: DATABASE_URL no encontrada en ningún .env* bajo %s/\n" "$BACKEND_DIR" >&2
  exit 1
fi

DB_URL_SAFE="$(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@]+@#://REDACTED@#')"

mkdir -p "$DATA_DIR"

printf "\n"
printf "📸 Checkpoint:   %s\n" "$TIMESTAMP"
printf "   descripción: %s\n" "$DESCRIPTION"
printf "   destino:     %s\n" "$CHECKPOINT_DIR"
printf "   DB target:   %s\n" "$DB_URL_SAFE"
printf "\n"

# ── 2. Listar tablas de usuario (excluye pg_catalog e information_schema) ───
psy_run() {
  psql "$DATABASE_URL" --no-psqlrc --no-align --tuples-only "$@"
}
psy_run_plain() {
  psql "$DATABASE_URL" --no-psqlrc --no-align "$@"
}

printf "[1/4] listando tablas de usuario (excluye pg_catalog e information_schema) ...\n"
TABLE_LIST="$(psy_run --command="
  SELECT n.nspname || '|' || c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY n.nspname, c.relname;
")"
N_TABLES=$(printf '%s\n' "$TABLE_LIST" | grep -c '|')
printf "        ✓ %s tablas\n" "$N_TABLES"

# ── 3. Schema JSON (columnas, FKs, enums vía information_schema + catalogs) ─
printf "[2/4] extrayendo schema → schema.json ...\n"
{
  printf '{'
  printf '\n  "timestamp": "%s",' "$TIMESTAMP"
  printf '\n  "description": "%s",' "$DESCRIPTION"
  printf '\n  "tables": ['

  FIRST=true
  while IFS='|' read -r schema table; do
    [[ -z "$schema" ]] && continue
    if [[ "$FIRST" == "true" ]]; then
      FIRST=false
    else
      printf ','
    fi
    printf '\n    {'
    printf '\n      "schema": "%s",' "$schema"
    printf '\n      "table": "%s",' "$table"
    # Columns via information_schema
    printf '\n      "columns": ['
    psy_run --command="
      SELECT '{\"name\":\"' || column_name ||
             '\",\"type\":\"' || data_type ||
             '\",\"nullable\":' || (CASE WHEN is_nullable='YES' THEN 'true' ELSE 'false' END) ||
             ',\"default\":' || COALESCE('\"' || column_default || '\"', 'null') || '}'
      FROM information_schema.columns
      WHERE table_schema='${schema}' AND table_name='${table}'
      ORDER BY ordinal_position;
    " | paste -sd ',' - | tr -d '\n'
    printf '],'
    # Foreign keys via pg_constraint
    printf '\n      "foreign_keys": ['
    psy_run --command="
      SELECT '{\"name\":\"' || conname ||
             '\",\"definition\":\"' || replace(pg_get_constraintdef(oid), '\"', '\\\"') || '\"}'
      FROM pg_constraint
      WHERE conrelid='${schema}.\"${table}\"'::regclass AND contype='f';
    " | paste -sd ',' - | tr -d '\n'
    printf ']'
    printf '\n    }'
  done <<< "$TABLE_LIST"
  printf '\n  ]'
  printf '\n}\n'
} > "$CHECKPOINT_DIR/schema.json"

SCHEMA_BYTES=$(wc -c < "$CHECKPOINT_DIR/schema.json" | tr -d ' ')
printf "        ✓ schema.json (%s bytes)\n" "$SCHEMA_BYTES"

# ── 4. Data per-tabla vía COPY TO CSV ───────────────────────────────────────
printf "[3/4] dumping data → data/<table>.csv (COPY TO csv header) ...\n"
COPY_OK=0
COPY_FAIL=0
while IFS='|' read -r schema table; do
  [[ -z "$schema" ]] && continue
  out="${DATA_DIR}/${table}.csv"
  if psy_run_plain --command="COPY \"${schema}\".\"${table}\" TO STDOUT WITH (FORMAT csv, HEADER true, NULL '\\\\N')" \
       > "$out" 2>> "$CHECKPOINT_DIR/copy_errors.log"; then
    rows=$(wc -l < "$out" | tr -d ' ')
    printf "        ✓ %s.%s.csv (%s líneas)\n" "$schema" "$table" "$rows"
    COPY_OK=$((COPY_OK+1))
  else
    printf "        ✗ %s.%s.csv — error en COPY (ver copy_errors.log)\n" "$schema" "$table"
    COPY_FAIL=$((COPY_FAIL+1))
  fi
done <<< "$TABLE_LIST"
printf "        ✓ %s tablas OK, %s con error\n" "$COPY_OK" "$COPY_FAIL"

# ── 5. Conteos críticos → state.json ─────────────────────────────────────────
printf "[4/4] conteos de tablas críticas → state.json ...\n"
TABLES_CRITICAL=("User" "Account" "Session" "Tenant" "Role" "Lead" "Cita" "Contact" "Poliza" "Configuracion")
{
  printf '{\n'
  printf '  "timestamp": "%s",\n' "$TIMESTAMP"
  printf '  "description": "%s",\n' "$DESCRIPTION"
  printf '  "tables": {\n'
  FIRST=true
  for tbl in "${TABLES_CRITICAL[@]}"; do
    COUNT=$(psy_run --command="SELECT count(*) FROM \"public\".\"${tbl}\";" 2>/dev/null | tr -d ' \n' || true)
    COUNT="${COUNT:-ERR}"
    if [[ "$FIRST" == "true" ]]; then
      FIRST=false
    else
      printf ',\n'
    fi
    printf '    "%s": %s' "$tbl" "$COUNT"
  done
  printf '\n'
  printf '  },\n'
  printf '  "checkpoint_meta": {\n'
  printf '    "tables_total": %s,\n' "$N_TABLES"
  printf '    "tables_copy_ok": %s,\n' "$COPY_OK"
  printf '    "tables_copy_failed": %s\n' "$COPY_FAIL"
  printf '  }\n'
  printf '}\n'
} > "$CHECKPOINT_DIR/state.json"

cat "$CHECKPOINT_DIR/state.json"
printf "\n"

# ── 6. README.md ─────────────────────────────────────────────────────────────
{
  cat <<EOF
# Checkpoint ${TIMESTAMP}

**Descripción:** ${DESCRIPTION}
**DB target:** \`${DB_URL_SAFE}\`
**Naturaleza:** Snapshot READ-ONLY. La BD no fue modificada.
**Método:** psql + COPY TO CSV (sin pg_dump por incompatibilidad de versión cliente↔server).

## Estado capturado

\`\`\`json
$(cat "$CHECKPOINT_DIR/state.json")
\`\`\`

## Archivos generados

| Archivo | Contenido |
|---------|-----------|
| \`schema.json\` | Columnas, defaults, FKs de cada tabla de usuario |
| \`data/<tabla>.csv\` | Dump por tabla (COPY ... CSV HEADER). Cada CSV empieza con sus columnas |
| \`state.json\` | Conteos de tablas críticas + meta del checkpoint |
| \`copy_errors.log\` | Log de tablas donde COPY falló (raro, si existe lo investigamos) |

## Restaurar datos de una tabla específica (⚠️ muy explícito)

\`\`\`bash
# Confirmar que la tabla está en estado deseado antes de hacer TO.
psql "\$DATABASE_URL" --command="SELECT count(*) FROM \"$TABLA\""
# Restaurar SOLO si aceptas el overwrite (si la tabla tiene contenido actual):
psql "\$DATABASE_URL" --command="TRUNCATE \"$TABLA\"; COPY \"$TABLA\" FROM '$CHECKPOINT_DIR/data/$TABLA.csv' WITH (CSV HEADER)"
\`\`\`

⚠️ Cuidado: el truncate es destructivo. Solo hazlo si sabes que quieres sobreescribir exactamente el contenido preexistente.

## Garantías

- El script NO usa \`--accept-data-loss\`, \`--force\`, \`--reset\` ni flags destructivos.
- La BD NO fue tocada por este checkpoint (solo lectura + COPY TO STDOUT).
EOF
} > "$CHECKPOINT_DIR/README.md"

printf "\n"
printf "✅ Checkpoint en %s/\n" "$CHECKPOINT_DIR"
ls -la "$CHECKPOINT_DIR/"
printf "\n📊 data/ contents (%s archivos):\n" "$(ls -1 "$DATA_DIR" 2>/dev/null | wc -l)"
ls -1 "$DATA_DIR" 2>/dev/null | head -10
if [[ "$(ls -1 "$DATA_DIR" 2>/dev/null | wc -l)" -gt 10 ]]; then
  printf "  ... y %s archivos más\n" "$((($(ls -1 "$DATA_DIR" 2>/dev/null | wc -l)) - 10))"
fi
