#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# Docker Entrypoint — Volkern ERP
# 1. Espera a que la DB esté disponible
# 2. Ejecuta migraciones de Prisma
# 3. Hace seed si la DB está vacía (opcional)
# 4. Inicia el servidor Next.js
# ═══════════════════════════════════════════════════════════════
set -e

echo "=== Volkern ERP — Docker Entrypoint ==="

# ─── 1. Esperar a que PostgreSQL esté listo ────────────────
if [ -n "$DATABASE_URL" ]; then
  echo "→ Esperando a PostgreSQL..."
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:/]*\).*/\1/p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
  DB_PORT="${DB_PORT:-5432}"

  for i in $(seq 1 30); do
    if node -e "
      const net = require('net');
      const c = net.createConnection({ host: '$DB_HOST', port: $DB_PORT });
      c.on('connect', () => { c.end(); process.exit(0); });
      c.on('error', () => process.exit(1));
    " 2>/dev/null; then
      echo "   ✓ DB disponible (intento $i)"
      break
    fi
    echo "   Esperando DB... (intento $i/30)"
    sleep 2
  done
fi

# ─── 2. Ejecutar migraciones ───────────────────────────────
echo "→ Ejecutando migraciones de Prisma..."
if ! npx prisma migrate deploy 2>&1; then
  if [ "${ALLOW_DB_PUSH:-false}" = "true" ]; then
    echo "⚠️  ALLOW_DB_PUSH=true — ejecutando db push (puede causar pérdida de datos)"
    npx prisma db push --accept-data-loss 2>&1 || echo "⚠️  db push falló, continuando..."
  else
    echo "⚠️  migrate deploy falló. Para usar db push, setear ALLOW_DB_PUSH=true"
    echo "   Continuando sin migraciones..."
  fi
fi

# ─── 3. Seed opcional (solo si la DB está vacía) ──────────
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "→ Ejecutando seed (SEED_ON_START=true)..."
  npx prisma db seed 2>&1 || echo "⚠️  Seed falló, continuando..."
fi

# ─── 4. Iniciar servidor ──────────────────────────────────
echo "→ Iniciando servidor Next.js..."
echo "   NODE_ENV=$NODE_ENV"
echo "   PORT=${PORT:-3000}"
echo ""
exec "$@"
