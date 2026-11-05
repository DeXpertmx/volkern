# Diagrama: Comunicación Telegram ↔ Volkern

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMUNICACIÓN TELEGRAM ↔ VOLKERN                        │
│                         (Flujo Completo)                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐                         ┌──────────────────────────────────┐
│   TELEGRAM   │                         │          VOLKERN                  │
│   (Usuario)  │                         │                                  │
│              │                         │  ┌────────────────────────────┐  │
│  ┌────────┐  │                         │  │     API LAYER              │  │
│  │ Bot    │  │                         │  │  ┌──────────────────────┐ │  │
│  │ Token  │  │                         │  │  │ /api/telegram/webhook │ │  │
│  └────────┘  │                         │  │  └──────────┬───────────┘ │  │
│      │       │                         │  │             │            │  │
│      │       │    ┌───────────────┐     │  │  ┌─────────▼───────────┐ │  │
│      │       └───►│  Telegram    │◄────┘  │  │  │ TelegramWebhook   │ │  │
│      │             │   Servers    │        │  │  │ Handler           │ │  │
│      │             └───────────────┘        │  │  └─────────┬───────┘ │  │
│      │                                     │  │            │         │  │
│      │                                     │  │  ┌─────────▼────────┐ │  │
│      │        ┌───────────────┐            │  │  │ handleTelegram   │ │  │
│      │◄───────│  Webhook URL  │            │  │  │   Webhook       │ │  │
│      │        └───────────────┘            │  │  └────────┬────────┘ │  │
│      │                                     │  │           │         │  │
│      │                                     │  │  ┌────────▼────────┐ │  │
│      │                                     │  │  │ TelegramGateway │ │  │
│      │                                     │  │  │ Agent           │ │  │
│      │                                     │  │  └────────┬───────┘ │  │
│      │                                     │  │           │         │  │
│      ▼                                     │  │  ┌────────▼────────┐ │  │
│  ┌─────────┐                               │  │  │ TelegramChatbot│ │  │
│  │ Usuario │                               │  │  │ (AI Processing)│ │  │
│  │ Final   │                               │  │  └────────┬───────┘ │  │
│  └─────────┘                               │  │           │         │  │
│                                            │  │           ▼         │  │
│                                            │  │  ┌────────────────┐ │  │
│                                            │  │  │   SKILLS      │ │  │
│                                            │  │  │   LAYER       │ │  │
│                                            │  │  └──────────────┘ │  │
│                                            │  └─────────────────────┘  │
└──────────────┘                               └──────────────────────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │    DATABASE        │
                              │   (PostgreSQL)     │
                              │                     │
                              │  ┌───────────────┐  │
                              │  │ TelegramChat  │  │
                              │  │   botConfig   │  │
                              │  └───────────────┘  │
                              │  ┌───────────────┐  │
                              │  │  Conversation │  │
                              │  └───────────────┘  │
                              │  ┌───────────────┐  │
                              │  │  ChatMessage │  │
                              │  └───────────────┘  │
                              └─────────────────────┘
```

---

## Flujo 1: Mensaje Entrante (Usuario → Volkern)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. USUARIO ENVÍA MENSAJE EN TELEGRAM                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   Usuario en Telegram
         │
         ▼
   ┌─────────────────────────────────────┐
   │ Message: "Hola, quiero información" │
   │ Chat ID: 123456789                  │
   │ From: { id: 123456789, first_name:  │
   │        "Juan", username: "juan123" }│
   └─────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────┐
   │ TELEGRAM API                        │
   │ POST https://api.telegram.org/...   │
   │ (Entrega al Bot configurado)        │
   └─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. WEBHOOK RECEPTOR DE VOLKERN                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────┐
   │ POST /api/telegram/webhook          │
   │ ?tenantId=tenant-123&token=abc123   │
   │                                     │
   │ Headers:                            │
   │ - Content-Type: application/json   │
   │                                     │
   │ Body (Update de Telegram):         │
   │ {                                  │
   │   "update_id": 123456789,          │
   │   "message": {                     │
   │     "message_id": 123,            │
   │     "from": { "id": 123456789,    │
   │               "is_bot": false,     │
   │               "first_name": "Juan" │
   │             },                     │
   │     "chat": { "id": 123456789 },  │
   │     "text": "Hola, quiero info",  │
   │     "date": 1234567890            │
   │   }                                │
   │ }                                  │
   └─────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────┐
   │ VALIDACIÓN DE SEGURIDAD             │
   │                                     │
   │ 1. Verifica tenantId en query      │
   │ 2. Busca TelegramChatbotConfig     │
   │ 3. Verifica isActive = true        │
   │ 4. Valida token de seguridad       │
   └─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. HANDLETE TELEGRAM WEBHOOK                                               │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   handleTelegramWebhook(tenantId, update)
         │
         ├──► TelegramGatewayAgent.processUpdate()
         │       ├── Normaliza el update de Telegram
         │       ├── Extrae: chatId, userId, message, timestamp
         │       └── Busca/crea sesión del usuario
         │
         ├──► TelegramChatbot.process()
         │       ├── Procesa mensaje con IA (Gemma)
         │       ├── Ejecuta skills si es necesario
         │       ├── Busca en base de conocimiento
         │       └── Genera respuesta contextual
         │
         └──► TelegramGatewayAgent.sendMessage()
                 ├── Formatea respuesta (Markdown)
                 └── Envía a Telegram API
                 
                 POST https://api.telegram.org/bot<TOKEN>/sendMessage
                 {
                   "chat_id": "123456789",
                   "text": "¡Hola Juan! soy el asistente...",
                   "parse_mode": "Markdown"
                 }
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. BASE DE DATOS                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────────────────┐
   │ TelegramChatbotConfig                               │
   │ ┌────────────────────────────────────────────────┐  │
   │ │ tenantId: "tenant-123"                         │  │
   │ │ botToken: "encrypted_xxxxx"                    │  │
   │ │ webhookUrl: "https://volkern.app/api/..."      │  │
   │ │ isActive: true                                 │  │
   │ │ welcomeMessage: "¡Hola! Soy tu asistente..."   │  │
   │ │ fallbackMessage: "No entendí, prueba de nuevo"│  │
   │ └────────────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────────────────┐
   │ Conversation (canal = "telegram")                   │
   │ ┌────────────────────────────────────────────────┐  │
   │ │ id: "conv-telegram-123"                        │  │
   │ │ tenantId: "tenant-123"                         │  │
   │ │ canal: "telegram"                              │  │
   │ │ canalChatId: "123456789"                       │  │
   │ │ estado: "activa"                               │  │
   │ └────────────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────────────────┐
   │ ChatMessage                                         │
   │ ┌────────────────────────────────────────────────┐  │
   │ │ id: "msg-123"                                  │  │
   │ │ conversationId: "conv-telegram-123"           │  │
   │ │ tipo: "texto"                                  │  │
   │ │ contenido: "Hola, quiero información"         │  │
   │ │ direccion: "entrante"                          │  │
   │ │ metadata: { telegramMessageId: 123 }           │  │
   │ └────────────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────────┘
```

---

## Flujo 2: Respuesta del Agente (Volkern → Usuario)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ESCENARIO: Agente responde desde Dashboard Volkern                        │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────┐
   │ DASHBOARD VOLKERN                       │
   │ ┌─────────────────────────────────────┐ │
   │ │ Conversación #1234 (Telegram)       │ │
   │ │ ─────────────────────────────────── │ │
   │ │ Juan: "Quiero información"         │ │
   │ │ Agente: "Claro, ¿qué servicio..."   │ │
   │ └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘
         │
         ▼
   POST /api/mensajes/enviar
   {
     conversationId: "conv-telegram-123",
     contenido: "Claro, ¿qué servicio...",
     tipo: "texto"
   }
         │
         ▼
   ┌─────────────────────────────────────────┐
   │ SKILL: send_message                     │
   │                                         │
   │ 1. Busca canal de la conversación      │
   │ 2. Detecta que es "telegram"            │
   │ 3. Recupera channelChatId               │
   └─────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────┐
   │ TELEGRAM GATEWAY                        │
   │                                         │
   │ TelegramGatewayAgent.sendMessage(      │
   │   chatId: "123456789",                  │
   │   message: "Claro, ¿qué servicio...",   │
   │   tenantId: "tenant-123"                │
   │ )                                       │
   └─────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────┐
   │ TELEGRAM API                            │
   │                                         │
   │ POST https://api.telegram.org/         │
   │    bot<TOKEN>/sendMessage               │
   │                                         │
   │ {                                      │
   │   "chat_id": "123456789",              │
   │   "text": "Claro, ¿qué servicio...",    │
   │   "parse_mode": "Markdown"              │
   │ }                                      │
   └─────────────────────────────────────────┘
         │
         ▼
   ┌─────────────────────────────────────────┐
   │ USUARIO EN TELEGRAM                     │
   │                                         │
   │ 💬 "Claro, ¿qué servicio..."            │
   │                                         │
   └─────────────────────────────────────────┘
```

---

## Componentes del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPONENTES CLAVE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────┐    ┌──────────────────────────────────────┐
│ TelegramChatbotConfig (Modelo) │    │ TelegramGatewayAgent                 │
├────────────────────────────────┤    ├──────────────────────────────────────┤
│ - tenantId: String            │    │ - processUpdate() → normaliza update │
│ - botToken: String (encrypted)│    │ - parseUpdate() → extrae datos        │
│ - webhookUrl: String         │    │ - sendMessage() → API Telegram       │
│ - isActive: Boolean          │    │ - setWebhook() → configura webhook   │
│ - welcomeMessage: String     │    └──────────────────────────────────────┘
│ - fallbackMessage: String     │
└────────────────────────────────┘    ┌──────────────────────────────────────┐
                                     │ TelegramChatbot                       │
┌────────────────────────────────┐    ├──────────────────────────────────────┤
│ Endpoint: /api/telegram/webhook│    │ - process() → lógica de chatbot     │
├────────────────────────────────┤    │ - getResponse() → IA (Gemma)        │
│ POST: Recibe mensajes         │    │ - executeSkill() → skills Volkern   │
│ GET: Status y configuración    │    └──────────────────────────────────────┘
└────────────────────────────────┘
```

---

## Configuración del Webhook

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CÓMO SE CONFIGURA EL WEBHOOK                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. ADMIN CONFIGURA EN DASHBOARD
   ┌─────────────────────────────────────────┐
   │ Settings → Telegram Bot                 │
   │ ┌─────────────────────────────────────┐ │
   │ │ Bot Token: "12345:ABC-DEF1234..."   │ │
   │ │ Estado: ● Activo                    │ │
   │ │ Welcome: "¡Hola! Soy tu asistente" │ │
   │ └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘
         │
         ▼
2. VOLKERN REGISTRA WEBHOOK EN TELEGRAM
   scripts/register-telegram-webhooks.ts   (sin --apply, solo el plan)

   → POST https://api.telegram.org/bot<TOKEN>/setWebhook  (con secret_token)
   → URL: https://volkern.app/api/webhooks/telegram

   NOTA: el antiguo GET .../api/telegram/webhook?action=setWebhook está
   retirado: respondía sin sesión y apuntaba el bot a la ruta legacy.
         │
         ▼
3. TELEGRAM CONFIRMA
   → Telegram API retorna: { "ok": true, "result": true }
   → Volkern guarda webhookUrl en TelegramChatbotConfig
         │
         ▼
4. LISTO PARA RECIBIR MENSAJES
   ┌─────────────────────────────────────────┐
   │ Cada vez que el usuario envía mensaje   │
   │ Telegram → Webhook Volkern → Proceso   │
   └─────────────────────────────────────────┘
```

---

## Comparativa: Telegram vs Chatwoot

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TELEGRAM vs OTROS CANALES                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┬──────────────────────┬───────────────────────────────────────┐
│  Característica│     TELEGRAM       │         CHATWOOT                    │
├─────────────┼──────────────────────┼───────────────────────────────────────┤
│ Webhook     │ /api/telegram/       │ /api/integrations/webhook/           │
│             │     webhook          │        chatwoot                      │
├─────────────┼──────────────────────┼───────────────────────────────────────┤
│ Autenticación│ token en query      │ HMAC signature + account_id          │
│             │ + tenantId           │        mapping                        │
├─────────────┼──────────────────────┼───────────────────────────────────────┤
│ Chatbot IA  │ Gemini integrado     │ Solo sincronización de mensajes       │
│             │ (procesa en tiempo   │ (agente debe responder manually)      │
│             │  real)               │                                       │
├─────────────┼──────────────────────┼───────────────────────────────────────┤
│ Base de    │ TelegramChatbotConfig │ No hay modelo específico              │
│ Datos      │ (configuración)       │ (usa conversation/chatmessage)         │
├─────────────┼──────────────────────┼───────────────────────────────────────┤
│ Flujo de   │ Usuario → Bot → IA   │ Usuario → Provider → Chatwoot →       │
│ Mensajes   │ → Usuario            │ → Volkern → Agente                    │
└─────────────┴──────────────────────┴───────────────────────────────────────┘

Nota: Telegram tiene chatbot integrado con IA, Chatwoot es más para 
      gestión manual de conversaciones por agentes.
```

---

## Endpoints Clave

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENDPOINTS TELEGRAM                                  │
└─────────────────────────────────────────────────────────────────────────────┘

POST /api/telegram/webhook
    → Recibe mensajes entrantes de Telegram
    → Query params: tenantId, token

GET  /api/telegram/webhook?tenantId=xxx&action=status
    → Verifica estado del chatbot (exige sesión de superadmin)

GET  /api/telegram/webhook?tenantId=xxx&action=setWebhook
    → RETIRADO: responde 409 y no cambia el webhook del bot

POST /api/mensajes/enviar
    → Envía respuesta del agente a Telegram
```

---

*Este diagrama muestra cómo Telegram se integra con Volkern: el usuario interactsúa con un Bot de Telegram, Volkern procesa mediante IA/Chatbot, guarda en BD normalizada, y el agente gestiona todo desde el Dashboard sin ver la complejidad de Telegram.*