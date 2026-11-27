# Fase 4 — MCP remoto con ChatGPT y API Keys individuales

Objetivo: comprobar con credenciales reales que cada clave ejecuta solo lo que
su rol permite y que dos empresas no se ven entre sí. Todo se ejecuta contra un
entorno **desechable** (local o staging). Este documento no despliega nada.

Herramientas: `curl` para los comandos de abajo (usan `jq` para abreviar la
salida) y `python3` para el script, que no depende de `jq`.

## 0. Preparación

- [ ] Dos empresas de prueba: **A** y **B**.
- [ ] En A: un usuario **owner** (`admin-a@…`), un **comercial** (`sales-a@…`) y
      un contacto cualquiera.
- [ ] En B: un usuario **owner** (`admin-b@…`).
- [ ] Cuatro claves, creadas desde **Configuración → API Keys** (o
      `POST /api/api-keys` con sesión). La clave completa se muestra una sola vez:
      guárdala en `.env.fase4` (no versionado), nunca en el chat ni en logs.

| Variable | Empresa | Usuario | Scopes |
|---|---|---|---|
| `KEY_A` | A | owner | `mcp:read`, `mcp:execute`, `mcp:admin` |
| `KEY_A_READONLY` | A | owner | `mcp:read` |
| `KEY_A_SALES` | A | comercial | `mcp:read`, `mcp:execute` |
| `KEY_B` | B | owner | `mcp:read`, `mcp:execute`, `mcp:admin` |

- [ ] `TENANT_B` = id de la empresa B (visible en la URL de su panel o en la
      respuesta de `GET /api/mcp`, campo `_meta.tenantId`).
- [ ] Para ChatGPT, el entorno debe ser **HTTPS público**; ChatGPT no alcanza
      `localhost`. El resto de comprobaciones se pueden hacer contra localhost.

## 1. Autenticación

```bash
B=https://staging.example.com

curl -sS -o /dev/null -w '%{http_code}\n' "$B/api/mcp"
# 401  {"error":"No autorizado","details":"..."}

curl -sS -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer vk_invalida_000' "$B/api/mcp"
# 401

curl -sS -H "Authorization: Bearer $KEY_A" "$B/api/mcp" | jq '.success, ._meta.tenantId'
# true, "<tenant-A>"

curl -sS -X POST "$B/mcp" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}' \
  | jq '.result.protocolVersion'
# "2025-03-26"   (initialize y tools/list son públicos)

curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"volkern_list_contacts","arguments":{}}}'
# 401 y error.code -32000
```

## 2. Scopes

```bash
# Solo lectura: puede consultar, no ejecutar.
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY_A_READONLY" "$B/api/mcp"
# 200
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/api/mcp" \
  -H "Authorization: Bearer $KEY_A_READONLY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}'
# 401: POST /api/mcp exige mcp:execute
```

## 3. Permisos reales por rol

```bash
# El comercial puede leer…
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A_SALES" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"volkern_list_contacts","arguments":{"limit":1}}}'
# 200

# …pero no borrar (la matriz lo deniega, no lo convierte en aprobación).
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A_SALES" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"id":"no-existe"}}}'
# 403, error.code -32003

# Y no ve la bandeja de aprobaciones.
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY_A_SALES" "$B/api/mcp/approvals"
# 403
```

Autoaprobación: con `KEY_A` crea una solicitud (`volkern_delete_contact`) y
resuélvela con la misma credencial; debe devolver **403** «Quien solicita la
acción no puede aprobarla». La aprobación correcta necesita otro owner/admin de
A.

## 4. Identidad: no se acepta del cuerpo

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_list_contacts\",\"arguments\":{\"tenantId\":\"$TENANT_B\"}}}"
# 403, error.code -32001 "tenantId no coincide con la credencial autenticada…"
```

## 5. Aislamiento entre A y B

```bash
jq -r '.approvals[].id' <(curl -sS -H "Authorization: Bearer $KEY_A" "$B/api/mcp/approvals") | sort > /tmp/ids-a
jq -r '.approvals[].id' <(curl -sS -H "Authorization: Bearer $KEY_B" "$B/api/mcp/approvals") | sort > /tmp/ids-b
comm -12 /tmp/ids-a /tmp/ids-b    # debe quedar vacío

# Resolver con B una solicitud de A:
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/api/mcp/approvals/<id-de-A>" \
  -H "Authorization: Bearer $KEY_B" -H 'Content-Type: application/json' -d '{"action":"approve"}'
# 404
```

Repite con `/api/mcp/approvals/entregas`: los `id` de A y B no pueden cruzarse.
Todo esto lo automatiza `scripts/validar-mcp-remoto.sh`.

## 6. operationId y reserva por contenido

```bash
OP=fase4-op-1
# A pide una acción destructiva con el mismo id dos veces.
for i in 1 2; do
  curl -sS -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_delete_contact\",\"arguments\":{\"id\":\"fase4-inexistente\",\"operationId\":\"$OP\"}}}" \
    | jq -r '.error.data.approvalId'
done
# Dos veces el MISMO approvalId

# B usa el mismo id: approvalId distinto.
curl -sS -X POST "$B/mcp" -H "Authorization: Bearer $KEY_B" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_delete_contact\",\"arguments\":{\"id\":\"fase4-inexistente\",\"operationId\":\"$OP\"}}}" \
  | jq -r '.error.data.approvalId'

# Sin operationId, dos llamadas idénticas del mismo usuario reutilizan la solicitud;
# las de otro usuario, no.
# Un operationId de 201 caracteres: 403 con «no puede superar 200 caracteres».
```

## 7. ChatGPT

- [ ] **Conector A**: URL `https://<staging>/mcp`, autenticación por cabecera
      `Authorization: Bearer <KEY_A>` (si tu versión de ChatGPT no permite
      cabeceras, usa su opción de API key; no pegues la clave en el prompt).
- [ ] Al conectar, ChatGPT descubre el catálogo de tools (`tools/list`).
- [ ] «Lista mis contactos» → devuelve **solo** datos de A.
- [ ] Pídele un envío de WhatsApp: debe responder con `status: pending`, el
      `approvalId` y el enlace de verificación. **No se envía nada** hasta
      introducir el código.
- [ ] Intenta forzar `tenantId` de B en los argumentos de una tool → error 403
      (el modelo puede negarse; valida el caso con `curl`, sección 4).
- [ ] **Conector B** con `KEY_B`: «lista mis contactos» no debe mostrar ningún
      contacto de A, y una búsqueda por un nombre exclusivo de A devuelve vacío.
- [ ] Dos conversaciones simultáneas (A y B): el mismo `operationId` no comparte
      `approvalId` ni desenlace.

## 8. Evidencia

| Caso | Esperado | Obtenido | OK |
|---|---|---|---|
| Sin clave / clave inválida | 401 | | |
| Solo lectura ejecutando | 401 | | |
| Comercial borrando | 403 | | |
| Identidad inyectada | 403 `-32001` | | |
| Bandejas disjuntas | 0 ids comunes | | |
| Solicitud de A resuelta por B | 404 | | |
| Mismo `operationId` en A | mismo id | | |
| Mismo `operationId` en B | id distinto | | |
| 201 caracteres | 403 «200» | | |
| Envío sin código | `pending` | | |

## 9. Limpieza

- [ ] Revocar las cuatro claves desde Configuración → API Keys.
- [ ] Borrar las solicitudes creadas por la prueba (`CON_EFFECTOS=1`) por sus
      ids, no por patrón:
      `DELETE FROM "mcp_approval_requests" WHERE id IN ('…','…');`
- [ ] No ejecutar nada de esto contra producción: el script se niega si la URL
      no es loopback salvo `CONFIRMO_NO_PRODUCCION=1`.

## 10. Criterio de aceptación

- `scripts/validar-mcp-remoto.sh` termina con **0 fallos**.
- Ningún caso cruzado devuelve datos: ni listas, ni aprobaciones, ni envíos.
- Ninguna llamada desde ChatGPT ejecuta un envío externo sin código.
- Un mismo `operationId` no produce dos solicitudes ni dos desenlaces.

## Nota

`POST /api/mcp` exige `mcp:execute` incluso para `tools/list`; es la superficie
pensada para ejecutar. Para descubrir tools con una clave de solo lectura, usa
`GET /api/mcp`.
