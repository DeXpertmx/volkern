#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# vigilar-crons-heredados.sh — centinela contra la reanimación del stack
# heredado volkern-table (docs/VPS-SEGURIDAD-PUERTOS.md §11).
#
# Alerta si:
#   - el crontab de root vuelve a citar /opt/volkern-table o volkern_table
#   - aparece cualquier fichero /etc/cron.d/*volkern* (los crons del ERP
#     viven en el crontab de root, NUNCA en /etc/cron.d)
#
# Señal de alerta: marcador /root/DERIVA-LEGADO + línea "[legado]" en el
# log compartido con el auditor. En reposo: borra el marcador y anota.
# Exit 0 en reposo, 1 si reanimado. Programa semanal:
#   /etc/cron.d/auditoria-superficie → 43 4 * * 0
# ═══════════════════════════════════════════════════════════════════
set -u

MARCA=/root/DERIVA-LEGADO
REANIMADO=0
DETALLE=''

# Aviso por Telegram via apprise (misma mecanica que auditar-superficie.sh:
# docker exec, las IPs overlay no son alcanzables desde el host). Un fallo
# de notificacion no altera el exit code del centinela.
avisar() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^apprise_apprise-api' || return 0
  local A URLS BODY
  A=$(docker ps --filter name=apprise_apprise-api --format '{{.Names}}' | head -1)
  URLS=$(sed -n 's#^tgram://\([^?]*\)$#tgram://\1/646107192#p' /var/lib/docker/volumes/apprise_apprise-data/_data/apprise.cfg 2>/dev/null) || return 0
  [ -z "$URLS" ] && return 0
  BODY=$(python3 - "$URLS" "$1" "$2" <<'PYAP'
import json, sys
print(json.dumps({"urls": sys.argv[1], "title": sys.argv[2], "body": sys.argv[3], "type": "warning"}))
PYAP
) || return 0
  docker exec "$A" curl -s -m 20 -X POST http://127.0.0.1:8000/notify -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
  return 0
}

CRON_ROOT=$(crontab -l 2>/dev/null || true)
if printf '%s\n' "$CRON_ROOT" | grep -qE 'volkern-table|volkern_table'; then
  REANIMADO=1
  DETALLE="$DETALLE crontab-root:$(printf '%s\n' "$CRON_ROOT" | grep -E 'volkern-table|volkern_table' | head -2 | tr '\n' ' ')"
fi

for f in /etc/cron.d/*volkern*; do
  [ -e "$f" ] || continue
  REANIMADO=1
  DETALLE="$DETALLE cron.d:$f"
done

if [ "$REANIMADO" -eq 1 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [legado] REANIMACION DETECTADA:$DETALLE"
  avisar "VPS centinela: CRON DEL LEGADO REANIMADO" "$DETALLE | hora: $(date -Is)"
  touch "$MARCA"
  exit 1
fi

if [ -f "$MARCA" ]; then
  avisar "VPS centinela: LEGADO EN REPOSO DE NUEVO" "La reanimacion previa ya no esta: crons del legado limpios. Hora: $(date -Is)"
fi
rm -f "$MARCA"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [legado] en reposo: sin rastro del stack heredado en crons"
exit 0
