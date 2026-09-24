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
  touch "$MARCA"
  exit 1
fi

rm -f "$MARCA"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [legado] en reposo: sin rastro del stack heredado en crons"
exit 0
