#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Setup VPS — Fase BD (corre en el VPS como root)
# 1. Limpia un intento previo vacío (stack + volumen) y despliega SOLO postgres
# 2. Inyecta la password del postgres en el stack yaml
# 3. Espera a que esté healthy
# 4. Dump de Neon → restore en el postgres del stack
# ═══════════════════════════════════════════════════════════
set -euo pipefail
cd /root/volkern-erp

# ── 0. Limpiar intento previo (BD vacía: solo se creó el cluster, sin datos) ──
docker stack rm volkern-erp >/dev/null 2>&1 || true
sleep 8
# Swarm prefija los volúmenes con el nombre del stack
for v in volkern_erp_postgres_data volkern-erp_volkern_erp_postgres_data; do
  docker volume rm "$v" >/dev/null 2>&1 || true
done
echo "0. Stack/volumen previos limpios"

# ── 1. Password desde el .env (sin imprimirla) ──
DB_PASS=$(grep -E '^DATABASE_URL=' .env | sed -E 's#.*volkern_erp:([^@]*)@.*#\1#')
[ -n "$DB_PASS" ] || { echo "No se pudo extraer la password"; exit 1; }

sed -i "s/__DB_PASS__/${DB_PASS}/" volkern-erp.yaml
echo "1. yaml con password inyectada (${#DB_PASS} chars)"

# ── 2. YAML solo-postgres para la primera fase ──
cat > postgres-only.yaml <<'EOF'
version: "3.8"
services:
  postgres:
    image: postgres:17-alpine
    volumes:
      - volkern_erp_postgres_data:/var/lib/postgresql/data
    networks:
      - DXnet
    environment:
      POSTGRES_USER: volkern_erp
      POSTGRES_PASSWORD: __DB_PASS__
      POSTGRES_DB: volkern_erp
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          memory: 768M
      restart_policy:
        condition: any
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U volkern_erp -d volkern_erp"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
volumes:
  volkern_erp_postgres_data:
networks:
  DXnet:
    external: true
EOF
sed -i "s/__DB_PASS__/${DB_PASS}/" postgres-only.yaml

echo "2. Desplegando stack volkern-erp (solo postgres)..."
docker stack deploy -c postgres-only.yaml volkern-erp

# ── 3. Esperar healthy ──
echo "3. Esperando a que postgres esté healthy..."
for i in $(seq 1 60); do
  ST=$(docker ps --filter name=volkern-erp_postgres --format '{{.Status}}' | head -1)
  case "$ST" in
    *healthy*) echo "   ✓ postgres healthy (intento $i)"; break;;
    *) sleep 5;;
  esac
  [ $i -eq 60 ] && { echo "   ✗ postgres no quedó healthy: $ST"; exit 1; }
done

# ── 4. Dump de Neon → restore ──
echo "4. Dump de Neon (cliente 17, sin owners/privilegios)..."
NEON_URL=$(grep -E '^DATABASE_URL=' .env.neon | cut -d'"' -f2)
docker run --rm -v /root/volkern-erp:/dump postgres:17-alpine \
  pg_dump --no-owner --no-privileges "$NEON_URL" -f /dump/neon_dump.sql 2>/tmp/pgdump.err
if [ ! -s /root/volkern-erp/neon_dump.sql ]; then
  echo "   ✗ pg_dump falló:"; tail -5 /tmp/pgdump.err; exit 1
fi
echo "   ✓ dump: $(du -h /root/volkern-erp/neon_dump.sql | cut -f1)"

echo "5. Restore en el postgres del stack..."
PG=$(docker ps -q --filter name=volkern-erp_postgres | head -1)
# Reiniciar esquema (por si hubo un restore parcial previo)
docker exec "$PG" psql -U volkern_erp -d volkern_erp -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null 2>&1 || true
docker exec -i "$PG" psql -U volkern_erp -d volkern_erp -v ON_ERROR_STOP=1 < /root/volkern-erp/neon_dump.sql 2>/tmp/psql.err || { echo "   ✗ restore falló:"; tail -10 /tmp/psql.err; exit 1; }
echo "   ✓ restore completado"

echo "6. Verificación rápida (tablas y tamaño):"
docker exec "$PG" psql -U volkern_erp -d volkern_erp -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
docker exec "$PG" psql -U volkern_erp -d volkern_erp -tAc "SELECT pg_size_pretty(pg_database_size('volkern_erp'));"
echo "FASE BD COMPLETADA"
