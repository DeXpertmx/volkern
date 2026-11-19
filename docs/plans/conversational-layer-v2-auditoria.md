# Conversational Operating Layer v2 — Etapa A: auditoría

Documento de auditoría del sistema conversacional de Volkern (evolución propuesta).
Sin cambios de código: todo lo que sigue se ha obtenido leyendo el árbol en
`a483e489` y comprobando el despliegue en producción.

---

## 0. Prioridades revisadas (P0–P6)

Orden corregido tras revisar la auditoría. El aislamiento multi-tenant sube a P0
porque hoy **no está demostrado**, y la experiencia de salida entra como sexto
frente: un backend correcto que devuelve párrafos de texto sigue siendo un chat,
no una capa de operaciones.

| Prioridad | Problema | Consecuencia | Dónde se arregla |
|---|---|---|---|
| **P0** | Aislamiento multi-tenant no demostrado (§4, criterio 8) | Cualquier query que olvide `where: { tenantId }` mezcla datos entre clientes | Etapa 0: pruebas de dos tenants + guarda en el ejecutor |
| **P1** | Permisos insuficientes en el agente | Cualquier usuario autenticado ejecuta las 7 herramientas | Etapa B: comprobación de rol/scope **antes** de ejecutar |
| **P2** | No se envía historial al modelo | No entiende referencias anteriores («que tengan terraza») | Etapa B: Context Manager con ventana de turnos |
| **P3** | Sólo siete herramientas | No aprovecha 191 skills ni 43 tools MCP | Etapa C: registro único + exposición por valor |
| **P4** | Sin idempotencia | Doble clic o reintento duplica tareas, notas e interacciones | Etapa B: clave `(userId, conversationId, tool, hash(args))` |
| **P5** | Falta de trazabilidad por herramienta | No se puede auditar qué hizo la IA con qué datos | Etapa B: `ToolExecution` con args saneados y resultado |
| **P6** | Texto plano sin tarjetas, tablas ni indicadores | El usuario no distingue qué se ejecutó ni qué datos hay detrás | Etapa C: contrato de respuesta estructurada + renderer |

P0 no es una etapa de producto: es una puerta. Mientras no haya una prueba
automática con dos tenants que intente leer y escribir cruzado, el resto de
prioridades se construyen sobre una suposición.

---

## 1. Arquitectura actual

### 1.1 Entrada web (la que usa el chat de la app)

```
app/chat/page.tsx (728 L)
   └─ POST/GET /api/chat  (app/api/chat/route.ts, 133 L)
         ├─ getServerSession(authOptions)  → userId + tenantId de la sesión
         ├─ resolveConversation()          → canal por usuario (lib/chat/gemma-conversations.ts)
         ├─ prisma.chatMessage.create()    → persiste turno del usuario
         └─ orchestrator.process()         → lib/agents/orchestrator.ts (503 L)
```

`orchestrator.process` encadena, en este orden:

1. `rateLimiter.check` (por usuario/canal/tenant).
2. `PendingCommand` vigente → si existe, se interpreta el mensaje como confirmación.
3. Contexto pendiente (`chatbotAuditLog` con id `ctx_<userId>`, TTL 5 min) para continuaciones tipo «el de antes».
4. **Filtro de acción CRM** (`esPeticionDeAccionCrm`): regex de verbo de cambio + objeto del CRM/relato. Si pasa, llama a `crm-tool-agent` y **devuelve su resultado sin seguir el flujo clásico**.
5. `intentClassifier.classify` (4.162 L, ~130 intenciones, patrones deterministas + respaldo LLM con `callAssistantWithFallback`).
6. `confidenceChecker` → decidir si ejecuta, pide aclaración o rechaza.
7. `entityExtractor` → parámetros; `commandValidator` → permisos por rol + confirmación.
8. `executeSkill(intent)` contra el registro de skills (`lib/skills/index.ts`).
9. `responseFormatter` (694 L) → texto + emoji + `quickReplies`.

### 1.2 Agente CRM con herramientas (la pieza nueva)

`lib/agents/crm-tool-agent.ts` (466 L) expone **7 herramientas** al modelo:
`buscar_persona`, `crear_lead`, `registrar_interaccion`, `crear_nota`,
`crear_tarea`, `completar_tarea`, `reprogramar_tarea`.

- Modelo: `deepseek-chat` vía OpenRouter (`lib/assistant/openrouter-client.ts`),
  con respaldo Gemini y circuit breaker por modelo.
- Bucle de herramientas: máximo 5 vueltas, presupuesto 20 s (el orquestador corta a 23 s).
- `tenantId` y `userId` llegan por cierre desde la sesión; el modelo nunca los ve.
- Ejecuta contra las mismas skills (`create_lead`, `create_task`…), no contra SQL nuevo.

### 1.3 Canales heredados

`lib/chat/chatbot-service.ts` (1.419 L) + `execution-engine.ts` (1.330 L) +
`skill-orchestrator.ts` (1.276 L) alimentan WhatsApp/Telegram/Chatwoot
(`telegram-gateway`, `telegram-chatbot`, `chatwoot-chatbot-handler`). Es un
pipeline **paralelo** al del orquestador web, con su propio motor de ejecución.

### 1.4 Superficie MCP

- `mcp-server/src/tools-catalog.ts`: **43 herramientas**, 7 categorías
  (contacts, leads, appointments, tasks, messaging, interactions, notes, deals).
- `app/api/mcp/route.ts` (476 L): identidad **sólo** desde la credencial
  (`lib/mcp/request-identity.ts`); un `tenantId` del cuerpo distinto → 403 auditado.
- Flujo de aprobaciones con código por WhatsApp (`app/api/mcp/approvals/*`).
- Rate limit por credencial, entitlements por tenant, `AuditLog` por operación.
- `lib/mcp/skills/` sólo contiene `internalMessageSkill.ts`.

### 1.5 Memoria, contexto y datos

- Persistencia: `ChatChannel` + `ChatMessage` (historial real, 200 mensajes en `GET`).
- El `POST` **no reenvía el historial al modelo**: `crm-tool-agent` construye
  `[system, user]` y nada más. La continuidad depende del contexto pendiente en BD.
- `lib/agents/conversation-context.ts` (303 L) y `lib/chat/chat-memory.ts` (360 L)
  existen, pero el orquestador web no los usa para el agente con herramientas.
- Resumen de conversaciones: `lib/chat/conversation-summarizer.ts` (205 L).

### 1.6 UI

`app/chat/page.tsx`: lista de conversaciones (sidebar), sugerencias iniciales,
burbujas de texto plano y `quickReplies`. **No** hay render de markdown, tablas,
tarjetas de entidad ni indicador de herramientas ejecutadas.

### 1.7 Inventario cuantitativo

| Componente | Tamaño / cantidad |
|---|---|
| Orquestador web | 1 fichero, 503 L |
| Clasificador de intenciones | 4.162 L, ~130 intenciones |
| Herramientas del agente CRM | 7 |
| Skills registradas | 191 claves en 51 módulos (`lib/skills/*.ts`) |
| Herramientas MCP | 43 |
| Canales conversacionales | web, Telegram, WhatsApp, Chatwoot |
| Modelos | DeepSeek Chat (principal), Gemini (respaldo), Gemma (personalidad/routing) |

---

## 2. Capacidades existentes (lo que ya funciona)

1. **Consulta y operación de contactos/leads/tareas** desde el chat web, con
   confirmación de la persona antes de escribir (`buscar_persona` primero).
2. **Registro de interacciones y notas** sin enviar nada externo.
3. **Alta de leads** con guarda anti-duplicado por nombre/email (`yaExistia`).
4. **Tareas**: crear, completar, reprogramar con calendario de referencia inyectado
   (el modelo no improvisa fechas).
5. **Clasificación determinista** de ~130 intenciones con respaldo LLM cuando el
   patrón no puntúa.
6. **Confirmación de comandos sensibles** vía `PendingCommand` + revalidación.
7. **Rate limiting** por usuario y **auditoría** de éxito/error (`chatbotAuditLog`).
8. **MCP de 43 herramientas** con identidad por credencial, scopes, entitlements,
   auditoría, aprobaciones por WhatsApp y rate limit.
9. **Proactividad por cron**: tareas vencidas (Telegram, con guarda
   `avisoVencimientoEnviado`), briefings de hostelería, barridos de automatizaciones.
10. **Historial de conversaciones** persistido y recuperable por API.

---

## 3. Capacidades incompletas o ausentes

| Capacidad | Estado | Evidencia |
|---|---|---|
| Consultas de propiedades desde el chat web | ❌ | `search_properties_by_filters` existe como skill, pero no está entre las 7 herramientas del agente; sólo llega por el clasificador (`buscar_inmuebles`) |
| Pipeline/deals, agenda e informes en el agente | ❌ | mismas 7 herramientas; `list_deals`, `create_booking`, KPIs no están expuestos al tool calling |
| Continuidad conversacional real | ⚠️ | el `POST` no envía historial; sólo el contexto pendiente (5 min) y `PendingCommand` |
| Referencias a mensajes anteriores («que tengan terraza») | ❌ | no hay reintroducción de filtros previos; el clasificador recibe `context` como texto, no entidades |
| Confirmación en operaciones del agente CRM | ❌ | `crear_lead`, `crear_nota`, `completar_tarea` se ejecutan directas; el prompt pide «no pidas confirmación» |
| Permisos por rol en el agente CRM | ❌ | `commandValidator` valida `allowedRoles`, pero `crm-tool-agent` no consulta rol ni scope |
| Idempotencia | ❌ | sin clave de operación ni dedupe en el bucle de herramientas; un reintento del usuario duplica |
| Trazabilidad por herramienta | ⚠️ | `chatbotAuditLog` registra intención y éxito/error, no args/resultado por herramienta; el detalle sólo va a `console.log` |
| Aislamiento por RLS | ⚠️ | el chat no usa `runWithTenant`; el aislamiento depende de que cada query filtre `tenantId` |
| Respuestas estructuradas (tablas/tarjetas) | ❌ | texto plano + `quickReplies` |
| Cancelación de operaciones en curso | ❌ | el presupuesto de 20 s aborta la espera, pero no la escritura |
| Proactividad dentro del chat | ❌ | los crons avisan por Telegram; no hay «bandeja de sugerencias» en la conversación |
| Un solo motor de ejecución | ⚠️ | web usa orquestador; WhatsApp/Telegram/Chatwoot usan `execution-engine` + `skill-orchestrator` (dos caminos para lo mismo) |

---

## 4. Matriz de capacidades (criterios de aceptación §13)

| # | Criterio | Estado | Nota |
|---|---|---|---|
| 1 | Consultar información real en lenguaje natural | ⚠️ Parcial | Sólo contactos/leads/tareas; el resto de módulos por clasificador, no por agente |
| 2 | Comprender referencias a mensajes anteriores | ❌ | Sin historial en el prompt del agente |
| 3 | Ejecutar operaciones en varios módulos | ⚠️ Parcial | 7 herramientas frente a 191 skills y 43 tools MCP |
| 4 | Encadenar herramientas para tareas complejas | ✅ | Bucle de 5 vueltas, ej. buscar → registrar → nota → tarea |
| 5 | Pedir información adicional | ✅ | `missingParams` + contexto pendiente |
| 6 | Confirmar acciones sensibles | ⚠️ Parcial | Sólo por el clasificador; no en el agente |
| 7 | Respetar permisos del usuario | ⚠️ Parcial | Comprobación por rol sólo en `commandValidator` |
| 8 | Aislamiento multi-tenant | ⚠️ **No demostrado** | `tenantId` viene de sesión/credencial y nunca del modelo, pero el aislamiento depende de que **cada** consulta filtre; el mecanismo de contexto está inerte (§6.1) |
| 9 | No inventar operaciones ni resultados | ✅ | El agente sólo responde si ejecutó herramientas; MCP devuelve resultado real |
| 10 | Informar errores y resultados | ⚠️ Parcial | Errores de herramienta se devuelven al modelo como `{ok:false}` y pueden perderse en el resumen |
| 11 | Trazabilidad de operaciones | ⚠️ Parcial | Auditoría de intención; falta registro por herramienta con argumentos |
| 12 | No romper lo existente | ✅ | El agente sólo entra con verbo de cambio + objeto CRM; el resto sigue igual |

### Cobertura por módulo (chat web)

| Módulo | Consultar | Ejecutar |
|---|---|---|
| Contactos / leads | ✅ | ✅ |
| Tareas / agenda | ✅ (tareas) | ✅ (tareas) |
| Citas / visitas | ⚠️ vía clasificador | ⚠️ vía clasificador |
| Propiedades | ⚠️ vía clasificador (`buscar_inmuebles`) | ❌ |
| Pipeline / deals | ❌ en agente | ❌ |
| Facturación / fiscal | ⚠️ vía clasificador | ⚠️ vía clasificador |
| Informes / KPIs | ❌ | — |

---

## 5. Componentes reutilizables (no duplicar)

| Necesidad | Ya existe | Dónde |
|---|---|---|
| Catálogo de herramientas con JSON Schema | 43 tools MCP | `mcp-server/src/tools-catalog.ts` |
| Ejecución real de operaciones | 191 skills | `lib/skills/index.ts` |
| Identidad y scopes por credencial | `resolveMcpIdentity` | `lib/mcp/request-identity.ts` |
| Aprobaciones con código | flujo completo | `app/api/mcp/approvals/*` |
| Auditoría | `AuditLog`, `chatbotAuditLog` | Prisma + `orchestrator` |
| Rate limit | `rateLimiter`, MCP map | `lib/agents/rate-limiter.ts`, `app/api/mcp/route.ts` |
| Historial de conversación | `ChatChannel`/`ChatMessage` | `lib/chat/gemma-conversations.ts` |
| Modelo con fallback y breaker | `openrouter-client` | `lib/assistant/openrouter-client.ts` |
| UI base | chat con quickReplies | `app/chat/page.tsx` |

Conclusión: **el 80 % de la capa nueva ya está escrito**. Lo que falta no es un
motor nuevo, es exponer a un solo agente las herramientas que ya existen, con
contexto y con control de ejecución.

---

## 6. Limitaciones y riesgos detectados

1. **Dos motores de ejecución** (orquestador web vs `execution-engine` de canales).
   Mantener ambos duplica reglas de permisos y de formato.
2. **Clasificador de 4.162 líneas** con ~130 intenciones: cualquier frase nueva
   exige tocar un fichero enorme y frágil; es la principal fuente de deuda.
3. **Contexto en `chatbotAuditLog`** (tabla de auditoría usada como memoria de
   trabajo, con `tenantId: 'pending'`): mezcla responsabilidades y se pierde a los 5 min.
4. **`tenantId: 'pending'`** en esa fila es un registro con tenant inválido; si
   alguien consulta auditoría por tenant, aparece ruido.
5. **Agente sin permisos**: cualquier usuario autenticado puede ejecutar las 7
   herramientas. Hoy son de bajo riesgo; al abrir facturación o envíos deja de serlo.
6. **Sin idempotencia**: doble clic o reintento del usuario crea dos tareas/notas.
7. **Historial no enviado al modelo**: el agente no puede resolver «el segundo»,
   «esa propiedad», «lo de ayer».
8. **Salida del modelo sin verificación estructurada**: el resumen es texto libre;
   no hay contrato de resultado por operación.
9. **Coste/latencia**: 20 s de presupuesto y hasta 5 vueltas con DeepSeek; sin caché
   de `buscar_persona`, dos mensajes seguidos repiten la búsqueda.
10. **Cobertura de pruebas**: hay suite Vitest amplia (5.200+ pruebas) pero el chat
    conversacional tiene poca cobertura de integración end-to-end con herramientas.

### 6.1 Aislamiento multi-tenant: el mecanismo existe y no se usa

`lib/db.ts` tiene un proxy (`prisma`) que, si hay cliente en el contexto de
`AsyncLocalStorage`, enruta cada modelo operativo al cliente del tenant; si no,
**cae al cliente global**. Ese contexto lo abre `runWithTenant`, y una búsqueda
en `app/`, `lib/` y `middleware.ts` devuelve **una sola aparición: su propia
definición en `lib/db.ts`**. Nadie lo invoca, tampoco el chat
(`app/api/chat/route.ts`, `orchestrator.ts`, `crm-tool-agent.ts`: 0 usos).

Consecuencia: en la práctica todas las queries del chat van al cliente global y
el aislamiento descansa **solo** en que cada `where` incluya `tenantId`. Lo hacen
las que se han revisado (`buscarPersona`, tareas, interacciones, skills con
`tenantId` obligatorio), pero no hay ninguna garantía estructural: una consulta
nueva sin ese filtro filtra datos y ningún test lo detecta.

Por eso el criterio 8 baja de ✅ a **no demostrado** y se convierte en P0:

- Prueba de aislamiento con dos tenants (A y B): listar, leer por id, actualizar,
  borrar y ejecutar herramienta con el tenant de B mientras la sesión es de A;
  todo debe dar vacío/403 y dejar rastro de auditoría.
- Guarda en el ejecutor de herramientas: validar que el registro devuelto
  pertenece al `tenantId` de la sesión antes de responder.
- Decisión de arquitectura: o se activa `runWithTenant` de forma efectiva, o se
  documenta que el modelo es «filtro explícito obligatorio» y se prohíbe en
  revisión cualquier query operativa sin `tenantId` (idealmente con una regla
  automática que lo detecte).

---

## 7. Arquitectura propuesta (sin duplicar)

Las 9 capas del objetivo, mapeadas a lo que ya hay:

| Capa objetivo | Implementación propuesta | Estado |
|---|---|---|
| 1. Conversational Interface | `app/chat/page.tsx` + nuevos bloques de resultado | Reutilizar y ampliar |
| 2. Intent Understanding | Mantener clasificador determinista como *router barato*; el agente con herramientas cubre el lenguaje libre | Reutilizar |
| 3. Context Manager | **Nuevo módulo pequeño** sobre `ChatMessage` (ventana de N turnos + entidades de trabajo), sustituyendo el uso de `chatbotAuditLog` | Construir (≈200 L) |
| 4. Orchestration Engine | `orchestrator.process` + bucle de herramientas existente | Reutilizar |
| 5. Skills / Tool Layer | Un **registro único** que derive de las skills existentes y del catálogo MCP (nombre, esquema, scopes, riesgo, idempotencia) | Construir adaptador |
| 6. Volkern Services & APIs | 191 skills + endpoints ya existentes | Reutilizar |
| 7. Authorization Layer | `commandValidator` + `resolveMcpIdentity`: unificar comprobación **antes** de ejecutar cada herramienta | Extender |
| 8. Execution Feedback | Registro de ejecución por herramienta (`ToolExecution`) con args, resultado, duración, error | Construir (tabla + writer) |
| 9. Observability | `AuditLog` para operaciones, `chatbotAuditLog` para intención, métricas por herramienta | Extender |

Regla de diseño: **el catálogo MCP es la fuente de verdad del esquema**; el chat
consume el mismo catálogo con un adaptador que añade metadatos de riesgo y
permisos. No se crean herramientas nuevas si la skill ya existe.

### Clasificación de riesgo propuesta (una sola tabla)

| Clase | Ejemplos | Comportamiento |
|---|---|---|
| A. Lectura | listar, buscar, informes | Ejecución directa |
| B. Escritura reversible | crear tarea/nota, mover etapa | Ejecución + registro + deshacer cuando exista |
| C. Impacto externo | enviar email/WhatsApp, crear factura | Confirmación + aprobación con código (reutiliza MCP approvals) |
| D. Destructivo | borrar, cancelar factura, cerrar negocio | Confirmación explícita + reautenticación |

---

## 8. Plan de implementación (orden y alcance)

### Etapa 0 — Puerta de aislamiento (medio sprint, antes de tocar producto)
0.1. Suite de dos tenants contra las rutas del chat y del agente: lectura, escritura, actualización y borrado cruzados → vacío/403 + auditoría.
0.2. Comprobar que cada herramienta del agente y skill expuesta filtra `tenantId` (revisión + guarda en ejecución).
0.3. Decidir y ejecutar una de las dos: activar `runWithTenant` en el borde (middleware/route handler) o declarar el filtro explícito como contrato y verificarlo con una regla automática.
0.4. Criterio de salida: la suite falla si alguien añade una query operativa sin `tenantId`.

### Etapa B — Fundamentos (1 sprint)
1. **Context Manager**: ventana de conversación (últimos 10 turnos, resumidos a partir de 20) + `workingEntities` (persona/propiedad/oportunidad activas) en una tabla propia; el agente recibe historial y entidades.
2. **Registro de herramientas del chat** derivado de skills + catálogo MCP, con `scope`, `risk`, `idempotencyKey`.
3. **Permisos antes de ejecutar**: comprobar rol/scope en el ejecutor, no en el prompt.
4. **Registro de ejecución** (`ToolExecution`) con args saneados, resultado y duración.
5. **Idempotencia**: clave `(userId, conversationId, toolName, hash(args))` con TTL 5 min.
6. **Salida estructurada**: el agente devuelve `{acciones: [{tool, registro, resultado}]}` y el render se hace en backend; el texto libre queda como resumen.

### Etapa C — Operaciones y salida legible (1–2 sprints)
7. Exponer al agente, por orden de valor: `list_deals`/`update_deal`, `create_booking`/`cancel_booking`, `search_properties_by_filters`, `get_pending_tasks` (rango), consultas de KPIs.
8. Confirmación de clase C/D con el flujo de aprobaciones MCP (código por WhatsApp ya implementado).
9. Consultas compuestas típicas: «leads sin atender esta semana», «oportunidades estancadas», «propiedades sin actividad» → una herramienta cada una, con SQL explícito y `tenantId` obligatorio.

**P6 — salida estructurada (dentro de esta etapa).** El contrato de respuesta ya
no es texto libre sino
`{ resumen, acciones: [{tool, entidad, id, resultado}], datos: {tipo, filas|items} }`:

- Tablas para listados (leads, oportunidades, tareas, propiedades) con columnas fijas por tipo y enlace al registro.
- Tarjetas de entidad para contacto, propiedad, oportunidad y cita (título, subtítulo, estado, 2–3 campos clave, botón «abrir»).
- Indicador de ejecución por acción: icono + nombre legible + resultado, para que «lo he creado» sea verificable.
- Estados de error por acción, no un mensaje global.
- El renderer vive en `app/chat/page.tsx` y solo pinta el JSON; el texto libre queda como resumen de una línea.

Sin este punto, P1–P5 mejoran el motor pero el usuario sigue leyendo párrafos y no
distingue una operación ejecutada de una sugerencia.

### Etapa D — Orquestación (1 sprint)
10. Planificación multi-paso declarada (no improvisada por el modelo): el agente propone un plan de herramientas y el backend lo valida antes de ejecutar.
11. Unificar el camino de canales: que `telegram-chatbot`/`chatwoot` usen el mismo registro de herramientas en vez de `execution-engine`.

### Etapa E — Inteligencia (1–2 sprints)
12. Bandeja de sugerencias en el chat alimentada por los crons existentes (tareas vencidas, leads sin seguimiento 48 h, oportunidades estancadas), con acción «preparar mensajes» que **prepara** y pide aprobación antes de enviar.
13. Reglas explícitas y auditables (no modelo) para la detección; el modelo sólo redacta.

### Etapa F — Validación
14. Pruebas por capacidad: consulta real por módulo, referencia a mensaje anterior, operación con confirmación, permiso denegado, aislamiento entre dos tenants, reintento idempotente, error de herramienta reportado.
15. Prueba de carga del chat (latencia p95 objetivo < 8 s con una herramienta).

---

## 9. Qué NO hacer

- No crear un segundo catálogo de herramientas: derivar del MCP + skills.
- No añadir intenciones nuevas al clasificador para frases que el agente ya resuelve.
- No reescribir `execution-engine` mientras los canales dependan de él: adaptarlo al registro.
- No dar al modelo IDs de tenant/usuario ni permisos: siempre por cierre desde la sesión.
- No exponer operaciones de facturación o envío sin clase C/D y aprobación.

---

## 10. Riesgos de implementación

| Riesgo | Mitigación |
|---|---|
| Regresión en el chat actual | El agente sólo entra con verbo+objeto CRM; mantener el filtro y cubrirlo con tests |
| Latencia y coste al enviar historial | Ventana corta + resumen; caché de `buscar_persona` por turno |
| Duplicar operaciones por reintentos | Clave de idempotencia en el ejecutor, no en el prompt |
| Permisos inferidos por el modelo | Comprobación en backend con el mismo `scope` que MCP |
| Datos mezclados entre tenants | `tenantId` obligatorio en cada query del registro de herramientas; test de dos tenants |
| Clasificador frágil | No ampliarlo; migrar intenciones a herramientas conforme se cubran |
