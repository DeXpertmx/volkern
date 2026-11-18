#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Actualiza GOOGLE_CLIENT_SECRET del servicio volkern-erp_app.
#
# Por qué existe
# --------------
# El consentimiento de Google solo valida el `client_id`: con un client_id
# correcto la pantalla de permisos se muestra aunque el secreto sea viejo. El
# intercambio del `code` sí exige el secreto vigente, y Google responde
#   invalid_client: The provided client secret is invalid.
# Este script comprueba el par ANTES de tocar nada, guarda el secreto en
# /root/volkern-erp/.env y aplica el cambio al servicio.
#
# Uso (en el VPS, como root)
# --------------------------
#   bash /root/deploy-vps/actualizar-google-secret.sh            # pide el secreto (no se muestra)
#   bash /root/deploy-vps/actualizar-google-secret.sh --check    # solo valida el actual
#   bash /root/deploy-vps/actualizar-google-secret.sh --file /ruta/secreto.txt
#
# El secreto se copia de Google Cloud → APIs & Services → Credentials → tu
# OAuth 2.0 Client ID → Client secret (o "Reset secret" y usa el nuevo).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="${ENV_FILE:-/root/volkern-erp/.env}"
SERVICE="${SERVICE:-volkern-erp_app}"

MODO="aplicar"
ARCHIVO=""
case "${1:-}" in
  --check) MODO="check" ;;
  --file) MODO="archivo"; ARCHIVO="${2:-}" ;;
  "") ;;
  *) echo "Uso: $0 [--check | --file /ruta/secreto.txt]" >&2; exit 2 ;;
esac

[ -f "$ENV_FILE" ] || { echo "✗ No existe $ENV_FILE" >&2; exit 1; }

leer_env() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

CLIENT_ID="$(leer_env GOOGLE_CLIENT_ID)"
[ -n "$CLIENT_ID" ] || { echo "✗ Falta GOOGLE_CLIENT_ID en $ENV_FILE" >&2; exit 1; }

# Comprueba el par contra el endpoint de tokens de Google usando un refresh
# token de prueba. Si el par es válido, Google responde invalid_grant (el token
# es lo inválido); si el par no lo es, responde invalid_client.
validar_par() {
  local secreto="$1" respuesta error descripcion
  respuesta="$(curl -s -m 25 -X POST https://oauth2.googleapis.com/token \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=refresh_token' \
    --data-urlencode 'refresh_token=validacion-volkern' \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "client_secret=$secreto")" || {
      echo "✗ No se pudo contactar con Google (revisa la red del VPS)." >&2
      return 1
    }

  error="$(printf '%s' "$respuesta" | sed -n 's/.*"error"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  descripcion="$(printf '%s' "$respuesta" | sed -n 's/.*"error_description"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

  case "$error" in
    invalid_grant)
      return 0 ;;
    invalid_client|unauthorized_client|invalid_request)
      echo "✗ Google rechaza el par client_id/secreto: ${error}${descripcion:+ — $descripcion}" >&2
      return 1 ;;
    "")
      echo "✗ Respuesta inesperada de Google: $respuesta" >&2
      return 1 ;;
    *)
      echo "✗ Google respondió $error${descripcion:+ — $descripcion}" >&2
      return 1 ;;
  esac
}

if [ "$MODO" = "check" ]; then
  actual="$(leer_env GOOGLE_CLIENT_SECRET)"
  [ -n "$actual" ] || { echo "✗ Falta GOOGLE_CLIENT_SECRET en $ENV_FILE" >&2; exit 1; }
  if validar_par "$actual"; then
    echo "✓ El par GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET actual es válido."
    exit 0
  fi
  echo "✗ El secreto configurado no corresponde al client_id. Actualízalo con este script." >&2
  exit 1
fi

if [ "$MODO" = "archivo" ]; then
  [ -n "$ARCHIVO" ] && [ -f "$ARCHIVO" ] || { echo "✗ No existe el archivo $ARCHIVO" >&2; exit 1; }
  NUEVO_SECRET="$(head -1 "$ARCHIVO" | tr -d '\r' | sed -e 's/[[:space:]]*$//')"
else
  printf 'Pega el Client secret de Google Cloud (no se mostrará): '
  read -rsp '' NUEVO_SECRET
  printf '\n'
fi

[ -n "${NUEVO_SECRET:-}" ] || { echo "✗ El secreto está vacío." >&2; exit 1; }

if ! validar_par "$NUEVO_SECRET"; then
  unset NUEVO_SECRET
  echo "" >&2
  echo "No se modificó nada. Copia el valor EXACTO que muestra Google Cloud" >&2
  echo "→ APIs & Services → Credentials → tu OAuth 2.0 Client ID → Client secret." >&2
  echo "Si no lo tienes, pulsa «Reset secret», copia el nuevo y vuelve a ejecutar." >&2
  exit 1
fi

# Respaldo y actualización atómica de la línea del secreto.
cp -a "$ENV_FILE" "${ENV_FILE}.bak-$(date +%Y%m%d%H%M%S)"
tmp="$(mktemp)"
GOOGLE_SECRET_NUEVO="$NUEVO_SECRET" awk '
  BEGIN { s = ENVIRON["GOOGLE_SECRET_NUEVO"]; hecho = 0 }
  /^GOOGLE_CLIENT_SECRET=/ { print "GOOGLE_CLIENT_SECRET=" s; hecho = 1; next }
  { print }
  END { if (!hecho) print "GOOGLE_CLIENT_SECRET=" s }
' "$ENV_FILE" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$ENV_FILE"

echo "✓ Secreto válido y guardado en $ENV_FILE"

# Aplicar al servicio en marcha (mantiene el resto del stack intacto).
docker service update --env-add "GOOGLE_CLIENT_SECRET=$NUEVO_SECRET" "$SERVICE" >/dev/null
unset NUEVO_SECRET
echo "✓ Servicio $SERVICE actualizado; esperando a que converja..."

CONVERGIDO=0
for _ in $(seq 1 60); do
  estado="$(docker service ps "$SERVICE" --filter desired-state=running --format '{{.CurrentState}}' 2>/dev/null | head -1)"
  case "$estado" in
    Running*) echo "✓ Servicio en marcha ($estado)"; CONVERGIDO=1; break ;;
  esac
  sleep 2
done

# El secreto ya está en el .env: si no converge, se avisa con código de error
# para que nadie dé el cambio por bueno leyendo la salida.
if [ "$CONVERGIDO" != "1" ]; then
  echo "✗ El servicio $SERVICE no llegó a Running en 2 minutos. Revisa: docker service ps $SERVICE" >&2
  exit 1
fi

echo ""
echo "Siguiente paso: en la app abre Citas → «Conectar Google Calendar»."
echo "Verificación rápida: bash $0 --check"
