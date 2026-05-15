# Diagrama del Hub de Comunicaciones Volkern

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HUB DE COMUNICACIONES (Volkern)                         │
│                         (Capa Invisible al Usuario)                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │  PROVIDERS EXTERNOS │
                              │  (WhatsApp, Tele,   │
                              │   Instagram, etc)   │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐        ┌─────▼─────┐        ┌─────▼─────┐
              │  Webhook  │        │  Webhook  │        │  Webhook  │
              │  Receptor │        │  Receptor │        │  Receptor │
              └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │   INTEGRATION      │
                              │    HANDLER         │
                              │  (Procesa eventos) │
                              └──────────┬──────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │   CHATWOOT (Core)  │
                              │  ┌───────────────┐  │
                              │  │ Conversation  │  │
                              │  │    Sync       │  │
                              │  └───────────────┘  │
                              │  ┌───────────────┐  │
                              │  │  Message      │  │
                              │  │   Broker      │  │
                              │  └───────────────┘  │
                              └──────────┬──────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │    SKILLS LAYER    │
                              │  (Chatwoot Sync)   │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐        ┌─────▼─────┐        ┌─────▼─────┐
              │ sync_     │        │  sync_    │        │ process_  │
              │ incoming  │        │  outgoing │        │ message   │
              │ _message  │        │  _message │        │           │
              └───────────┘        └───────────┘        └───────────┘
```

---

## Flujo: Mensaje Entrante (Ej. WhatsApp)

```
1. CLIENTE ENVÍA MENSAJE
   WhatsApp/Telegram/Instagram
        │
        ▼
2. PROVIDER → WEBHOOK VOLKERN
   ┌────────────────────────────────────────┐
   │ POST /api/integrations/webhook/chatwoot│
   │ Body: { event: "message_created",      │
   │        message: { ... },               │
   │        inbox: { id: 123 } }            │
   └────────────────────────────────────────┘
        │
        ▼
3. IDENTIFICACIÓN DE TENANT (Aislamiento)
   - Chatwoot Account ID → Tenant mapping
   - Validación de firma (HMAC SHA256)
   - Verificación de anti-duplicado (Idempotency)
        │
        ▼
4. PROCESS WEBHOOK → handleIncomingWebhook()
   - Parsea el evento
   - Normaliza mensaje
   - Identifica conversación existente o crea nueva
        │
        ▼
5. SKILL LAYER (chatwoot-sync-skill)
   - sync_incoming_chatwoot_message()
   - Crea/actualiza Conversation en Volkern
   - Crea Message en BD
   - Emite evento al EventBus
        │
        ▼
6. BASE DE DATOS (PostgreSQL)
   - Conversation table
   - ChatMessage table
   - Contact/Lead linking
        │
        ▼
7. UI DEL AGENTE (Dashboard Volkern)
   El agente ve el mensaje como si fuera nativo de Volkern
   NO ve que vino de WhatsApp/Chatwoot
```

---

## Vista en el Dashboard del Agente

```
┌─────────────────────────────────────────────────┐
│  VOLKERN DASHBOARD                              │
│  ┌───────────────────────────────────────────┐  │
│  │ Conversación #1234                        │  │
│  │ ─────────────────────────────────────────│  │
│  │ Cliente: "Hola, quiero información"      │  │
│  │ Agente: [Responder aquí...]              │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

El agente SOLO ve:
- Una conversación de Volkern
- Mensajes normalizados
- NO ve que vino de WhatsApp/Telegram
- NO necesita cuenta de Chatwoot
```

---

## Flujo: Respuesta del Agente

```
1. AGENTE ESCRIBE en Dashboard Volkern
        │
        ▼
2. API MENSAJES → ENVÍA
   POST /api/mensajes/enviar
        │
        ▼
3. SKILL: send_message
   - Detecta canal del contacto
   - Usa MessagingHub strategy
        │
        ▼
4. MESSAGING HUB STRATEGY
   ┌─────────────────────────────────────────┐
   │ Routing:                                │
   │   if (contact.preferredChannel == 'whatsapp')  │
   │      → WhatsApp Provider                │
   │   else if (contact.preferredChannel == 'telegram')│
   │      → Telegram Provider               │
   │   else                                   │
   │      → Chatwoot (reenvía al canal orig)│
   └─────────────────────────────────────────┘
        │
        ▼
5. Proveedor Externo entrega mensaje
   (Usuario final recibe en WhatsApp/Telegram)
```

---

## ¿Por Qué Es Invisible?

### 1. USER NO CONECTA A CHATWOOT DIRECTAMENTE
- El usuario final solo ve WhatsApp/Telegram
- Chatwoot es solo el "motor" interno

### 2. VOLKERN ABSTRAE LA COMPLEJIDAD
- Un solo endpoint para todos los canales
- El agente solo ve "Conversaciones Volkern"
- No necesita cuenta de Chatwoot

### 3. DATOS NORMALIZADOS
- Mensajes se guardan en formato Volkern
- Contactos unificados (no duplicados por canal)

### 4. SESIONES GESTIONADAS BY VOLKERN
- Las sesiones de Chatwoot las gestiona Volkern internamente
- El agente no tiene acceso a la interfaz de Chatwoot

---

## Componentes Clave

| Componente | Función | Ubicación |
|------------|---------|-----------|
| Webhook Receiver | Recibe mensajes de providers | `/api/integrations/webhook/chatwoot` |
| Integration Handler | Normaliza y procesa eventos | `lib/integrations/integration-handler.ts` |
| Chatwoot Sync Skill | Sincroniza conversaciones | `lib/skills/chatwoot-sync-skill.ts` |
| Messaging Hub Strategy | Routing de salida | `lib/messaging/strategy.ts` |
| Conversation DB | Almacena conversaciones | Prisma: `Conversation` model |
| ChatMessage DB | Almacena mensajes | Prisma: `ChatMessage` model |

---

## Endpoints Clave

```
POST /api/integrations/webhook/chatwoot    → Recibe mensajes entrantes
POST /api/integrations/webhook/n8n         → Automaciones
POST /api/mensajes/enviar                  → Envía mensajes salientes
GET  /api/messaging-hub                   → Configuración del hub
```

---

*Este diagrama muestra cómo Volkern abstrae la complejidad de múltiples canales de mensajería, ofreciendo al agente una experiencia unificada sin видимость de la infraestructura subyacente (Chatwoot).*