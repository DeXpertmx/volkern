#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# Docker Entrypoint — Volkern ERP
# 1. Espera a que la DB esté disponible
# 2. Ejecuta migraciones de Prisma
# 3. Ejecuta data migrations (idempotentes)
# 4. Hace seed si la DB está vacía (opcional)
# 5. Inicia el servidor Next.js
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
# Usar el CLI local (copiado en la imagen, versión 6.x del proyecto) en vez
# de dejar que npx descargue la última versión del registry (7.x no soporta
# `url` en el datasource → migrate deploy falla en cada boot). El binario
# está en node_modules/.bin/prisma (wrapper a prisma/build/index.js).
if [ -x /app/node_modules/.bin/prisma ]; then
  PRISMA="node /app/node_modules/prisma/build/index.js"
  # Sin comillas en $PRISMA a propósito: la palabra "node" y la ruta deben
  # expandirse como dos argumentos del shell.
  echo "   ✓ CLI local de Prisma: $($PRISMA --version 2>/dev/null | grep -oE '^prisma[[:space:]]+:[[:space:]]+[0-9.]+' || echo 'versión no detectada')"
elif command -v npx >/dev/null 2>&1; then
  echo "   ⚠️  CLI de Prisma no está en la imagen; npx descargará la versión del registry."
  PRISMA="npx prisma"
else
  echo "   ⚠️  Sin CLI de Prisma disponible; se omiten las migraciones."
  PRISMA=""
fi
if [ -n "$PRISMA" ] && ! $PRISMA migrate deploy 2>&1; then
  if [ "${ALLOW_DB_PUSH:-false}" = "true" ]; then
    echo "⚠️  ALLOW_DB_PUSH=true — ejecutando db push (puede causar pérdida de datos)"
    $PRISMA db push --accept-data-loss 2>&1 || echo "⚠️  db push falló, continuando..."
  else
    echo "⚠️  migrate deploy falló. Para usar db push, setear ALLOW_DB_PUSH=true"
    echo "   Continuando sin migraciones..."
  fi
fi

# ─── 3. Data migrations (idempotentes, seguras de ejecutar en cada deploy) ───
echo "→ Ejecutando data migrations..."
node -e "$(cat <<'NODESCRIPT'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    // 1. Desactivar pipeline 'Inmobiliario' antiguo (reemplazado por Captación + Compra)
    const r1 = await p.$executeRawUnsafe(`UPDATE "pipelines" SET "activo" = false, "nombre" = 'Inmobiliario (Legacy)', "descripcion" = 'Pipeline migrado. Reemplazado por Captación y Compra.' WHERE "categoria" = 'inmobiliario' AND "activo" = true`);
    if (r1 > 0) console.log('   ✓ Inmobiliario legacy desactivado: ' + r1 + ' pipeline(s)');
    else console.log('   ✓ Inmobiliario legacy ya migrado');

    // 2. Corregir orden del pipeline Finanzas (5 → 6) — duplicado con Compra
    const r2 = await p.$executeRawUnsafe(`UPDATE "pipelines" SET "orden" = 6 WHERE "categoria" = 'finanzas' AND "orden" = 5`);
    if (r2 > 0) console.log('   ✓ Finanzas orden corregido (5 → 6): ' + r2 + ' pipeline(s)');
    else console.log('   ✓ Finanzas orden ya correcto');
  } catch(e) {
    console.error('   ⚠️  Data migration falló:', e.message);
    process.exitCode = 0;
  } finally {
    await p.$disconnect();
  }
})();
NODESCRIPT
)" 2>&1

# ─── 4. Seed opcional (solo si la DB está vacía) ──────────
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "→ Ejecutando seed (SEED_ON_START=true)..."
  npx prisma db seed 2>&1 || echo "⚠️  Seed falló, continuando..."
fi

# ─── 5. Iniciar servidor ──────────────────────────────────
echo "→ Iniciando servidor Next.js..."
echo "   NODE_ENV=$NODE_ENV"
echo "   PORT=${PORT:-3000}"
echo ""
exec "$@"
