# Procedimiento Fase 4 — MCP remoto con ChatGPT y API Keys individuales

Validar, con credenciales y datos reales de un entorno **desechable**, que el
MCP remoto de Volkern:

1. autentica cada petición con una API Key individual;
2. aplica los scopes y el rol de esa persona, no los del cliente;
3. mantiene separadas dos empresas, incluso ante un intento deliberado de
   cruzar la identidad;
4. no ejecuta envíos externos sin el código de verificación.

No se despliega nada en este procedimiento y no se toca producción.

| | |
|---|---|
| Duración estimada | 60–90 min (30–40 sin la parte de ChatGPT) |
| Entorno | staging o local con HTTPS público para ChatGPT |
| Responsables | quien opera (ejecuta comandos) y quien aprueba (segundo owner de A) |
| Evidencia | tabla del paso 8 + salida del script |
| Criterio de éxito | paso 9 completo, sin fallos abiertos |

## 0. Antes de empezar: qué debe existir

- [ ] Entorno de staging desechable con HTTPS público (ChatGPT no alcanza
      `localhost`; el resto del procedimiento sí funciona en local).
- [ ] Plan del tenant con acceso a API/MCP (`crmAllows(ent, 'api')`); si no,
      toda llamada devuelve 403 con el mensaje de mejora de plan.
- [ ] Empresa **A** con: un owner (`admin-a`), un comercial (`sales-a`), un
      segundo owner o admin (`aprobador-a`) y un contacto con un marcador único
      (`FASE4-A-<aleatorio>` en el nombre).
- [ ] Empresa **B** con un owner (`admin-b`) y un contacto con marcador propio
      (`FASE4-B-<aleatorio>`).
- [ ] Si se va a probar el envío real: WhatsApp del negocio conectado en A. Si
      no, el paso de envío se limita a comprobar que la tool responde con error
      tipado y no con un envío.
- [ ] `curl` y `python3` en la máquina que ejecuta; `jq` es opcional (solo para
      leer respuestas a mano).

**Puerta 0:** sin dos empresas y cuatro usuarios no se puede validar el
aislamiento; no improvises con dos usuarios de la misma empresa.

## 1. Crear las claves individuales

Desde **Configuración → API Keys** (o `POST /api/api-keys` con sesión). La
clave completa se muestra una sola vez.

| Variable | Empresa | Usuario | Scopes | Para qué |
|---|---|---|---|---|
| `KEY_A` | A | admin-a | `mcp:read`, `mcp:execute`, `mcp:admin` | operar y aprobar en A |
| `KEY_A_READONLY` | A | admin-a | `mcp:read` | probar scopes |
| `KEY_A_SALES` | A | sales-a | `mcp:read`, `mcp:execute` | probar rol comercial |
| `KEY_B` | B | admin-b | `mcp:read`, `mcp:execute`, `mcp:admin` | aislar B |

- [ ] Guarda las cuatro en `.env.fase4` (no versionado). Nunca en el chat, en un
      ticket ni en una captura.
- [ ] Anota `TENANT_B` (id de la empresa B) para el intento de cruce.
- [ ] Comprueba que cada clave empieza por `vk_` y que no está revocada.

**Puerta 1:** si alguna clave no autentica en el paso 2, no sigas: el resto de
pruebas heredarían el mismo 401.

## 2. Protocolo y autenticación

```bash
B=https://staging.example.com
set -a; . ./.env.fase4; set +a

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
# 401 con error.code -32000
```

**Puerta 2:** las cinco respuestas deben coincidir. Un 200 sin clave indica que
la autenticación no está protegiendo `tools/call`: detén la validación.

## 3. Scopes

```bash
# Solo lectura: consulta, no ejecuta.
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY_A_READONLY" "$B/api/mcp"
# 200
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/api/mcp" \
  -H "Authorization: Bearer $KEY_A_READONLY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}'
# 401: POST /api/mcp exige mcp:execute
```

Nota: `POST /api/mcp` exige `mcp:execute` incluso para `tools/list`; para
descubrir tools con una clave de solo lectura se usa `GET /api/mcp`.

**Puerta 3:** una clave de solo lectura que ejecute algo invalida el modelo de
scopes; no continúes hasta corregirlo.

## 4. Permisos reales por rol

```bash
# El comercial puede leer…
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A_SALES" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"volkern_list_contacts","arguments":{"limit":1}}}'
# 200

# …pero no borrar: la matriz lo deniega (no lo convierte en aprobación).
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A_SALES" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"contactId":"no-existe"}}}'
# 403, error.code -32003

# Y no ve la bandeja de aprobaciones.
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY_A_SALES" "$B/api/mcp/approvals"
# 403
```

Autoaprobación y aprobación válida:

```bash
# Con KEY_A se crea una solicitud destructiva (409 con approvalId)…
# …y se intenta aprobar con la MISMA clave: 403 «Quien solicita la acción no puede aprobarla».
# Con la clave de aprobador-a (otro owner/admin de A) la misma solicitud se aprueba: 200.
```

- [ ] La autoaprobación queda registrada como intento, no como éxito.
- [ ] La aprobación por un segundo responsable ejecuta (o deja traza de
      ejecución) y cierra la solicitud.
- [ ] Un rechazo (`{"action":"reject","reason":"…"}`) deja la solicitud
      `rejected` y no ejecuta.

**Puerta 4:** si el comercial ejecuta una tool destructiva o la autoaprobación
prospera, es un fallo de permisos: para y repórtalo con el `approvalId`.

## 5. Identidad: nunca se acepta del cuerpo

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_list_contacts\",\"arguments\":{\"tenantId\":\"$TENANT_B\"}}}"
# 403, error.code -32001 «tenantId no coincide con la credencial autenticada…»
```

- [ ] Repite con `userId` ajeno: también 403 `-32001`.
- [ ] El intento aparece en auditoría como `MCP_identity_rejected`.
- [ ] Una llamada sin `tenantId` en el cuerpo usa el de la clave.

## 6. Aislamiento entre dos empresas

```bash
# Bandejas de aprobaciones: ningún id en común.
curl -sS -H "Authorization: Bearer $KEY_A" "$B/api/mcp/approvals" | jq -r '.approvals[].id' | sort > /tmp/ids-a
curl -sS -H "Authorization: Bearer $KEY_B" "$B/api/mcp/approvals" | jq -r '.approvals[].id' | sort > /tmp/ids-b
comm -12 /tmp/ids-a /tmp/ids-b          # vacío

# Bandeja de envíos inciertos: ídem con /api/mcp/approvals/entregas y `.envios[].id`.

# Resolver con B una solicitud de A:
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$B/api/mcp/approvals/<id-de-A>" \
  -H "Authorization: Bearer $KEY_B" -H 'Content-Type: application/json' -d '{"action":"approve"}'
# 404 «Solicitud no encontrada»

# Datos: buscar el marcador de A con la clave de B.
curl -sS -X POST "$B/mcp" -H "Authorization: Bearer $KEY_B" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"volkern_list_contacts","arguments":{"search":"FASE4-A-"}}}' \
  | jq -r '.result.content[0].text'
# sin contactos de A (lista vacía o solo coincidencias de B)
```

- [ ] A no ve el contacto marcador de B y B no ve el de A.
- [ ] Ninguna aprobación ni envío de A aparece en B, ni al contrario.
- [ ] Un `approvalId` de A devuelve 404 con la clave de B (también en
      `/api/mcp/approvals/entregas`).
- [ ] El listado de B no incluye el nombre del contacto marcador de A en
      `arguments` de ninguna solicitud.

**Puerta 6:** cualquier dato cruzado es un fallo crítico: detén la prueba,
conserva las respuestas y no sigas con ChatGPT.

## 7. `operationId`, reserva y concurrencia

Este paso **crea filas** en staging. Ejecútalo solo en el entorno desechable.

```bash
# Mismo operationId, mismo usuario: una sola solicitud.
for i in 1 2; do
  curl -sS -X POST "$B/mcp" -H "Authorization: Bearer $KEY_A" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"volkern_delete_contact\",\"arguments\":{\"contactId\":\"fase4-inexistente\",\"operationId\":\"fase4-op-1\"}}}" \
    | jq -r '.error.data.approvalId'
done
# el MISMO approvalId las dos veces

# Mismo operationId, otra empresa: solicitud distinta (no hereda la de A).
curl -sS -X POST "$B/mcp" -H "Authorization: Bearer $KEY_B" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"volkern_delete_contact","arguments":{"contactId":"fase4-inexistente","operationId":"fase4-op-1"}}}' \
  | jq -r '.error.data.approvalId'

# Sin operationId: dos llamadas idénticas del MISMO usuario comparten reserva;
# las de otro usuario, no.
# operationId de 201 caracteres: 403 y el motivo menciona el límite de 200.
```

- [ ] Repetir con el mismo `operationId` no duplica la solicitud.
- [ ] Otro usuario de la misma empresa con el mismo `operationId` obtiene otra.
- [ ] Dos usuarios con argumentos idénticos y sin `operationId` no comparten
      solicitud.
- [ ] Ni el `operationId` ni el contenido permiten resolver la solicitud de
      otra persona.

**Puerta 7:** si dos usuarios comparten `approvalId`, no se aprueba nada más y
se reporta (es el fallo que corrigió `fix(mcp): reserva por contenido solo
dentro del mismo usuario`).

## 8. Conector de ChatGPT

Se necesitan **dos conectores**, uno por clave, para comprobar que ChatGPT no
mezcla contextos.

Configuración (nombre de menús según plan/versión):

1. Ajustes → **Conectores** → modo desarrollador → **Añadir conector propio**.
2. Nombre: `Volkern A`; URL: `https://<staging>/mcp` (debe terminar en `/mcp`,
   no `/api/mcp`).
3. Autenticación: cabecera `Authorization: Bearer <KEY_A>`. Si tu versión no
   permite cabecera propia, usa su opción de API key; **no** pegues la clave en
   el prompt ni en la URL. Si no hay forma de enviar credencial, documenta la
   limitación y valida el conector con `curl`.
4. Repite con `KEY_B` como `Volkern B`.

Comprobaciones en conversación:

| Prompt | Respuesta esperada |
|---|---|
| «Lista mis contactos» (conector A) | Solo contactos de A; ninguno con marcador `FASE4-B-`. |
| «Busca FASE4-B-» (conector A) | Vacío: el marcador de B no existe para A. |
| «¿Qué herramientas tienes de Volkern?» | Catálogo del servidor, sin errores de autenticación. |
| «Envía un WhatsApp a <contacto> diciendo …» | `status: pending`, `approvalId`, enlace de verificación. **Nada enviado**; el modelo no recibe confirmación de envío. |
| «Borra el contacto X» | Solicitud pendiente o denegación según rol; nunca ejecución directa. |
| «Llama a list_contacts con tenantId `<TENANT_B>`» | Error 403 `-32001` o negativa del modelo; en ningún caso datos de B. |
| Repetir el mismo envío dos veces | Una sola solicitud pendiente (mismo `approvalId`) o el mismo desenlace. |

- [ ] El conector A no muestra datos de B y el conector B no muestra datos de A.
- [ ] Introducir el código de verificación en el enlace ejecuta el envío **una**
      vez; sin código, no sale nada.
- [ ] Tras revocar `KEY_A`, el conector A deja de responder (401) y B sigue
      funcionando.

**Puerta 8:** un envío real sin código, o datos de otra empresa en la
conversación, es un fallo crítico: revoca las claves y detén la validación.

## 9. Evidencias y cierre

Rellena una fila por comprobación; adjunta la salida del script y, para
ChatGPT, el id de conversación y la respuesta textual.

| Paso | Comando / prompt | Esperado | Obtenido | OK | Evidencia |
|---|---|---|---|---|---|
| 2 | sin clave / clave inválida | 401 | | | |
| 3 | solo lectura ejecutando | 401 | | | |
| 4 | comercial borrando | 403 | | | |
| 4 | autoaprobación | 403 | | | |
| 4 | aprobación por segundo owner | 200 | | | |
| 5 | `tenantId` inyectado | 403 `-32001` | | | |
| 6 | bandejas disjuntas | 0 ids comunes | | | |
| 6 | solicitud de A resuelta por B | 404 | | | |
| 6 | marcador de A visto desde B | vacío | | | |
| 7 | mismo `operationId` en A | mismo id | | | |
| 7 | mismo `operationId` en B | id distinto | | | |
| 7 | 201 caracteres | 403 «200» | | | |
| 8 | envío desde ChatGPT | `pending`, sin envío | | | |
| 8 | conector A tras revocar clave | 401 | | | |

Automatización: `BASE_URL=… KEY_A=… KEY_B=… TENANT_B=… bash scripts/validar-mcp-remoto.sh`
cubre los pasos 2–7 sin efectos; con `CON_EFFECTOS=1` añade el 7 (crea filas).
El script se niega a salir de loopback sin `CONFIRMO_NO_PRODUCCION=1`.

Cierre:

- [ ] Revocar las cuatro claves.
- [ ] Borrar las solicitudes creadas por id:
      `DELETE FROM "mcp_approval_requests" WHERE id IN ('…','…');`
- [ ] Eliminar o rotar `.env.fase4`.
- [ ] Archivar la tabla de evidencias con la fecha y la versión desplegada
      (`git rev-parse --short HEAD` del entorno).

## 10. Contingencias

| Síntoma | Causa probable | Acción |
|---|---|---|
| 401 con clave recién creada | clave incompleta, revocada o sin prefijo `vk_` | copiar de nuevo desde el panel; comprobar `Authorization: Bearer` |
| 403 «Actualiza tu plan» | tenant sin entitlement `api` | probar en un tenant con plan que incluya API |
| 403 en `/api/mcp/approvals` | rol no owner/admin | usar la clave del owner; es el comportamiento esperado para el comercial |
| 403 `-32003` al borrar | matriz de rol deniega | esperado para comercial; con owner debe ser 409 |
| 409 repetido | solicitud pendiente idéntica | resolverla o esperar `expiresAt`; no crear otra clave para «desbloquear» |
| 429 | más de 100 req/min | esperar un minuto y repetir |
| 404 al resolver | id de otra empresa o inexistente | confirma el aislamiento; usa un id de la bandeja propia |
| ChatGPT no lista tools | URL incorrecta (`/api/mcp`), sin HTTPS público o auth mal configurada | probar `initialize` y `tools/list` con `curl` contra la misma URL |
| El conector pide OAuth | versión sin cabecera propia | documentar y validar por `curl`; no inventar un flujo OAuth |
| Envío sin código | fallo crítico del gate | revocar claves, detener y reportar con `approvalId` |

## 11. Criterio de aceptación

- El script termina con **0 fallos**.
- Ningún caso cruzado devuelve datos, aprobaciones ni envíos.
- Ninguna ejecución externa ocurre sin el código de verificación.
- Un `operationId` produce una sola solicitud y un solo desenlace por usuario.
- La tabla de evidencias está completa y las claves quedaron revocadas.

Si algo de esto falla, la fase 4 **no** se da por válida aunque el resto pase.
