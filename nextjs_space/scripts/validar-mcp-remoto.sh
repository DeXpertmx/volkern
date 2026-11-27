#!/usr/bin/env bash
#
# Fase 4 — validación del MCP remoto con API Keys individuales.
#
# Comprueba autenticación, scopes, permisos reales y aislamiento entre dos
# tenants contra un entorno de staging/local. NO despliega nada y se niega a
# ejecutarse contra un host que no sea loopback salvo confirmación explícita.
#
# Uso:
#   BASE_URL=https://staging.example.com \
#   KEY_A=vk_test_... KEY_B=vk_test_... TENANT_B=<id-empresa-B> \
#   bash scripts/validar-mcp-remoto.sh
#
# Opcionales:
#   KEY_A_READONLY   clave de A con solo mcp:read
#   KEY_A_SALES      clave de A con rol comercial (Sales Agent)
#   CON_EFFECTOS=1   crea solicitudes de aprobación (filas en staging)
#   CONFIRMO_NO_PRODUCCION=1  obligatorio si BASE_URL no es loopback
#
# Solo requiere curl y python3.
#
set -uo pipefail

BASE_URL="${BASE_URL:-}"
KEY_A="${KEY_A:-}"
KEY_B="${KEY_B:-}"
TENANT_B="${TENANT_B:-}"
KEY_A_READONLY="${KEY_A_READONLY:-}"
KEY_A_SALES="${KEY_A_SALES:-}"
CON_EFFECTOS="${CON_EFFECTOS:-0}"
CUERPO=/tmp/f4-body.json

FALLOS=0
OMITIDAS=0

if [ -z "$BASE_URL" ] || [ -z "$KEY_A" ] || [ -z "$KEY_B" ] || [ -z "$TENANT_B" ]; then
  echo "Faltan variables: BASE_URL, KEY_A, KEY_B y TENANT_B son obligatorias." >&2
  exit 2
fi

case "$BASE_URL" in
  http://127.0.0.1*|http://localhost*|http://\[::1\]*) ;;
  *)
    if [ "${CONFIRMO_NO_PRODUCCION:-}" != "1" ]; then
      echo "Rechazado: $BASE_URL no es loopback. Este checklist es para staging/local." >&2
      echo "Si de verdad es un entorno desechable, exporta CONFIRMO_NO_PRODUCCION=1." >&2
      exit 2
    fi
    ;;
esac

for bin in curl python3; do
  command -v "$bin" >/dev/null || { echo "Falta $bin" >&2; exit 2; }
done

echo "▶ Objetivo: $BASE_URL"
echo

# ── utilidades ──────────────────────────────────────────────────────────
estado() { # método | ruta | clave | cuerpo-json
  local args=(-sS -o "$CUERPO" -w '%{http_code}' -X "$1")
  [ -n "${3:-}" ] && args+=(-H "Authorization: Bearer $3")
  args+=(-H 'Content-Type: application/json')
  [ -n "${4:-}" ] && args+=(-d "$4")
  curl "${args[@]}" "$BASE_URL$2"
}

# campo 'a.b.c' del último cuerpo; vacío si no existe
campo() {
  python3 - "$1" <<'PY'
import json, sys
try:
    d = json.load(open('/tmp/f4-body.json'))
except Exception:
    print(''); sys.exit()
for parte in sys.argv[1].split('.'):
    if isinstance(d, dict) and parte in d:
        d = d[parte]
    else:
        d = None
        break
print('' if d is None else d)
PY
}

ids_de() { # lista de ids de una clave del último cuerpo
  python3 - "$1" <<'PY'
import json, sys
try:
    d = json.load(open('/tmp/f4-body.json'))
except Exception:
    sys.exit()
for fila in (d.get(sys.argv[1]) or []):
    print(fila.get('id'))
PY
}

comprobar() { # descripción | esperado | real
  if [ "$2" = "$3" ]; then
    echo "  OK    $1"
  else
    echo "  FALLO $1 → esperado [$2], obtenido [$3]"
    FALLOS=$((FALLOS + 1))
  fi
}

omitir() { echo "  OMIT  $1"; OMITIDAS=$((OMITIDAS + 1)); }

# ── 1. Autenticación ────────────────────────────────────────────────────
echo "▶ Autenticación"
comprobar "GET /api/mcp sin clave → 401" 401 "$(estado GET /api/mcp '')"
comprobar "GET /api/mcp con clave inválida → 401" 401 "$(estado GET /api/mcp 'vk_invalida_000')"
comprobar "GET /api/mcp con clave de A → 200" 200 "$(estado GET /api/mcp "$KEY_A")"
comprobar "GET devuelve success:true" True "$(campo success)"

comprobar "POST /mcp initialize sin clave → 200 (metadatos públicos)" 200 \
  "$(estado POST /mcp '' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}')"
comprobar "initialize negocia protocolVersion" 2025-03-26 "$(campo result.protocolVersion)"

comprobar "POST /mcp tools/call sin clave → 401" 401 \
  "$(estado POST /mcp '' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"volkern_list_contacts","arguments":{}}}')"
comprobar "error JSON-RPC de credencial" -32000 "$(campo error.code)"

# ── 2. Scopes ───────────────────────────────────────────────────────────
echo "▶ Scopes"
if [ -n "$KEY_A_READONLY" ]; then
  comprobar "clave solo-lectura puede listar (GET) → 200" 200 "$(estado GET /api/mcp "$KEY_A_READONLY")"
  comprobar "clave solo-lectura NO puede ejecutar (POST) → 401" 401 \
    "$(estado POST /api/mcp "$KEY_A_READONLY" '{"jsonrpc":"2.0","id":3,"method":"tools/list"}')"
else
  omitir "scopes: falta KEY_A_READONLY"
fi

# ── 3. Permisos reales por rol ──────────────────────────────────────────
echo "▶ Permisos por rol"
comprobar "lectura permitida a la clave de A → 200" 200 \
  "$(estado POST /mcp "$KEY_A" '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"volkern_list_contacts","arguments":{"limit":1}}}')"
if [ -n "$KEY_A_SALES" ]; then
  comprobar "comercial no puede borrar un contacto → 403" 403 \
    "$(estado POST /mcp "$KEY_A_SALES" '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"contactId":"no-existe"}}}')"
  comprobar "comercial no ve la bandeja de aprobaciones → 403" 403 \
    "$(estado GET /api/mcp/approvals "$KEY_A_SALES")"
else
  omitir "rol comercial: falta KEY_A_SALES"
fi

# ── 4. Identidad inyectada ──────────────────────────────────────────────
echo "▶ Identidad"
comprobar "tenantId del cuerpo distinto al de la clave → 403" 403 \
  "$(estado POST /mcp "$KEY_A" "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_list_contacts\",\"arguments\":{\"tenantId\":\"$TENANT_B\"}}}")"
comprobar "error de identidad -32001" -32001 "$(campo error.code)"

# ── 5. Aislamiento entre tenants ────────────────────────────────────────
echo "▶ Aislamiento"
comprobar "bandeja de A → 200" 200 "$(estado GET /api/mcp/approvals "$KEY_A")"
ids_de approvals | sort > /tmp/f4-ids-a
comprobar "bandeja de B → 200" 200 "$(estado GET /api/mcp/approvals "$KEY_B")"
ids_de approvals | sort > /tmp/f4-ids-b

comunes=$(comm -12 /tmp/f4-ids-a /tmp/f4-ids-b | wc -l | tr -d ' ')
comprobar "ninguna solicitud aparece en las dos bandejas" 0 "$comunes"

comprobar "envíos inciertos de A → 200" 200 "$(estado GET /api/mcp/approvals/entregas "$KEY_A")"
ids_de envios | sort > /tmp/f4-env-a
comprobar "envíos inciertos de B → 200" 200 "$(estado GET /api/mcp/approvals/entregas "$KEY_B")"
ids_de envios | sort > /tmp/f4-env-b
comunes=$(comm -12 /tmp/f4-env-a /tmp/f4-env-b | wc -l | tr -d ' ')
comprobar "ningún envío aparece en las dos bandejas" 0 "$comunes"

# ── 6. operationId y reserva (crea filas: usar en staging) ──────────────
if [ "$CON_EFFECTOS" = "1" ]; then
  echo "▶ operationId y reserva por contenido (crea solicitudes)"

  a1=$(estado POST /mcp "$KEY_A" '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"contactId":"fase4-inexistente","operationId":"fase4-op-1"}}}')
  ap_a1=$(campo error.data.approvalId)
  comprobar "A crea una solicitud pendiente → 409" 409 "$a1"
  comprobar "A recibe approvalId" si "$([ -n "$ap_a1" ] && echo si || echo no)"

  estado POST /mcp "$KEY_A" '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"contactId":"fase4-inexistente","operationId":"fase4-op-1"}}}' >/dev/null
  comprobar "el mismo operationId reutiliza la solicitud" "$ap_a1" "$(campo error.data.approvalId)"

  estado POST /mcp "$KEY_B" '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"contactId":"fase4-inexistente","operationId":"fase4-op-1"}}}' >/dev/null
  ap_b=$(campo error.data.approvalId)
  comprobar "B usa el mismo operationId sin heredar el de A" si \
    "$([ -n "$ap_b" ] && [ "$ap_b" != "$ap_a1" ] && echo si || echo no)"

  LARGO=$(printf 'x%.0s' $(seq 1 201))
  largo_body="{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_delete_contact\",\"arguments\":{\"contactId\":\"fase4-otro\",\"operationId\":\"$LARGO\"}}}"
  comprobar "operationId de 201 caracteres → 403" 403 "$(estado POST /mcp "$KEY_B" "$largo_body")"
  comprobar "el motivo menciona el límite" si "$(grep -q '200' "$CUERPO" && echo si || echo no)"

  if [ -n "$ap_a1" ]; then
    comprobar "B no puede resolver una solicitud de A → 404" 404 \
      "$(estado POST "/api/mcp/approvals/$ap_a1" "$KEY_B" '{"action":"approve"}')"
  fi
else
  omitir "operationId y reserva: exporta CON_EFFECTOS=1 (crea filas en staging)"
fi

echo
if [ "$FALLOS" -eq 0 ]; then
  echo "✅ Fase 4: $([ "$CON_EFFECTOS" = "1" ] && echo "con" || echo "sin") efectos, ${OMITIDAS} omitidas, 0 fallos"
else
  echo "❌ ${FALLOS} comprobaciones fallidas (${OMITIDAS} omitidas)"
  exit 1
fi
