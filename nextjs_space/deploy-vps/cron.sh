#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Cron VPS — Volkern ERP
# Uso:  cron.sh <job>   (uptime-developers | cleanup-attendance | hospitality-reconcile)
# Crontab:
#   0 0 * * * bash /root/volkern-erp/cron.sh uptime-developers
#   0 3 * * * bash /root/volkern-erp/cron.sh cleanup-attendance
#   0 4 * * * bash /root/volkern-erp/cron.sh hospitality-reconcile
# ═══════════════════════════════════════════════════════════
set -uo pipefail
JOB="${1:?uso: cron.sh <uptime-developers|cleanup-attendance|hospitality-reconcile>}"
LOG=/var/log/volkern-cron.log

# Cargar CRON_SECRET y NEXT_PUBLIC_APP_URL del .env del stack
export $(grep -E '^(CRON_SECRET|NEXT_PUBLIC_APP_URL)=' /root/volkern-erp/.env | xargs -d '\n' 2>/dev/null) || true
CRON_SECRET="${CRON_SECRET:-}"
BASE="${NEXT_PUBLIC_APP_URL:-https://erp.dimension.expert}"

CODE=$(curl -s -o /tmp/volkern-cron-${JOB}.out -w '%{http_code}' \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  --max-time 120 \
  "${BASE}/api/cron/${JOB}")

if [ "$CODE" = "200" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M')] ${JOB} OK (200)" >> "$LOG"
else
  echo "[$(date '+%Y-%m-%d %H:%M')] ${JOB} FALLÓ (${CODE}): $(head -c 300 /tmp/volkern-cron-${JOB}.out 2>/dev/null)" >> "$LOG"
fi
