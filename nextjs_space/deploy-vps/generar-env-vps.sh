#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Genera .env.vps a partir de .env.production.local
# Adapta: DATABASE_URL → postgres del stack, REDIS_URL → redis del VPS,
#         NEXT_PUBLIC_APP_URL → erp.dimension.expert, CRON_SECRET nuevo
# Los uploads siguen en AWS S3 (sin cambios) para no romper CDN.
# ═══════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=.env.production.local
OUT=deploy-vps/.env.vps

[ -f "$SRC" ] || { echo "No existe $SRC"; exit 1; }

# Generar password del postgres y CRON_SECRET si no existen
DB_PASS=${VOLKERN_DB_PASS:-$(openssl rand -hex 16)}
CRON_SECRET=${VOLKERN_CRON_SECRET:-$(openssl rand -hex 24)}
echo "DB_PASS generado: ${#DB_PASS} chars | CRON_SECRET: ${#CRON_SECRET} chars"

# Copiar base
cp "$SRC" "$OUT"

# Sobrescribir/insertar las variables clave (escapadas para sed)
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://volkern_erp:${DB_PASS}@volkern-erp_postgres:5432/volkern_erp\"|" "$OUT"
grep -q '^REDIS_URL=' "$OUT" && sed -i "s|^REDIS_URL=.*|REDIS_URL=\"redis://redis_redis:6379\"|" "$OUT" || echo 'REDIS_URL="redis://redis_redis:6379"' >> "$OUT"
sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=\"https://erp.dimension.expert\"|" "$OUT"
# Auth: NEXTAUTH_URL debe coincidir con el host real y cookie host-only (sin dominio fijo)
sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://erp.dimension.expert\"|" "$OUT"
grep -q '^AUTH_COOKIE_DOMAIN=' "$OUT" && sed -i "s|^AUTH_COOKIE_DOMAIN=.*|AUTH_COOKIE_DOMAIN=\"none\"|" "$OUT" || echo 'AUTH_COOKIE_DOMAIN="none"' >> "$OUT"
grep -q '^CRON_SECRET=' "$OUT" && sed -i "s|^CRON_SECRET=.*|CRON_SECRET=\"${CRON_SECRET}\"|" "$OUT" || echo "CRON_SECRET=\"${CRON_SECRET}\"" >> "$OUT"

# Docker env_file NO interpreta comillas (a diferencia de dotenv): quitarlas de todos los valores
sed -i 's/^\([A-Z_][A-Z_0-9]*\)="\(.*\)"$/\1=\2/' "$OUT"

# Guardar el password del postgres para el stack (archivo aparte, sin exponer)
printf '%s' "$DB_PASS" > deploy-vps/.db_pass
chmod 600 deploy-vps/.env.vps deploy-vps/.db_pass

echo "=== Claves resultantes en $OUT ==="
grep -oE '^[A-Z_]+=' "$OUT" | sed 's/=$//' | sort | tr '\n' ' '
echo
echo "=== Valores sensibles (solo longitud) ==="
grep -E "^(DATABASE_URL|REDIS_URL|NEXT_PUBLIC_APP_URL|CRON_SECRET|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|CHATWOOT_SUPER_ADMIN_TOKEN)=" "$OUT" | sed -E 's/^(.*)=.*/\1=<oculto>/'
echo "OK → $OUT"
