# Telegram en Volkern — inventario funcional

> Qué hace hoy el sistema con Telegram: por dónde entra, qué procesa, qué envía
> y cómo se administra. Es el inventario del **código actual** (30 oct 2026),
> no un plan. Las reglas de seguridad de fondo están en
> [TELEGRAM_ARQUITECTURA.md](../documentacion_tecnica/TELEGRAM_ARQUITECTURA.md);
> este documento las da por sabidas y se centra en *qué existe*.
>
> Método: lectura de `lib/telegram*`, `lib/agents/telegram-*`, los webhooks y
> endpoints con Telegram, los emisores de avisos y los tests que los cubren.

---

## 0. Resumen en una tabla

| Capa | Qué hay | Dónde |
|---|---|---|
| **Bots** | Bot del sistema (`volkerncrm_bot`, solo avisos de plataforma) + **un bot propio por tenant** (chatbot y avisos de sus datos) | `lib/telegram.ts`, `lib/telegram/context-resolver.ts` |
| **Entrada** | 3 rutas: webhook directo (pipeline unificado), webhook legacy (gateway+orchestrator), y entrada indirecta vía Chatwoot | `app/api/webhooks/telegram/route.ts`, `app/api/telegram/webhook/route.ts`, `app/api/webhooks/nexus-sync` |
| **Motor** | Chatbot con 138 intents deterministas + tool calling, quick replies, confirmación destructiva, auditoría | `lib/agents/intents/*`, `lib/agents/intent-classifier.ts`, `lib/chat/chatbot-service.ts` |
| **Acciones de chat** | Bandeja de gastos (documentos/OCR), tareas (completar/reprogramar/snooze), aprobación de compras del watchdog, vinculación `/start` | mismo webhook + `lib/telegram/task-*`, `lib/finance/telegram-expense.ts` |
| **Salida** | Notificaciones por tenant con doble guardia; avisos de sistema por el bot del sistema; campañas, automatizaciones y mensajería manual | `lib/skills/notification-layer.ts`, `lib/telegram/developer-notify.ts`, `lib/telegram/rate-limit-alert.ts`, `lib/campaign-engine.ts`, `lib/messaging/unified-sender.ts` |
| **Administración** | Conectar/validar bot, canal, onboarding, alta de partner, prueba de notificación, panel de estado del webhook | `app/api/integraciones/telegram`, `app/api/canales/telegram`, `app/api/onboarding/telegram`, `app/api/admin/tenants/[id]/telegram`, `app/api/webhook-status` |
| **Datos** | `Integration`, `Channel`, `TelegramChatbotConfig`, `User.metadata`, `Conversation`, `ChatbotAuditLog`, `ExpenseInboxDocument`, `Task`, `EqualityConfig` | `prisma/schema.prisma` |

---

## 1. Bots y credenciales

### 1.1 Dos tipos de bot (no intercambiables)

| Bot | Token | Para qué | Qué NO hace |
|---|---|---|---|
| **Bot del sistema** (`volkerncrm_bot`) | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` | Avisos de plataforma al desarrollador: acciones sensibles, abuso del webhook, alertas AEAT/AIOps, estado de conectividad | **No** contesta chatbots ni manda avisos con datos de tenants |
| **Bot del tenant** | `Integration.credenciales.bot_token` (texto plano) o `Channel.config.botToken` (cifrado AES) | Conversación del chatbot de ese tenant **y todos los avisos de sus datos** | No sirve para otro tenant, aunque el chat sea el mismo |

`loadTelegramCredentials(tenantId)` **no** cae en las variables de entorno cuando
recibe `tenantId`: devuelve `{ bot_token: null, admin_chat_id: null }`. El
entorno solo se usa en llamadas **sin** tenant (plataforma).

### 1.2 Funciones de envío

| Función | Archivo | Firma / comportamiento |
|---|---|---|
| `TelegramService.sendMessage` | `lib/telegram.ts` | `(token, chatId, text, extra?)` → POST `sendMessage` con `parse_mode: 'HTML'`; solo adjunta `reply_markup` si viene como `extra.reply_markup` |
| `TelegramService.getMe` | `lib/telegram.ts` | `(token)` → valida el token contra `getMe` |
| `sendTelegramMessage` | `lib/telegram.ts` | `(chatId, message, token?, extra?)`; si no hay token usa `TELEGRAM_BOT_TOKEN` |
| `sendBotMessage` | `lib/telegram/quick-replies.ts` | `(chatId, text, botToken, replyMarkup?)`; trunca a 4000 chars, intenta `Markdown` y reintenta en texto plano si Telegram rechaza el parseo |
| `clearReplyMarkup` | `lib/telegram/quick-replies.ts` | `(chatId, messageId, botToken)` → `editMessageReplyMarkup` vacío tras un click |
| `notifyByTelegram` | `lib/skills/notification-layer.ts` | `(message, context, inlineKeyboard?)`; exige bot propio del tenant y chat vinculado solo a ese tenant |
| `notifyDeveloperSensitiveAction` | `lib/telegram/developer-notify.ts` | Aviso al chat del desarrollador por el bot del sistema (fire-and-forget, sin credenciales) |

### 1.3 Resolución de contexto y vínculos (`lib/telegram/context-resolver.ts`)

| Función | Qué hace |
|---|---|
| `tokenBotDelTenant(tenantId)` | Bot propio del tenant (integración legacy → canal cifrado). Nunca el del entorno |
| `vinculosDelChat(chatId)` | Todos los tenants vinculados a un chat, con la fuente: `integration`, `channel` o `user` |
| `tenantsConBotPropio()` | Tenants que hoy tienen bot configurado (integración o canal) |
| `resolverContextoTelegram(chatId)` | Devuelve `{ tenantId, botToken }` o **`null`**. Un solo vínculo → ese; varios → solo si la conversación previa desempata; sin vínculo → conversación previa o el único tenant con bot; con ambigüedad → `null` |
| `chatVinculadoSoloA(chatId, tenantId)` | Guardia de envío: `false` si el chat pertenece a otro tenant o a varios. Sin vínculos (cliente nuevo) → `true` |
| `desvincularChatDeOtrosTenants(chatId, tenantId)` | «Un chat = un tenant»: limpia el chat de integraciones, canales y usuarios de los demás tenants |
| `vincularChatComoAdmin(chatId, tenantId)` | Guarda el chat como `admin_chat_id` del tenant (integración o canal) y desvincula del resto |

---

## 2. Entrada: las tres puertas

### 2.1 `POST /api/webhooks/telegram` — el pipeline real

Es el endpoint que usa el bot del tenant para hablar con Volkern
(`app/api/webhooks/telegram/route.ts`). Cadena de guardas, en orden:

0. **Cabecera `X-Telegram-Bot-Api-Secret-Token`** (`lib/telegram/webhook-secret.ts`): si el bot se registró con `secret_token`, el secret identifica **al bot y con él al tenant**, y ese contexto se usa para todo el update (chat, tenant, token de respuesta, `/start` y aprobación de compras). Cabecera que no corresponde a ningún bot → **401**. Sin cabecera se mantiene la resolución por vínculos; con `TELEGRAM_WEBHOOK_REQUIRE_SECRET=true` el update sin cabecera válida también se rechaza. Antes de verificar hay un **cortafuegos por IP** (`lib/telegram/webhook-secret-rate-limit.ts`): con `TELEGRAM_SECRET_MAX_FALLOS` fallos (5) en 60 s, la IP recibe **429 + `Retry-After: 600`** sin verificar el secret, es decir sin tocar la base.
1. **`callback_query` de un bot o `update_id` ya procesado** → se ignora (`is_bot`, dedupe de 30 s).
2. **Rate-limit por chat** (`lib/telegram/chat-rate-limit.ts`, Redis `SET PX NX` con fallback en memoria, ventana 1,5 s) → responde **429 + `Retry-After: 2`** para que Telegram reintente; el update **no** se marca como procesado.
3. **Documentos o fotos** → bandeja de gastos (`ingestTelegramDocument` → S3 + `ExpenseInboxDocument`). Exige contexto resuelto exacto.
4. **Texto** → comandos (`/gasto_corregir`, `/gastos_pendientes`, `/gastos_descartados`, `/start`), o pipeline unificado.
5. **Pipeline unificado** (`lib/chat/chatbot-service.ts`, `processMessage`) con timeout de **25 s** (Telegram corta a los 30) y un mensaje de disculpa si se pasa.

Lo que devuelve el pipeline al chat:

- `response` → texto de la respuesta.
- `quickReplies[]` → `inline_keyboard` nativo (`buildQuickReplyMarkup`, máximo 8 botones, `callback_data` `qr:<texto>`).
- `taskButtons[]` → fila de acciones por tarea (`buildTaskButtonsMarkup`), que **tiene prioridad** sobre los quick replies.

### 2.2 `POST /api/telegram/webhook?tenantId=&token=` — gateway legacy

Ruta por tenant (`app/api/telegram/webhook/route.ts`) que usa `TelegramGatewayAgent`
+ `TelegramChatbot` + `orchestrator` (7 agentes de seguridad). Exige
`TelegramChatbotConfig` activa para ese tenant y, si `webhookUrl` tiene token, lo
compara. **No es la ruta que usa el pipeline actual** y no se registra desde los
flujos de conexión; queda para pruebas y para el `GET` de diagnóstico.

`GET` de la misma ruta (**exige sesión de superadmin**, ver más abajo):

| `action` | Qué hace |
|---|---|
| `status` | `isActive`, `webhookUrl`, token enmascarado (`***últimos4`) |
| `setWebhook` | **Retirado**: responde 409 con el motivo y no toca el bot |
| (sin acción) | Devuelve configuración del chatbot (bienvenida, fallback, contexto, sesión) |

**Por qué exige superadmin y ya no registra nada.** Este `GET` no es un webhook: es una acción de
administración sobre el bot de un tenant. Antes no pedía sesión —solo el `tenantId` de la URL— y
`setWebhook` re-registraba el webhook apuntándolo a esta misma ruta, así que cualquiera que conociera
o adivinara el id podía dejar al pipeline unificado sin recibir updates (y `status` devolvía los
últimos cuatro caracteres del token). El registro se hace con
`scripts/register-telegram-webhooks.ts`, que omite los bots que apuntan a otra dirección.
Guardián: `tests/telegram-legacy-webhook-get.test.ts`.

### 2.3 Entrada indirecta por Chatwoot (hub de comunicaciones)

Cuando el tenant usa el hub, Telegram **no** habla directamente con Volkern:

```
Telegram ──► Chatwoot (inbox Telegram del tenant) ──► POST /api/webhooks/nexus-sync ──► conversación
Volkern  ──► Chatwoot API ──► Telegram
```

- `lib/messaging/strategy.ts` decide `NEXUS` (hub) o `DIRECT` (API de Telegram directa).
- `lib/messaging/unified-sender.ts` envía por canal; en Telegram, ruta directa con el bot del tenant.
- `lib/campaign-channels.ts` incluye `telegram` como canal de campaña; `lib/campaign-engine.ts` intenta primero Chatwoot (`hubConfig.telegramInboxId`) y cae al envío directo **solo con bot propio del tenant**.

### 2.4 Tabla comparativa

| | Directo `/api/webhooks/telegram` | Legacy `/api/telegram/webhook` | Hub Chatwoot |
|---|---|---|---|
| Quién lo registra | Script / operación manual | Ya no se registra desde aquí | Se configura al conectar el canal |
| Resolución de tenant | Por vínculo/estricta | `?tenantId=` explícito | Inbox del tenant |
| Rate-limit | Sí (Redis, 429) | Rate limiter del agente | Del hub |
| Bandeja de gastos | Sí | No | No |
| Quick replies / botones de tarea | Sí | Solo Markdown | Botones nativos de Chatwoot |
| Motor | `chatbot-service` | `TelegramChatbot` + `orchestrator` | `chatwoot-chatbot-handler` |

---

## 3. Comandos y botones que entiende el bot

### 3.1 Comandos de texto

| Comando | Qué hace | Permisos |
|---|---|---|
| `/start` | Reafirma el vínculo como `admin_chat_id` del tenant | Cualquiera; resuelve tenant estricto |
| `/start a_<token>` | Vincula el chat como `admin_chat_id` del tenant y gasta el token | Requiere el token de un solo uso del panel |
| `/start <tenantId>` | **Retirado**: responde con instrucciones y no vincula nada | — |
| `/start u_<userId>_<token>` | Vincula el chat al **usuario** (QR del perfil) validando token one-time | Requiere `metadata.telegram_link_token` vigente |
| `/gasto_corregir <doc> <campo> <valor>` | Corrige un campo del OCR: proveedor, nif, factura, fecha, vencimiento, total, base, iva, recargo, irpf, moneda, pago, operacion | Contexto resuelto |
| `/gastos_pendientes` | Lista hasta 8 documentos pendientes con botón para abrir cada uno | Contexto resuelto |
| `/gastos_descartados` | Lista hasta 8 documentos descartados para consultar/restaurar | Contexto resuelto |
| `/fiscal_status` | Informe de salud fiscal (AEAT) en vivo | Solo ruta legacy |
| `/fiscal_retry_failed` | Reintenta facturas fallidas | Solo ruta legacy |
| `/fiscal_ack` | Reconoce alertas fiscales | Solo ruta legacy |
| `/fiscal_ai_forecast` | Pronóstico del motor fiscal | Solo ruta legacy |

### 3.2 `callback_data` (botones inline)

| Prefijo | Acciones | Límite de permisos |
|---|---|---|
| `qr:<texto>` | Quick reply del chatbot: reenvía el texto al pipeline y limpia el teclado | Contexto resuelto |
| `inbox:view\|scan\|confirm\|review\|discard\|discard_confirm\|restore:<doc>` | Bandeja de gastos | Documento del tenant resuelto |
| `task:complete:<task>` | Completa la tarea (`skills.complete_task`) | Tarea del tenant |
| `task:resched:<task>` | Pide fecha (abre calendario) | — |
| `task:cal:<task>:<YYYY-MM>` | Navega el mes del calendario inline | — |
| `task:date:<task>:<YYYY-MM-DD\|cancel>` | Reprograma la tarea | Tarea del tenant |
| `task:snooze:<task>` | Ofrece mañana / +3 / +7 días | — |
| `task:snoozeDate:<task>:<manana\|d3\|d7\|cancel>` | Pospone el aviso sin cambiar la fecha real | Tarea del tenant |
| `auth_buy:<item>:<tenant>` / `reject_buy:…` | Autoriza o rechaza la compra propuesta por el watchdog (crea el gasto o solo marca el mensaje) | Solo ADMIN del tenant vinculado por `metadata` o `admin_chat_id` |
| `admin_buy:…` | Mismo flujo de aprobación de compras (documentado en la cabecera del webhook) | ADMIN |

Construcción de teclados:

- `lib/telegram/task-buttons.ts` → `buildTaskActionRow(taskId)`, `buildTaskButtonsMarkup(tasks, maxRows = 8)`.
- `lib/telegram/task-calendar.ts` → `buildTaskCalendarMarkup(taskId, year, month)` (semana desde lunes, navegación ◀/▶, botón Cancelar).
- `lib/telegram/quick-replies.ts` → `buildQuickReplyMarkup`, `parseQuickReplyCallback`.

---

## 4. Bandeja de gastos por Telegram

Flujo completo, todo dentro del webhook directo:

1. **Ingesta**: el admin manda PDF o foto → se sube a S3 y se crea `ExpenseInboxDocument` (estado pendiente). Se exige que el chat sea el `admin_chat_id` exacto del tenant (`findTelegramAdmin`).
2. **OCR**: `processInboxOcr` usa `callVision` (escaneo de gastos) y rellena los datos extraídos.
3. **Resumen**: `buildTelegramExpenseSummary` (`lib/finance/telegram-expense.ts`) muestra archivo, páginas, estado y campos detectados.
4. **Acciones por botón**: escanear, confirmar gasto, marcar en revisión, descartar (con confirmación), restaurar.
5. **Confirmar** → `confirmInboxExpense` crea el gasto real en el ERP.
6. **Corrección**: `/gasto_corregir` reescribe un campo puntual antes de confirmar.
7. **Estados**: solo se puede descartar/restaurar según `canDiscardTelegramExpenseStatus` / `canRestoreTelegramExpenseStatus` (evita transiciones ilegales).

Helpers asociados: `parseTelegramInvoiceDate`, `parseTelegramNumber`, `isTelegramCommand`.

---

## 5. Tareas accionables desde el chat

| Capacidad | Cómo |
|---|---|
| Aviso de tarea vencida | `lib/cron/task-overdue-jobs.ts` (cron): chat del asignado (`metadata.telegram_chat_id`) o admin del tenant; marca `avisoVencimientoEnviado` para no repetir |
| Completar con un toque | Botón `task:complete` → `skills.complete_task` |
| Reprogramar | Botón → calendario inline → `skills.reschedule_task` |
| Posponer el recordatorio (snooze) | Botón → `skills.snooze_task` (no cambia la fecha real de la tarea) |
| Contexto de dos turnos | `telegram:<chatId>` como `conversationId`, con memoria en `Conversation`/`Message` |

Tests que lo fijan: `telegram-task-calendar.test.ts`, `task-overdue-notification.test.ts`,
`process-message-task-buttons.test.ts`, `reprogramar-tarea.test.ts`,
`telegram-two-turns-context.test.ts`.

---

## 6. Motor conversacional (lo que el bot puede hacer)

- **138 intents** en `lib/agents/intents/*` (13 archivos temáticos: CRM 37, finanzas 19, ERP 14,
  marketing 14, fábrica 11, seguros 8, logística 7, inmobiliario 6, web-creator 6,
  RRHH avanzado 5, operaciones 4, gobernanza RRHH 4, RRHH 3).
- **Clasificación determinista** (regex, sin LLM) en `lib/agents/intent-classifier.ts`; el LLM
  queda como respaldo.
- **Wiring** intent → skill en `lib/agents/skill-orchestrator.ts` (`INTENT_TO_SKILL`).
- **Confirmación destructiva**: los intents `destructive: true` no se ejecutan sin un *sí*
  explícito; un *no* deja rastro `BLOCKED_SECURITY`.
- **Permisos por módulo del tenant**: sin el módulo, responde "No tienes acceso" y no ejecuta.
- **Auditoría**: cada turno en `ChatbotAuditLog` (`telegramUserId`, `intent`, `skillExecuted`,
  `status`, `inputRaw`, tiempos).
- **Resolución de usuario real**: `lib/skills/index.ts` traduce `telegram:<chatId>` al `User`
  del tenant por `metadata.telegram_chat_id`, para que `asignadoA`, auditoría y permisos
  apunten a una persona y no a un id de chat.
- **Canal**: `lib/chat/chatbot-service.ts` acepta `channel: 'whatsapp' | 'telegram' | 'web' | 'api'`;
  Telegram entra con rate-limit propio del chatbot además del de transporte.

Herramienta de auditoría del entrenamiento: `scripts/audit-telegram-training.mjs`.

---

## 7. Salida: notificaciones y avisos

### 7.1 Camino canónico por tenant

`notifyByTelegram()` → `notificationService.send(..., { channel: 'telegram' })`, que:

1. exige `context.tenantId`;
2. exige **bot propio** del tenant (`loadTelegramCredentials(tenantId).bot_token`);
3. resuelve el chat: destinatario → `admin_chat_id` del tenant;
4. aplica `chatVinculadoSoloA(chatId, tenantId)` y **no envía** si el chat pertenece a otro
   tenant o a varios;
5. adjunta teclado (`inlineKeyboard` con `callback_data`, o `actions` como botones URL).

`notifyUser()` usa in-app + Telegram cuando el usuario tiene `metadata.telegram_chat_id`.

### 7.2 Módulos que hoy emiten por Telegram

| Módulo | Archivo | Disparador |
|---|---|---|
| Pipeline de ventas | `lib/sales/pipeline-watchdog.ts` | Oportunidad parada / sin actividad |
| Orquestador de acciones | `lib/sales/action-orchestrator.ts` | Acción de seguimiento asignada |
| Morning briefing | `lib/sales/morning-briefing-service.ts` | Resumen diario del comercial (con botones de tarea) |
| Citas | `lib/services/appointments.ts` | Cita creada/cancelada (aviso al admin) |
| Mantenimiento | `lib/erp/maintenance-service.ts` | Orden de mantenimiento |
| Producción | `lib/erp/production-service.ts` | Alerta VISION-LOCK / rechazo de integridad |
| Inventario | `lib/skills/inventory-watchdog.ts` | Stock bajo / anomalía |
| Auditoría | `lib/skills/audit-skills.ts` | Hallazgo crítico (envío directo al admin) |
| Comunicación de automatizaciones | `lib/automation/actions/communication.ts` | Acción `sendTelegram` de un flujo |
| Campañas | `lib/campaign-engine.ts` | Envío de campaña por canal Telegram |
| Mensajería manual | `app/api/mensajes/enviar/route.ts` | Mensaje del hub de comunicaciones |
| Mensajería unificada | `lib/messaging/unified-sender.ts` | `channel: 'telegram'` en estrategia DIRECT |
| Citas/acciones de agentes | `lib/event-engine/action-registry.ts` | Acción registrada por evento |
| Notificaciones Apprise | `lib/notifications/apprise-service.ts`, `lib/services/push-notification.ts` | Canal `telegram://<token>/` de Apprise |
| Igualdad | `app/api/equality/config/test/route.ts` + `EqualityConfig.telegramBotToken/telegramChatId` | Prueba de configuración de cumplimiento |

### 7.3 Avisos de sistema (bot del sistema, nunca datos de tenant)

| Aviso | Archivo | Cuándo |
|---|---|---|
| Acción sensible | `lib/telegram/developer-notify.ts` (usado por `app/api/integraciones/*`, `app/api/admin/conectividad/*`) | Conectar/desconectar integraciones, reiniciar métricas |
| Posible abuso del webhook | `lib/telegram/rate-limit-alert.ts` | >10 rechazos 429/hora por chat (dedupe por hora, umbral `RATE_LIMIT_ALERT_THRESHOLD`) |
| Incidentes fiscales | `lib/fiscal/aeat/incident-service.ts`, `lib/fiscal/aeat/ai-ops-service.ts`, `lib/queues/aeat-queue.ts` | Alta/resumen de incidentes AEAT y cola |
| Estado de conectividad | `app/api/admin/conectividad/route.ts`, `.../test`, `.../divergencias` | Pruebas y divergencias de OTA/PMS |

### 7.4 Métricas y panel

`app/api/webhook-status` (`GET`, `POST` y `DELETE`):

- `GET`: métricas de rate-limit (`getRateLimitMetrics`): hoy por canal, top chats, últimos 7 días,
  último rechazo; resuelve nombre de cada chat con `resolveChatIdentities` (`lib/telegram/chat-resolver.ts`),
  que mapea Telegram por usuario vinculado → lead → conversación, y WhatsApp por teléfono.
  Incluye `secretLimit` (`getSecretLimitMetrics`): IPs **bloqueadas** por secret inválido con su
  cuenta atrás e IPs con **fallos** aún sin bloqueo; el panel las muestra bajo
  «Secret del webhook (por IP)».
  Incluye `historial`: una **página** de las acciones hechas desde el panel leídas de `auditLog`
  (`telegram_secret_ip_desbloqueada` y `webhook_metrics_reset`), con autor (nombre → email →
  metadata), fallos descartados y fecha; el panel las muestra en «Últimas acciones (auditoría)».
  Si la consulta falla, `historial` va vacío y el resto del estado se sirve igual.
- **Paginación por cursor** del historial (no una ventana fija): orden `fechaCreacion desc, id desc`
  —dos acciones en el mismo segundo no se pierden ni se repiten— y `?cursor=<id de auditLog>&limite=<n>`
  (8 por defecto, tope 50). La respuesta trae `historialCursor` (id de la última acción devuelta, `null`
  en la última página) e `historialHayMas`; el panel guarda una pila de cursores para «Anterior» / «Siguiente»
  y la reinicia al cambiar de filtro. Sin filtro por autor se pide `limite + 1` filas de una vez: la de
  más solo sirve para saber si hay página siguiente.
- Filtros del historial, aplicados **en el servidor** (filtrar en cliente una página ya recortada no
  encontraría casi nada): `?accion=desbloqueo|reinicio` (o el nombre crudo de la acción) y `?autor=…`,
  coincidencia parcial sin mayúsculas ni acentos sobre nombre, email o autor de la metadata. Con `autor`
  la criba es en memoria y se leen bloques de 20 hasta llenar la página o agotar **100** filas por
  petición. Un filtro que no se reconoce se ignora y la respuesta devuelve `historialFiltros` con lo
  realmente aplicado, para que el panel no mienta sobre lo que está filtrando.
- `POST`: reinicia las métricas del día y **avisa al desarrollador por Telegram** con el resumen previo.
- `DELETE ?ip=…`: **desbloquea a mano** una IP del cortafuegos de secret (solo admin). Borra la marca
  de bloqueo **y** el contador de fallos de la ventana; si solo se quitara el bloqueo, el siguiente
  secret inválido de esa misma IP la volvería a cortar al instante. Cada desbloqueo efectivo queda en
  `auditLog` (`accion='telegram_secret_ip_desbloqueada'`, `entidad='webhook-secret-limit'`,
  `entidadId=<ip>`) con quién lo hizo, desde qué IP y cuántos fallos se descartaron. Un `DELETE` sobre
  una IP sin bloqueo ni fallos responde `ok` con `desbloqueada: false` y **no** escribe auditoría.
  En el panel, el botón «Desbloquear» solo aparece para admins.

---

## 8. Vinculación del chat de administración (avisos de la empresa)

1. En Ajustes → Integraciones → Telegram, el administrador pulsa «Vincular este chat». El panel llama a
   `POST /api/integraciones/telegram/enlace-admin`.
2. El servidor genera un token de **32 hex** con caducidad de **15 minutos**
   (`lib/telegram/admin-link.ts`) y lo guarda junto al futuro `admin_chat_id`: en las credenciales de la
   integración o en la config del canal de Telegram, sin modelo ni migración nuevos. Regenerar invalida
   el anterior: solo hay un enlace vivo por tenant. Con el token se guarda también quién lo pidió
   (`admin_link_solicitado_por`), que se gasta junto con él y que solo existe para la auditoría.
3. El panel muestra `https://t.me/<bot>?start=a_<token>` (y su QR). El administrador lo abre e inicia el bot.
   Antes de ofrecer el enlace, el diálogo consulta `GET /api/integraciones/telegram/enlace-admin` y avisa
   si la cuenta **ya tiene un chat vinculado**, con la fecha (`admin_chat_vinculado_en` /
   `adminChatVinculadoEn`) y el chat enmascarado. Los vínculos anteriores a esa marca se muestran sin
   fecha, no con una inventada.
4. El webhook valida el token **antes** de tocar nada; si el secret del bot identifica a otro tenant, no
   vincula. Después llama a `vincularChatComoAdmin` (un chat = un tenant), que sella la fecha del vínculo,
   y **gasta** el token.
5. Antes este paso era `/start <tenantId>`: el id de una empresa no es un secreto, así que cualquiera que
   lo conociera podía mover un chat de espacio de trabajo y quedarse con los avisos de esa cuenta. Ese
   formato ya no vincula (`tests/telegram-admin-link.test.ts`, `tests/telegram-enlace-admin-route.test.ts`).

   Límite conocido: **un chat sigue siendo de un solo tenant**. Si un administrador necesita recibir
   avisos de dos empresas, necesita dos chats (o dos cuentas de Telegram).

6. Desvincular: el mismo bloque de estado ofrece «Desvincular este chat», con confirmación (AlertDialog).
   El panel llama a `DELETE /api/integraciones/telegram/enlace-admin`, que borra `admin_chat_id` /
   `adminChatId`, su marca de fecha y **también el enlace pendiente** (para que uno generado antes de la
   baja no vuelva a enganchar el chat). Es idempotente: sin chat responde `{ desvinculado: false }` y no
   escribe. No toca los vínculos personales (`User.metadata.telegram_chat_id`), que se gestionan en el
   perfil de cada usuario.
7. **Auditoría** (`lib/telegram/admin-chat-audit.ts`). Las dos acciones dejan fila en `auditLog` con el
   `tenantId`, quién la hizo y `fechaCreacion` (además de la fecha ISO dentro del snapshot):
   - `accion='telegram_admin_chat_vinculado'`, `entidad='telegram_admin_chat'`, `entidadId=<chatId>`.
     `userId` es el administrador que **pidió el enlace**; el snapshot guarda además la cuenta de Telegram
     que lo pulsó (`from.id`, `username`, nombre visible), que es el actor real del vínculo y no un
     usuario del panel.
   - `accion='telegram_admin_chat_desvinculado'`, con `userId` de quien da la baja y, en `cambiosAntes`,
     el chat que se quitó y la fecha en la que estaba vinculado.

   Se escribe desde la ruta (`DELETE`) y desde el webhook (`/start a_`), porque cada una es la única que
   conoce a su actor. Es defensiva: si `auditLog` falla, el vínculo o la baja ya hechos siguen en pie (el
   webhook y la ruta ni siquiera convierten el fallo en error de respuesta). El `/start` sin argumentos,
   que solo reafirma un vínculo existente, **no** genera filas de auditoría.

---

## 8 bis. Vinculación de usuario (notificaciones personales)

1. El perfil genera un QR/enlace `/start u_<userId>_<token>` con token one-time
   (`User.metadata.telegram_link_token`).
2. El usuario pulsa: el webhook valida usuario + token **antes** de tocar nada.
3. Guarda `metadata.telegram_chat_id` y `metadata.telegram.chat_id` + `linkedAt`, y consume el token.
4. Desvincula el chat de cualquier otro tenant (`desvincularChatDeOtrosTenants`).
5. Confirma por el bot del tenant.
6. A partir de ahí, `notifyUser`, `task-overdue-jobs` y la resolución de usuario del chatbot
   encuentran a la persona detrás del chat.

---

## 9. Administración y configuración

| Endpoint | Métodos | Qué hace |
|---|---|---|
| `/api/integraciones/telegram` | `GET` / `POST` / `DELETE` | Estado de la integración (canal cifrado o legacy); `POST` valida el token con `getMe`, cifra el `botToken`, crea/asegura cuenta e inbox de Telegram en Chatwoot y guarda canal + hub config; `DELETE` la elimina |
| `/api/canales/telegram` | `GET` / `PATCH` | Estado del canal y activación/desactivación |
| `/api/onboarding/telegram` | `GET` / `POST` | Alta guiada: valida token, provisiona Chatwoot, guarda config |
| `/api/integraciones/telegram/enlace-admin` | `GET` / `POST` / `DELETE` | `GET`: estado del chat de administración (`vinculado`, `chatId`, `desde`, `botUsername`; estado vacío si aún no hay bot). `POST`: enlace de un solo uso (`a_<token>`, 15 min) para vincular el chat de la empresa. `DELETE`: desvincula el chat e invalida el enlace pendiente (`{ desvinculado: boolean }`, idempotente). Vínculo y baja quedan en `auditLog` con tenant, actor y fecha. Los tres exigen rol de administración (403 si no) |
| `/api/admin/tenants/[id]/telegram` | `POST` | Superadmin conecta Telegram a un partner creado sin bot (`{ botName, botToken }`); errores tipados (409 sin Chatwoot, 422 token inválido…) |
| `/api/test/telegram-notification` | `POST` / `GET` | Envía una notificación de prueba |
| `/api/chatbot/analytics/notifications-config` | `GET` / `PUT` / `POST` | Canales de alertas de patrones (`in_app` / `telegram` / `email`) y prueba de envío |
| `/api/webhook-status` | `GET` / `POST` / `DELETE` | Métricas de webhook, reinicio con aviso y desbloqueo manual de IP (`?ip=`) |
| `/api/telegram/webhook` | `GET` | Diagnóstico de la ruta legacy (**superadmin**); `setWebhook` retirado |

El paso de Telegram del onboarding rápido (`app/dashboard/onboarding-quick/page.tsx`) explica sus **dos**
funciones —avisos (briefing, oportunidades en riesgo, tareas y compras) y **operación del CRM por chat**
(gastos, citas, consultas de leads)—, dice quién recibe cada aviso (empresa → chat de administración;
persona → su chat vinculado) y ofrece «Configurar más tarde», que **anota la omisión**, **completa el
alta** y remite a Integraciones → Telegram. Guardián: `tests/onboarding-telegram-paso.test.tsx`.

Recordatorio descartable en el panel (`components/dashboard/TelegramReminder.tsx`, solo en
`/dashboard`): aparece si `configuracion.onboarding.telegramOmitidoEn` existe, el tenant **sigue sin
bot** (ni canal ni integración) y **no hay un descarte ni un silencio vigentes**
(`telegramAvisoDescartadoEn`, `telegramAvisoSilenciadoEn`). Las dos acciones se guardan en el
servidor, no en `localStorage`, así que no reaparecen al recargar ni las ve cada persona de la
empresa por separado.

El texto dice **cuánto lleva pendiente** desde la omisión («hace unas horas», «hace 12 días», «hace un
mes», «hace más de un año»), calculado en el cliente a partir de `telegramOmitidoEn`; con una fecha
ausente o ilegible el aviso se muestra sin la antigüedad en vez de inventarla.

**Dos formas de ocultarlo, y las dos caducan**: la X («descartar»,
`POST /api/onboarding/quick { step: 'dismiss-telegram-reminder' }`) lo oculta **30 días**
(`DIAS_DESCARTE_RECORDATORIO_TELEGRAM`) y el enlace «Silenciar 7 días» (`step:
'snooze-telegram-reminder'`) lo oculta **7** (`DIAS_SILENCIO_RECORDATORIO_TELEGRAM`), para quien no
quiere cerrarlo del todo. Pasado el plazo, si sigue sin bot, el aviso vuelve una vez; volver a
pulsar cualquiera de las dos reinicia su cuenta. Las marcas de descarte y silencio **sí** se
reescriben, la de omisión **no**: interesa desde cuándo está pendiente. Sin esa caducidad, quien
cerró el aviso el primer día no lo volvía a ver nunca. Una marca ilegible cuenta como caducada: no
silencia el aviso para siempre. `GET /api/onboarding/quick` devuelve ya resueltos
`telegramAvisoDescartado` y `telegramAvisoSilenciado` (vigentes o no), además de `telegramOmitido` y
`telegramConnected`. Guardianes: `tests/telegram-reminder.test.tsx` y
`tests/onboarding-quick-telegram-recordatorio.test.ts`.

Interfaz: `app/dashboard/integraciones/page.tsx`, `app/dashboard/onboarding-quick/page.tsx`,
`components/dashboard/notifications/NotificationConfig.tsx`,
`components/dashboard/WebhookStatusPanel.tsx`, perfil con QR
(`components/hubs/PerfilDashboard.tsx`),
`app/admin/tenants/[id]/page.tsx` y `app/admin/partner-onboarding/*` (alta con bot),
`components/admin/AltaHospitalityPaso.tsx` (alta de hospitality con bot).

Flags/planes: `Tenant.telegramHabilitado` (default `false`), feature `telegram` en
`lib/plans.ts` (grupo «Integraciones»), `lib/subscription.ts`.

---

## 10. Datos que toca Telegram

| Modelo | Campos relevantes | Uso |
|---|---|---|
| `Integration` (`tipo: 'telegram'`) | `credenciales.bot_token`, `credenciales.admin_chat_id` | Conexión legacy del tenant |
| `Channel` (`type: 'telegram'`) | `config.botToken` (cifrado), `config.adminChatId`, `chatwootInboxId` | Conexión moderna + inbox del hub |
| `TelegramChatbotConfig` | `botToken`, `isActive`, `welcomeMessage`, `fallbackMessage`, `maxContextMessages`, `sessionTimeoutMinutes`, `webhookUrl` | Config del chatbot de la ruta legacy |
| `User.metadata` | `telegram_chat_id`, `telegram.chat_id`, `telegram_link_token`, `telegram.linkedAt` | Vinculación de persona ↔ chat |
| `Conversation` | `canal: 'telegram'`, `externalRef: 'telegram:<chatId>'`, `contactoNombre` | Memoria del chatbot y desempate de tenant |
| `ChatbotAuditLog` | `telegramUserId`, `intent`, `skillExecuted`, `status`, `inputRaw` | Auditoría de cada turno |
| `ExpenseInboxDocument` | `status`, `extractedData`, `pageStart/pageEnd`, `errorMessage` | Bandeja de gastos |
| `Task` | `asignadoA`, `avisoVencimientoEnviado`, `recordatorioPospuestoHasta` | Avisos, botones y snooze de tarea |
| `EqualityConfig` | `telegramBotToken`, `telegramChatId` | Avisos del canal de igualdad |

---

## 11. Variables de entorno

```env
TELEGRAM_BOT_TOKEN=        # bot del SISTEMA (avisos de plataforma)
TELEGRAM_ADMIN_CHAT_ID=    # chat del desarrollador
RATE_LIMIT_ALERT_THRESHOLD # opcional, umbral de abuso (default 10/hora)
```

Además: `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` (URL del webhook y del retorno de Chatwoot).

---

## 12. Scripts operativos

| Script | Para qué |
|---|---|
| `scripts/register-telegram-webhooks.ts` | **Registro con `secret_token` por tenant** (`--all` o `--tenant <id>`, `--apply` para ejecutar, `--force` para pisar otra URL). Sin `--apply` solo muestra el plan; omite los bots que apuntan a otra URL (p. ej. inbox de Chatwoot) y verifica con `getWebhookInfo` |
| `scripts/register-telegram-webhook.ts` | Registro manual de **un solo** bot, sin `secret_token` (queda para diagnósticos; usar el script de arriba) |
| `scripts/diagnose-telegram-link.ts` | Diagnostica por qué un `/start` no vinculó el chat |
| `scripts/check-tg-*.ts`, `scripts/check-telegram-*.js`, `scripts/get-tg-updates.js`, `scripts/update-telegram-db.js` | Inspección manual de webhook, updates y vínculos |
| `scripts/audit-telegram-training.mjs` | Recuento y consistencia de intents del entrenamiento |
| `scripts/test-webhook-local.js` | Simula un update contra el webhook legacy local |
| `scripts/verify-tg-*.ts` | Verificación de dispatch y respuestas |

---

## 13. Cobertura de tests

`tests/telegram-context-resolver.test.ts`, `telegram-webhook-userid.test.ts`,
`webhook-telegram.test.ts`, `telegram-security.test.ts`,
`telegram-notificaciones-aisladas.test.ts`, `telegram-inline-buttons.test.ts`,
`telegram-task-calendar.test.ts`, `telegram-user-resolve.test.ts`,
`telegram-two-turns-context.test.ts`, `add-telegram-channel.test.ts`,
`task-overdue-notification.test.ts`, `process-message-task-buttons.test.ts`,
`reprogramar-tarea.test.ts`, `contabilidad-telegram.test.ts`,
`impuestos-telegram.test.ts`, `block25-sales-telegram.integration.test.ts`,
`rate-limit-alert.test.ts`, `rate-limit-metrics.test.ts`,
`developer-notify.test.ts`, `integration-handler.test.ts`,
`telegram-webhook-secret.test.ts`, `telegram-webhook-secret-header.test.ts`,
`telegram-webhook-secret-ip-limit.test.ts`, `telegram-notificaciones-inline.test.ts`.

---

## 14. Límites conocidos, defectos y correcciones recientes

1. ✅ **Ambigüedad de bot — resuelta por `secret_token` (30 oct 2026).** Todos los bots siguen
   apuntando a `/api/webhooks/telegram`, pero cada uno puede registrarse con un `secret_token`
   derivado de su token; Telegram lo entrega en `X-Telegram-Bot-Api-Secret-Token` y el webhook
   resuelve el tenant por ese header (401 si no corresponde a ningún bot). Registro:
   `npx tsx scripts/register-telegram-webhooks.ts --all --apply`. Para exigir la cabecera:
   `TELEGRAM_WEBHOOK_REQUIRE_SECRET=true`. La resolución se cachea en Redis
   (`telegram:webhook-secret:v1:<hash>` → solo el `tenantId`; 10 min para un secret válido y 60 s
   para uno desconocido, con fallback en memoria): un update normal no recorre la lista de bots y
   el token del bot nunca se guarda en la caché. **Pendiente operativo:** ejecutar el registro y
   activar la variable; hasta entonces los bots sin secret siguen resolviéndose por vínculo + historial.
2. ✅ **Teclados inline — corregido el 30 oct 2026.** `NotificationService.sendTelegram`
   pasaba el `inline_keyboard` suelto como 4.º argumento, pero
   `TelegramService.sendMessage` solo lee `extra.reply_markup`: los avisos con botones
   (morning briefing, acciones de tarea) salían **sin** teclado. Ahora se envían como
   `{ reply_markup }`, igual que el cron de tareas. El watchdog de inventario tenía el
   mismo fallo en los botones «Autorizar compra / Rechazar» y también está corregido.
   Guardián: `tests/telegram-notificaciones-inline.test.ts`.
3. ✅ **`TelegramWatchdog` no enviaba nada — corregido el 30 oct 2026.** Llamaba a
   `loadTelegramCredentials()` sin tenant, comprobaba `creds.chatId` (campo que no existe) y pasaba
   `sendTelegramMessage({ tenantId, text, parseMode })` con un objeto donde va el `chatId`, así que
   los *security briefs* de RRHH/nómina y la alerta de lead nuevo (`app/api/public/leads/route.ts`)
   nunca llegaban. Ahora `credencialesDelTenant(tenantId)` exige **bot propio** y **chat de
   administración del tenant**, comprueba que el chat está vinculado solo a él
   (`chatVinculadoSoloA`) y envía con `sendBotMessage` —Markdown con reintento en texto plano—, porque
   `sendTelegramMessage` fija `parse_mode: 'HTML'` y las marcas `*negrita*`/`_cursiva_` del brief
   saldrían literales. Un envío fallido ya no se registra como hecho en `SystemAlert`.
   Guardián: `tests/telegram-watchdog-envio.test.ts`.
4. **Dos rutas de entrada con motores distintos.** La legacy (`/api/telegram/webhook`) sigue
   expuesta con otro motor y sin bandeja de gastos. Su `GET` ya exige superadmin y **no** puede
   registrar un webhook apuntándose a sí misma; falta decidir si se retira por completo (su `POST`
   sigue aceptando updates de los bots que aún apunten ahí, así que antes hay que comprobar con
   `getWebhookInfo` que ninguno lo hace).
5. **Resuelto: `/start <tenantId>` ya no vincula.** El vínculo del chat de administración pasa por el
   token de un solo uso del panel (`/start a_<token>`). Queda como límite de producto que un chat solo
   puede pertenecer a una empresa.
6. **Informes de plataforma con datos de tenant.** Los resúmenes de la cola AEAT y AIOps salen por el
   bot del sistema; si incluyen datos de un tenant concreto, revisar el ámbito.
7. **Sin multimedia entrante utilizable.** Stickers, audio y vídeo se ignoran (solo documento/foto van
   a la bandeja de gastos).
8. **El webhook se registra al conectar el bot.** `POST /api/integraciones`, `POST
   /api/integraciones/telegram`, el onboarding y el alta de partner llaman a `registrarWebhookBot`
   (`lib/telegram/webhook-registro.ts`) con el `secret_token` derivado del bot. **No se pisa** un webhook
   que apunte a otra aplicación: se devuelve `conflicto` y el panel avisa; solo el alta de superadmin
   fuerza el registro. Ajustes → Integraciones → Telegram muestra el estado real (registrado, URL,
   pendientes, último error) desde `GET /api/integraciones/telegram/webhook` y permite repararlo con
   `POST` sobre la misma ruta. `scripts/register-telegram-webhooks.ts` sigue sirviendo para registrar
   en lote bots ya existentes.
