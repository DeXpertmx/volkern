#!/usr/bin/env bash
# =============================================================================
# dns-aid.sh — Publica los registros DNS for AI Discovery (DNS-AID) de Volkern
# en Cloudflare bajo _agents.volkern.app (draft-mozleywilliams-dnsop-dnsaid).
#
# Uso:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... bash deploy-vps/dns-aid.sh
#
# También lee CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID desde el .env del repo
# o del entorno. Es idempotente: si el registro ya existe, no lo duplica.
#
# Nota (2026-08-21): el schema de Cloudflare exige data.value como STRING en
# formato wire ("alpn=\"h2\" port=443"), no como objeto JSON. Si se manda un
# objeto, el API responde 9012 "Value for SVCB record is invalid".
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Config ──────────────────────────────────────────────────────────────────
ROOT_DOMAIN="${ROOT_DOMAIN:-volkern.app}"
TARGET="volkern.app"
IPV4="${IPV4:-62.171.134.195}"
TTL=300

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -f "$REPO_ROOT/.env" ]]; then
  # Extraer solo las variables de Cloudflare (no hacer source del .env completo,
  # sus valores con espacios romperían el shell)
  CLOUDFLARE_API_TOKEN="$(grep -E '^CLOUDFLARE_API_TOKEN=' "$REPO_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  CLOUDFLARE_ZONE_ID="$(grep -E '^CLOUDFLARE_ZONE_ID=' "$REPO_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "❌ CLOUDFLARE_API_TOKEN no está definido (ni en .env ni en el entorno)." >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
if [[ -z "$ZONE_ID" ]]; then
  echo "🔎 Buscando zone_id de $ROOT_DOMAIN…"
  ZONE_ID="$(curl -s -X GET "$API/zones?name=$ROOT_DOMAIN" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["result"][0]["id"] if d.get("result") else "")')"
fi
if [[ -z "$ZONE_ID" ]]; then
  echo "❌ No se encontró la zona $ROOT_DOMAIN con el token dado." >&2
  exit 1
fi
echo "✅ Zona: $ROOT_DOMAIN ($ZONE_ID)"

# ── Registros ───────────────────────────────────────────────────────────────
# Cada entrada: nombre | tipo | value (wire format para SVCB, content para TXT)
declare -a RECORDS

# Índice organizacional (use case 2 del draft) — el punto de entrada well-known
RECORDS+=("_index._agents.$ROOT_DOMAIN|SVCB|alpn=\"h2,http/1.1\" port=443 ipv4hint=\"$IPV4\"")

# Agente A2A (use case 1) — alpn a2a sobre HTTPS
RECORDS+=("_a2a._agents.$ROOT_DOMAIN|SVCB|alpn=\"a2a,h2\" port=443 ipv4hint=\"$IPV4\"")

# Agente MCP — alpn mcp sobre HTTPS (endpoint real /mcp)
RECORDS+=("_mcp._agents.$ROOT_DOMAIN|SVCB|alpn=\"mcp,h2\" port=443 ipv4hint=\"$IPV4\"")

# Fallback TXT del índice (Sección 4 del draft)
RECORDS+=("_index._agents.$ROOT_DOMAIN|TXT|v=DNSAID1 index=/.well-known/agent-card.json")

created=0
skipped=0

for entry in "${RECORDS[@]}"; do
  IFS='|' read -r name type value <<< "$entry"

  # ¿Ya existe? (lista por nombre y tipo)
  existing="$(curl -s -X GET "$API/zones/$ZONE_ID/dns_records?type=$type&name=$name" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"
  count="$(python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("result",[])))' <<< "$existing")"

  if [[ "$count" -gt 0 ]]; then
    echo "⏭️  $type $name ya existe ($count registro(s)) — omitido"
    skipped=$((skipped+1))
    continue
  fi

  if [[ "$type" == "TXT" ]]; then
    body="{\"type\":\"$type\",\"name\":\"$name\",\"content\":\"$value\",\"ttl\":$TTL}"
  else
    body="{\"type\":\"$type\",\"name\":\"$name\",\"data\":{\"priority\":1,\"target\":\"$TARGET\",\"value\":\"$value\"},\"ttl\":$TTL}"
  fi

  echo "➕ Creando $type $name …"
  resp="$(curl -s -X POST "$API/zones/$ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")"
  ok="$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("success",False))' <<< "$resp")"
  if [[ "$ok" == "True" ]]; then
    created=$((created+1))
    echo "   ✅ creado"
  else
    err="$(python3 -c 'import sys,json; d=json.load(sys.stdin); print("; ".join(e.get("message","") for e in d.get("errors",[])))' <<< "$resp")"
    echo "   ❌ error: $err" >&2
  fi
done

echo ""
echo "──────────────────────────────────────────────────────────────"
echo "Creados: $created · Omitidos (ya existían): $skipped"
echo ""
echo "Verificación (espera la propagación, normalmente < 1 min en Cloudflare):"
echo "  dig +short SVCB _index._agents.$ROOT_DOMAIN @1.1.1.1"
echo "  dig +short SVCB _a2a._agents.$ROOT_DOMAIN @1.1.1.1"
echo "  dig +short SVCB _mcp._agents.$ROOT_DOMAIN @1.1.1.1"
echo "  dig +short TXT _index._agents.$ROOT_DOMAIN @1.1.1.1"
echo ""
echo "Luego valida:"
echo '  curl -s -X POST https://isitagentready.com/api/scan -H "Content-Type: application/json" -d '\''{"url": "https://volkern.app"}'\'''
