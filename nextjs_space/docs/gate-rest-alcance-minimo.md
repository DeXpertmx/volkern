# Gate REST — decisión y alcance mínimo

**Estado:** implementado — falta sólo la medición de siete días antes de encenderlo en producción (§7)
**Fecha:** 28 de octubre de 2026
**Contexto:** continúa el cierre de la asimetría del runtime documentado en el [README del servidor MCP standalone](../mcp-server/README.md): el gate ya cubre las tres superficies MCP (`/mcp`, `/api/mcp` y el standalone, que ahora reenvía a `/mcp`). Queda abierta la puerta REST.

---

## Decisión

**Toda operación REST alcanzable con credencial de API cuyo riesgo sea `destructive` o `external` se deniega con 403. No se pide aprobación: se niega.**

Tres consecuencias que conviene leer juntas, porque cada una descarta la alternativa evidente:

1. **El punto de control es uno solo** —la validación de la credencial—, no una anotación por ruta.
2. **Una credencial no es un sujeto aprobable.** El gate MCP resuelve `ask` ejecutando la herramienta *en el servidor*, con la identidad de quien la pidió y bajo bloqueo de fila. Para un handler HTTP no existe equivalente: no hay "replay" interno de una petición, y guardar cuerpo y cabeceras para reproducirlas después sería peor que negar. Por eso, con una clave, la respuesta honesta a lo irreversible es *no*.
3. **El agente que necesita hacerlo tiene una puerta mejor:** MCP. Ahí ya existen aprobación, atribución, ejecución única y auditoría. El servidor standalone ya la usa.

Y una que se decide en contra, a sabiendas: **`write` y `financial` siguen como están** (sólo scope). Los documentos con valor se cancelan; una cotización creada por una integración es un caso legítimo y frecuente. El coste de esa concesión se nombra en §6.

---

## 1. El hueco, medido

Inventario reproducible con [`scripts/inventario-rutas-escritura.mjs`](../scripts/inventario-rutas-escritura.mjs):

| Superficie | Antes | Ahora |
|---|---:|---:|
| Rutas con métodos de escritura (`app/api/**/route.ts`) | 624 | **623** |
| Alcanzables con credencial de API | 291 | **289** |
| Sólo sesión (`getServerSession`) | 227 | 227 |
| Patrón de auth no reconocido por el escaneo (login, webhooks, cron) | 106 | 107 |
| **Alcanzables con credencial y sin ningún scope declarado** | **138** | **0** |
| Con `DELETE` y credencial | 57 | 57 |
| Con `DELETE`, credencial y sin scope | **26** | **0** |
| Rutas de **sólo lectura** alcanzables con credencial | 116 | 116 |
| **De sólo lectura, con credencial y sin ningún scope** | **47** | **0** |

La cifra que cambió el planteamiento fue la de 138: **casi la mitad de la
superficie con credencial no comprobaba ni un scope**. Un scope ausente en
`withTenantAuth(handler)` no significa "sin permisos": significa que cualquier
clave válida de la empresa pasa. Así que "ya lo protege el scope" no era un
argumento disponible para casi la mitad del problema. Esa tanda está cerrada
(§9).

Las cifras bajaron un poco al arreglar dos fallos del propio instrumento: un
`authenticateRequest()` mencionado en un comentario contaba como autenticación
(`/api/auth/mobile-login`) y tres ficheros que sí declaraban
`}) as any, ['subscriptions:read']` se leían como sin scope. El escaneo ahora
vive en [`scripts/lib/rutas-escritura.mjs`](../scripts/lib/rutas-escritura.mjs),
que enmascara comentarios y cadenas antes de contar y lo comparten el inventario
y el codemod. Los números de este documento salen de ahí.

### Cuatro exhibiciones verificadas en código

| Ruta | Lo que exige hoy | Lo que hace |
|---|---|---|
| `DELETE /api/leads/[id]` | `leads:delete` | [`prisma.lead.delete`](../app/api/leads/%5Bid%5D/route.ts#L226) — **borrado físico** |
| `DELETE /api/contacts/[id]` | cualquiera de `contacts:read`/`write`/`delete` | [`prisma.contact.delete`](../app/api/contacts/%5Bid%5D/route.ts#L319) — una clave **de escritura** puede borrar |
| `DELETE /api/catalogo/[id]` | `config:write` | borra un ítem que puede estar referenciado por cotizaciones y contratos |
| `POST /api/campanas/[id]/ejecutar` | `campaigns:write` | [`executeCampaign`](../app/api/campanas/%5Bid%5D/ejecutar/route.ts#L32) — dispara la campaña entera, con envíos reales |

La cuarta es la más incómoda: **no hay herramienta MCP de campañas**, así que ese agujero nunca iba a quedar cubierto por el gate, por muy bien que se cerrara la asimetría anterior.

---

## 2. Por qué el alcance no es "gatear todo REST"

Tres rechazos, con su motivo:

- **Rompería la interfaz.** El gate exige identidad, riesgo y decisión; la UI ya tiene su propio modelo (`lib/permissions-core.ts`, `Role.permisos`, y su pantalla de roles). Meter aprobaciones en el camino de sesión convierte cada clic en un 409 y sustituye un sistema de permisos por otro a medias.
- **No hay tabla que mantener.** 291 rutas contra 43 herramientas: mapear ruta→herramienta a mano es una lista de 291 entradas que envejece mal y que nadie revisa.
- **Los scopes no expresan riesgo.** `config:write` autoriza editar la configuración fiscal *y* borrar un ítem del catálogo. No hay vocabulario donde decir "esto es irreversible".

Lo que sí escala es lo que ya funciona en el gate: **una capacidad como clave compartida**. `volkern_delete_contact` y `DELETE /api/contacts/[id]` no son dos cosas parecidas: son la misma, con dos puertas.

---

## 3. Cómo: una tabla, dos superficies

```
tool-policy.ts
  TOOL_POLICIES[tool]      → { risk, module, capability }
  REST_POLICIES[patrón]    → { capability, risk }
                              ↓
                    decide(capability, rol, overrides)
                              ↓
              MCP: allow | ask | deny     REST+clave: allow | deny
```

- La capacidad es la clave: `contacts.delete`, `messages.send`, `orders.invoice`.
- `facturar` entra como `destructive`: un CFDI timbrado no se anula, sólo se sustituye por nota de crédito. No es "un documento más".
- Los overrides por empresa (`mcp_tool_capabilities`) siguen aplicando, con su regla intacta: **pueden restringir siempre, aflojar sólo en `write` y `financial`**. Nadie habilita un borrado desde una pantalla de configuración.
- `external` y `destructive` no admiten `allow` para credenciales en esta versión, ni por override.

### Punto único de inserción

El gate va en la ruta de la **credencial**, dentro de `authenticateRequest`, no en los handlers:

```ts
// Tras verificar scopes y sólo en la vía apikey (`validateApiKey`):
const gate = decideRestCall({ method: request.method, path: new URL(request.url).pathname })
if (gate.decision === 'deny') {
  await auditRestDenial({ auth, method: request.method, path, decision: gate })
  return { valid: false, status: 403, capability: gate.capability, risk: gate.risk, error: gate.reason }
}
```

No recibe `roleName`, y es deliberado: la decisión no depende del rol porque el
sujeto no es una persona sino una clave. Aceptar el rol sugeriría que existe uno
que sí puede, y no existe. También va **después** de los scopes —un permiso
insuficiente se explica mejor como 401, que es lo que ya devolvía— y **antes**
del contexto jerárquico, para no consultar el tenant si se va a denegar.

`withTenantAuth` ya centraliza **8** de las 12 rutas y puede devolver 403 directamente. Las otras **4** llaman a `authenticateRequest` a mano —`leads/[id]`, `catalogo/[id]`, `ordenes-venta/[id]/facturar` y `contratos/[id]/send`— y devuelven hoy 401 fijo; se ajustan a `auth.status ?? 401`. Ninguna otra ruta cambia de comportamiento: lo que no está en la tabla sigue exactamente igual.

---

## 4. Las 12 rutas que se deniegan

| Método y ruta | Capacidad | Riesgo | Scope actual | Efecto |
|---|---|---|---|---|
| `DELETE /api/contacts/[id]` | `contacts.delete` | destructive | `contacts:write` basta | borrado físico |
| `DELETE /api/leads/[id]` | `leads.delete` | destructive | `leads:delete` | borrado físico |
| `DELETE /api/catalogo/[id]` | `catalogo.delete` | destructive | `config:write` | borra ítem referenciado |
| `DELETE /api/mensajes/conversaciones/[id]` | `conversations.delete` | destructive | `conversations:delete` | borra el hilo |
| `POST /api/erp/inventory/consumption` | `inventory.consume` | destructive | `erp:write` | descuenta stock |
| `POST /api/erp/production/scrap` | `production.scrap` | destructive | `erp:write` | merma irreversible |
| `POST /api/erp/production/report-waste` | `production.waste` | destructive | `erp:write` | merma irreversible |
| `POST /api/ordenes-venta/[id]/facturar` | `orders.invoice` | destructive | `orders:write` | timbra CFDI |
| `POST /api/mensajes/enviar` | `messages.send` | external | `messages:write` | mensaje a un tercero |
| `POST /api/campanas/[id]/ejecutar` | `campaigns.execute` | external | `campaigns:write` | dispara la campaña |
| `POST /api/contratos/[id]/send` | `contracts.send` | external | `contratos:write` | envía al cliente |
| `POST /api/contratos/[id]/volkernsign` | `contracts.request_signature` | external | `contratos:write` | solicita firma |

Respuesta:

```json
{ "error": "Operación irreversible: no se ejecuta con una credencial de API. La misma capacidad por MCP requiere la aprobación de un responsable.",
  "capability": "contacts.delete", "risk": "destructive" }
```

El mensaje tiene dos variantes, y la diferencia importa. Sólo 4 de las 12
capacidades tienen herramienta MCP (`contacts.delete`, `messages.send`,
`inventory.consume`, `production.scrap`); para las otras ocho —campañas,
timbrado, envío de contratos— no hay puerta MCP a la que mandar al integrador,
así que la frase no la promete:

```json
{ "error": "Operación irreversible: no se ejecuta con una credencial de API. No tiene equivalente MCP: requiere la sesión de una persona en la interfaz.",
  "capability": "campaigns.execute", "risk": "external" }
```

`403`, y queda en `AuditLog` como `REST_action_denied` con capacidad, riesgo, id y nombre de la clave, y ruta — la misma tabla que `MCP_tool_denied`, para que el intento aparezca junto a las ejecuciones legítimas de la empresa.

---

## 5. Fuera de alcance (y por qué)

| Qué | Por qué no entra |
|---|---|
| Las **227** rutas sólo-sesión | No alcanzables con credencial. Su control es el rol de la persona, y ese sistema ya existe. |
| Las **134** que estaban con credencial y **sin scope** | Ya no: se cerraron en la tanda de escritura de §9. |
| Las **47** rutas de **sólo lectura** con credencial y sin scope | Ya no: se cerraron en la tanda de lectura de §9.1. |
| `write` y `financial` | Reversibles. Ver §6. |
| Las **106** con auth no reconocida | Barrida aparte; el escaneo no distingue webhook autenticado por firma de ruta sin protección. |
| Cron, webhooks, rutas públicas de firma | Se autentican por secreto o firma, no por credencial de usuario. |

---

## 6. Lo que esta decisión NO cierra

Hay que decirlo antes de venderla:

1. **`financial` sigue asimétrico.** Un suscriptor con clave puede crear una cotización por REST cuando el mismo hecho por MCP con rol `support` pediría aprobación. Es reversible y es una integración legítima, pero la asimetría existe. Se cerraría con una `ask` para REST, y eso exige un camino de ejecución que hoy no hay.
2. **`POST /api/erp/inventory`** (movimiento de inventario) queda en `write`: un ajuste puede ser una baja encubierta.
3. **`POST /api/ordenes-venta/[id]/share-token` queda fuera a propósito.** Genera —o devuelve, es idempotente— el enlace público de una orden, pero no avisa a nadie: quien comparte es quien llama. Negarlo con una clave rompería una integración que sólo pide su propio enlace. Queda como candidato a `destructive` si no existe una vía de revocación del token; si existe, es reversible y se queda donde está.
4. **La capacidad no viaja en el token.** Se resuelve por método+ruta; un alias de ruta nuevo que no esté en la tabla no queda cubierto hasta que el guardián del §7 lo delate.

---

## 7. Despliegue en tres pasos — hechos

1. **Tabla y decisión pura** en [`lib/mcp/tool-policy.ts`](../lib/mcp/tool-policy.ts): `capability` en las 43 `TOOL_POLICIES`, `REST_POLICIES` (12 filas) y `decideRestCall()`. Sin base de datos, testeable sin Postgres — igual que `decideToolCall`. La capacidad es lo que hace que `volkern_delete_contact` y `DELETE /api/contacts/[id]` sean el mismo hecho: el guardián comprueba que, cuando una capacidad está en las dos tablas, el riesgo coincide.
2. **Enganche** en [`validateApiKey`](../lib/api-key-auth.ts) (la única vía de credencial), `withTenantAuth` devolviendo `auth.status ?? 401` —cubre 8 de las 12— y los 4 handlers que llaman a `authenticateRequest` a mano (`leads/[id]`, `catalogo/[id]`, `ordenes-venta/[id]/facturar`, `contratos/[id]/send`) propagando el status. El resto de las 291 rutas con credencial no cambia de comportamiento: lo que no está en la tabla no se toca. Auditoría en [`lib/rest-gate.ts`](../lib/rest-gate.ts), best-effort: la denegación sale aunque el registro falle.
3. **Guardián** [`tests/gate-rest-cobertura.test.ts`](../tests/gate-rest-cobertura.test.ts), 19 pruebas en cinco bloques: correspondencia (cada fila apunta a un `route.ts` real que exporta ese método), superficie (la fila sigue siendo alcanzable con credencial; si no, es peso muerto), decisión (lo irreversible se deniega siempre; lo demás queda igual, incluido que no se desborde a rutas vecinas con más o menos segmentos), coherencia entre puertas (mismo riesgo para la misma capacidad) y red de seguridad (la superficie de `DELETE` con credencial está congelada en 57 rutas: una nueva no entra sin que alguien la mire).

### Lo que el guardián NO afirma

No demuestra "denegación por defecto por ruta nueva" sobre las 291: eso exigiría
una lista de 279 exenciones con motivo, justo la tabla que §2 descarta por
envejecer mal. Lo que garantiza es más estrecho y verdadero: **lo clasificado es
irreversible, existe, sigue siendo alcanzable con credencial, y no se permite
por ninguna vía**. La cobertura del resto es la tanda de §5, no ésta.

### Antes de encenderlo: medir una semana

`/api/mensajes/enviar` y `/api/campanas/[id]/ejecutar` son los dos candidatos a tener tráfico legítimo con clave (un sitio web que manda WhatsApp, un cron propio que lanza campañas). El `AuditLog` ya distingue `authMethod === 'apikey'` en varias rutas. Contar siete días de uso por ruta y por clave antes de activar evita descubrir la integración rota en producción. Si alguna resulta imprescindible, la salida es una allowlist por empresa para esa capacidad concreta — explícita, auditada y con nombre propio — no bajar el techo de la matriz.

---

## 8. Cómo se comprueba que sigue siendo cierto

```bash
cd nextjs_space && node scripts/inventario-rutas-escritura.mjs
cd nextjs_space && npx vitest run tests/gate-rest-cobertura.test.ts
```

El primero imprime el resumen de §1 y la lista de rutas con `DELETE`
alcanzables por credencial, marcando las que no tienen scope: los números de
este documento salen de ahí, y si dejan de cuadrar el documento está viejo. El
segundo es el guardián, y falla cuando la tabla y el código dejan de
corresponderse.

```bash
cd nextjs_space && npx vitest run tests/scopes-declarados-en-catalogo.test.ts
```

Ese tercero cierra el otro extremo: que ninguna ruta exija un scope que no esté
en `AVAILABLE_SCOPES`. Un scope que no se puede conceder es una ruta muerta que
devuelve 401 para siempre.

```bash
cd nextjs_space && npx vitest run tests/scopes-rutas-credencial.test.ts
```

El cuarto es el invariante de §9 y §9.1 en forma de test: **credencial ⇒
scope**. Falla listando la ruta concreta que dejó de declararlo, así que una
ruta nueva añadida con `withTenantAuth(handler)` sin scopes se delata en cuanto
alguien la añada. Se probó que falla de verdad: quitando `['dashboard:read']`
de `/api/dashboard`, el test señala `/api/dashboard`.

---

## 9. La tanda de scopes (cerrada)

**134 ficheros de ruta** que autenticaban por credencial sin declarar ningún
scope exigen ya uno. El cambio se hizo con
[`scripts/aplicar-scopes-rest.mjs`](../scripts/aplicar-scopes-rest.mjs), que
propone la clasificación completa sin escribir nada y sólo la aplica con
`--apply`; es idempotente (hoy imprime `Ficheros: 0`).

### La regla

El scope es `<módulo>:<acción>` y depende del **método**, no del fichero: un
`DELETE` y un `GET` del mismo `route.ts` no pueden compartir scope. `GET` pide
`:read`; `DELETE` pide `:delete` cuando el catálogo lo tiene para ese módulo
(`leads`, `contacts`, `contratos`, `citas`…), y `:write` cuando no; el resto
pide `:write`. Las excepciones donde el prefijo de la ruta miente están escritas
una a una con su motivo en el codemod: `/api/import/accounting` es
`accounting:write`, `/api/hospitality/finanzas/cobrar` es `accounting:write`,
`/api/hospitality/roles` es `team:write`, `/api/compliance/upgrade` es
`subscriptions:write`.

Tres capacidades no siguen el patrón porque no son CRUD:
`/api/ai/*`, `/api/gemini`, `/api/guide` y `/api/gemma/*` piden `skills:execute`;
`/api/mcp/approvals/[id]` pide `mcp:admin` (resolver una aprobación es
administrar el gate, no ejecutar una herramienta); `/api/connect/messages` pide
`messaging:send` al enviar y `messaging:read` al listar.

### Dos reglas nuevas

1. **`x:write` satisface `x:read`** (`hasAnyScope`, en `lib/api-keys.ts`). Sin
   esto, una integración que ya tenía `accounting:write` habría empezado a
   recibir 401 en cada `GET`, que es exactamente el tipo de rotura que hace que
   nadie se atreva a endurecer permisos. La implicación es en un solo sentido:
   un `:read` nunca satisface un `:write`.
2. **13 scopes nuevos** en el catálogo, para los módulos que no tenían
   vocabulario: `hospitality:read/write`, `real-estate:read/write`,
   `support:read/write`, `compliance:read/write`, `notifications:read/write`,
   `users:read/write`, `import:write`. Añadirlos **no** cambia ninguna clave
   existente: cada una conserva su lista, y hasta que un tenant los otorgue la
   integración recibirá 403. Es el momento de §7: medir antes de encender.

### Cómo se comprobó que muerden

No con un test unitario, con dos integraciones contra la base real: los tests
de `/api/agency/slots` y `/api/slots` crean una API key de verdad y llaman al
handler. Con `scopes: ['agent:skill']` empezaron a devolver **401 con
`Permisos insuficientes (team:read)`**; al añadir `team:write` a la clave
vuelven a 200/201. Eso es la prueba de que el scope que se añadió en la ruta es
el que se está evaluando. `branding-integration` mostró lo mismo con
`settings:read`.

### Lo que apareció por el camino

- **`/api/admin/*` exige `admin:read`/`admin:write`, que el catálogo excluye a
  propósito** de las claves de tenant. Se deduce lo obvio: esas rutas no son
  alcanzables con una clave y no deben serlo (son el panel de operadores, con
  rol Superadmin). El guardián las exime con ese motivo escrito, en lugar de
  fingir que están cubiertas.
- **47 rutas de sólo lectura** siguen con credencial y sin scope. No son el
  agujero declarado —no escriben— y quedan medidas en §5. Se cerraron después,
  en §9.1.

---

## 9.1. La tanda de lectura (cerrada)

**47 ficheros de ruta** que sólo exportan `GET` autenticaban por credencial sin
declarar ningún scope. El cierre usa el mismo codemod, con un modo nuevo:

```bash
cd nextjs_space && node scripts/aplicar-scopes-rest.mjs --lectura          # propone
 cd nextjs_space && node scripts/aplicar-scopes-rest.mjs --lectura --apply  # escribe
```

Los dos modos son excluyentes por diseño —`--lectura` descarta cualquier
fichero con escritura suelta, que es responsabilidad del modo por defecto— para
que no propongan nunca el mismo fichero con reglas distintas. Es idempotente:
aplicado, imprime `Ficheros: 0` en ambos modos.

### Por qué el mismo agujero con otro método

Un scope ausente en un `GET` significa lo mismo que en un `POST`: **cualquier
clave válida de la empresa pasa**, aunque se hubiera emitido para leer
contabilidad. La ruta `/api/v1/sovereignty/integrity-chain` devolvía hashes de
todas las facturas a una clave creada para Leads. No escriben, pero exponen los
datos del propio tenant a cualquier clave suya, que es exactamente lo que el
scope existe para impedir.

### La clasificación

La misma regla: `GET` → `<módulo>:read`. Los módulos que no aparecían en el
codemod tuvieron que entrar, porque sin regla no hay propuesta:

- `modulo()` aprendió `/api/analytics/` → `analytics`, `/api/dashboard` →
  `dashboard` y `/api/integrations/telephony/` → `telephony` (antes caían en
  `settings`, que habría pedido `settings:read` para leer llamadas).
- Cuatro rutas `v1` entraron como excepción, con el recurso real:
  `analytics:read`, `inventory:read`, `dashboard:read` e `invoices:read`.
- `/api/hospitality/compliance` (la bandeja del registro de viajeros) queda en
  `hospitality:read`, no en `compliance`: su propia cabecera dice que es la
  bandeja de reservas y internamente exige `reservas.ver`. Las excepciones
  `compliance/config` y `compliance/[reservationId]` siguen donde estaban.
- **`import:read` es el único scope nuevo** de esta tanda. `import:write` ya
  existía; leer el historial de importaciones no es importar, y sin el `:read`
  la ruta habría quedado con un scope que ninguna clave puede tener.

### Lo que NO cambió

Los scopes sólo se evalúan en la vía de API key (`validateApiKey`). La sesión del
dashboard no pasa por ahí, así que **ninguna pantalla se rompe**: lo único que
cambia es qué puede hacer una clave. Y hasta que un tenant no otorgue el scope
nuevo, una integración que llamara a esas rutas recibiría 401 — el motivo de
medir una semana antes de encender, §7.

### Una corrección de medición

El primer recuento de esta tanda dio **293** en vez de 47. El instrumento
exigía que la llamada de auth *envolviera* el bloque del método, y en los
ficheros escritos como `export async function GET` la llamada va **dentro** del
cuerpo, así que contaba como sin scope a cualquier ruta de ese estilo. Es el
mismo fallo de clase que los dos de §1: una expresión regular que no coincide
con el código real. Reparado midiendo bloques con la llamada adentro o
envolviendo: **648 bloques con llamada de credencial, 0 sin scope**.
