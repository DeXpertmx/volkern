
# 🚀 Mejoras de Integración Anytimebot

## Resumen
Se han implementado mejoras significativas en la integración de Anytimebot con Volkern CRM para proporcionar una experiencia completa de gestión de citas y mensajes bidireccional.

---

## ✅ Funcionalidades Implementadas

### 1. 📅 Soporte para Eventos de Citas Avanzados

**Archivo:** `/app/api/webhooks/anytimebot/citas/route.ts`

#### Eventos Soportados:
- ✅ **BOOKING_CREATED** - Cita creada (ya existía)
- 🆕 **BOOKING_CANCELLED** - Cita cancelada
- 🆕 **BOOKING_RESCHEDULED** - Cita reprogramada

#### Funcionalidad:
- **Cancelación de Citas:**
  - Actualiza el estado de la cita a 'cancelada'
  - Registra el motivo y fecha de cancelación
  - Actualiza las notas del lead
  - Dispara automatización `cita_cancelada`

- **Reprogramación de Citas:**
  - Busca la cita anterior por fecha/hora o ID de booking
  - Actualiza con la nueva fecha y hora
  - Mantiene historial de cambios en la descripción
  - Dispara automatización `cita_reprogramada`

#### Ejemplo de Payload:
```json
{
  "eventType": "BOOKING_CANCELLED",
  "id": "booking_123",
  "clientName": "Juan Pérez",
  "clientEmail": "juan@example.com",
  "clientPhone": "+52 55 1234 5678",
  "date": "2024-12-01",
  "time": "14:00",
  "duration": 60
}
```

---

### 2. 💬 Webhook de Sincronización de Mensajes

**Archivo:** `/app/api/webhooks/anytimebot/mensajes/route.ts`

#### Funcionalidad:
- **Asociación Automática por Teléfono:**
  - Busca leads existentes por número de WhatsApp
  - Compara los últimos 10 dígitos para coincidencias
  - Crea lead automáticamente si no existe

- **Creación de Conversaciones:**
  - Asocia mensajes con conversaciones existentes
  - Crea nueva conversación si es necesario
  - Mantiene contador de mensajes no leídos

- **Enriquecimiento de Contexto:**
  - Almacena metadata del mensaje (tipo, intent, sentiment)
  - Actualiza actividad del lead automáticamente
  - Incrementa score del lead por engagement

#### Tipos de Mensaje Soportados:
- `text` - Mensajes de texto
- `image` - Imágenes
- `document` - Documentos/PDFs
- `audio` - Mensajes de voz
- `video` - Videos

#### Ejemplo de Payload:
```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "timestamp": "2024-11-11T14:30:00Z",
  "direction": "incoming",
  "from": {
    "phone": "+52 55 1234 5678",
    "name": "Juan Pérez"
  },
  "to": {
    "phone": "+52 55 8765 4321"
  },
  "message": {
    "type": "text",
    "content": "Hola, necesito información sobre sus servicios"
  },
  "metadata": {
    "intent": "consulta",
    "sentiment": "positive",
    "tags": ["nuevo-cliente", "interesado"]
  }
}
```

---

### 3. 📤 Endpoint para Enviar Mensajes desde Volkern

**Archivos:**
- `/lib/anytimebot.ts` - Función `sendAnytimebotMessage()`
- `/app/api/mensajes/send-via-anytimebot/route.ts` - API endpoint

#### Funcionalidad:
- Envía mensajes de WhatsApp desde el CRM
- Registra el mensaje en la conversación
- Actualiza el último mensaje de la conversación
- Registra actividad en audit log

#### Uso desde el Frontend:
```javascript
const response = await fetch('/api/mensajes/send-via-anytimebot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversationId: 'conv_123',
    leadId: 'lead_456',
    to: '+52 55 1234 5678',
    message: 'Hola, gracias por tu interés. ¿En qué puedo ayudarte?',
    messageType: 'text'
  })
});
```

#### Respuesta:
```json
{
  "success": true,
  "messageId": "msg_789",
  "message": "Mensaje enviado exitosamente"
}
```

---

### 4. 🤖 Triggers de Automatización Mejorados

**Archivo:** `/components/automation/TriggerNode.tsx`

#### Nuevos Triggers Añadidos:
- `cita_creada` - Cuando se crea una cita desde Anytimebot
- `cita_cancelada` - Cuando se cancela una cita
- `cita_reprogramada` - Cuando se reprograma una cita

Estos triggers permiten crear automatizaciones que reaccionen a cambios en el estado de las citas.

---

### 5. 📋 Plantillas de Automatización Pre-configuradas

**Archivo:** `/scripts/seed-anytimebot-automation-templates.ts`

Se crearon 5 plantillas listas para usar:

#### 1. 🎯 Confirmación de Cita Agendada
**Trigger:** `cita_creada`
**Acciones:**
- Envía email de confirmación con detalles de la cita
- Actualiza estado del lead a "cita_agendada"
- Registra nota en el lead

#### 2. ⏰ Recordatorio 24h Antes de la Cita
**Trigger:** `cita_proximo_24h`
**Acciones:**
- Envía email de recordatorio
- Si tiene WhatsApp, envía mensaje por WhatsApp
- Crea tarea de confirmación para el equipo

#### 3. 🎥 Enviar Link de Zoom para Cita Virtual
**Trigger:** `cita_creada`
**Condición:** Cita tipo = "virtual"
**Acciones:**
- Crea reunión de Zoom automáticamente
- Envía email con link y credenciales
- Incluye instrucciones técnicas

#### 4. 🔔 Seguimiento Post-Cita
**Trigger:** `cita_completada`
**Acciones:**
- Espera 2 horas después de la cita
- Envía email solicitando feedback
- Aumenta score del lead (+10 puntos)
- Crea tarea de seguimiento

#### 5. ❌ Manejo de Citas Canceladas
**Trigger:** `cita_cancelada`
**Acciones:**
- Envía confirmación de cancelación
- Ofrece opciones para reagendar
- Espera 3 días
- Envía recordatorio para reagendar

---

## 📊 Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                          ANYTIMEBOT                             │
│                                                                 │
│  ┌──────────┐    ┌───────────┐    ┌────────────┐              │
│  │ WhatsApp │ -> │ Chatbot   │ -> │ Webhooks   │              │
│  │ Mensajes │    │ (Bot AI)  │    │ Outgoing   │              │
│  └──────────┘    └───────────┘    └────────────┘              │
└────────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       VOLKERN CRM                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WEBHOOKS (Incoming)                         │  │
│  │                                                          │  │
│  │  • /api/webhooks/anytimebot/citas                       │  │
│  │    - BOOKING_CREATED                                    │  │
│  │    - BOOKING_CANCELLED                                  │  │
│  │    - BOOKING_RESCHEDULED                                │  │
│  │                                                          │  │
│  │  • /api/webhooks/anytimebot/mensajes                    │  │
│  │    - MESSAGE_RECEIVED (WhatsApp)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 PROCESAMIENTO                            │  │
│  │                                                          │  │
│  │  1. Buscar/Crear Lead por teléfono                      │  │
│  │  2. Asociar con Conversación                            │  │
│  │  3. Registrar Mensaje/Cita                              │  │
│  │  4. Actualizar Score y Actividad                        │  │
│  │  5. Disparar Automatizaciones                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AUTOMATIZACIONES                            │  │
│  │                                                          │  │
│  │  • Enviar email de confirmación                         │  │
│  │  • Crear recordatorios                                  │  │
│  │  • Generar links de Zoom                                │  │
│  │  • Seguimiento post-cita                                │  │
│  │  • Ofrecer reagendar                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           RESPUESTAS (Outgoing)                          │  │
│  │                                                          │  │
│  │  • /api/mensajes/send-via-anytimebot                    │  │
│  │    - Enviar respuesta por WhatsApp                      │  │
│  │    - Actualizar conversación                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ANYTIMEBOT API                            │
│                                                                 │
│  • POST /api/bot/send-message                                  │
│    - Envía mensaje al cliente vía WhatsApp                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuración Requerida

### 1. URLs de Webhooks en Anytimebot

Configura estos webhooks en tu cuenta de Anytimebot:

**Citas:**
```
https://volkern.app/api/webhooks/anytimebot/citas
```

**Mensajes:**
```
https://volkern.app/api/webhooks/anytimebot/mensajes
```

### 2. Eventos a Suscribir

Asegúrate de suscribirte a estos eventos:
- ✅ `booking.created`
- ✅ `booking.cancelled`
- ✅ `booking.rescheduled`
- ✅ `message.received`
- ✅ `message.sent`

### 3. Configuración en Volkern CRM

1. Ve a **Dashboard → Integraciones**
2. Configura la integración de **Anytimebot**
3. Activa las siguientes opciones:
   - ☑️ Sincronizar Leads
   - ☑️ Sincronizar Citas
   - ☑️ Sincronizar Mensajes
   - ☑️ WhatsApp Integrado

---

## 📖 Casos de Uso

### Caso 1: Cliente Agenda Cita desde WhatsApp

1. **Cliente** envía mensaje por WhatsApp
2. **Anytimebot** responde y agenda la cita
3. **Webhook** `BOOKING_CREATED` notifica a Volkern
4. **Volkern CRM:**
   - Crea/actualiza lead
   - Registra la cita
   - Dispara automatización de confirmación
5. **Cliente** recibe email de confirmación automáticamente
6. **24h antes:** Cliente recibe recordatorio por email y WhatsApp

### Caso 2: Cliente Cancela Cita

1. **Cliente** cancela cita desde Anytimebot
2. **Webhook** `BOOKING_CANCELLED` notifica a Volkern
3. **Volkern CRM:**
   - Actualiza estado de cita a "cancelada"
   - Dispara automatización de cancelación
4. **Cliente** recibe email de confirmación de cancelación
5. **3 días después:** Cliente recibe invitación para reagendar

### Caso 3: Equipo Responde desde CRM

1. **Cliente** envía mensaje por WhatsApp
2. **Anytimebot** envía webhook a Volkern
3. **Volkern CRM:**
   - Crea conversación
   - Asocia con lead existente
   - Notifica al equipo
4. **Equipo** responde desde módulo de Mensajes en Volkern
5. **API** envía mensaje vía Anytimebot
6. **Cliente** recibe respuesta por WhatsApp

---

## 🚀 Próximos Pasos Recomendados

### Fase 1 (Implementado ✅)
- ✅ Soporte para cancelación y reprogramación de citas
- ✅ Sincronización de mensajes bidireccional
- ✅ Enriquecimiento automático de leads
- ✅ Plantillas de automatización pre-configuradas

### Fase 2 (Futuro)
- 🔜 Panel de métricas de Anytimebot en dashboard
- 🔜 Análisis de sentimiento de conversaciones
- 🔜 Respuestas sugeridas basadas en IA
- 🔜 Integración con Google Calendar
- 🔜 Recordatorios por SMS
- 🔜 Templates de mensajes personalizables
- 🔜 Chatbot interno con aprendizaje

---

## 📝 Notas Técnicas

### Lead Temporal sin Email
Cuando se crea un lead desde WhatsApp sin email, se genera un email temporal:
```
whatsapp-[últimos10dígitos]@temp.volkern.com
```

El sistema agrega una nota indicando que se debe actualizar con el email real del cliente.

### Identificación de Leads
La búsqueda de leads por teléfono usa los últimos 10 dígitos para manejar diferentes formatos:
- +52 55 1234 5678
- 5512345678
- (55) 1234-5678

Todos coinciden con el mismo lead.

### Metadata de Mensajes
Cada mensaje almacena metadata adicional:
```json
{
  "anytimebotMessageId": "msg_123",
  "anytimebotConversationId": "conv_456",
  "messageType": "text",
  "mediaUrl": null,
  "intent": "consulta",
  "sentiment": "positive",
  "originalTimestamp": "2024-11-11T14:30:00Z"
}
```

---

## 🎯 Métricas de Éxito

Con estas mejoras, puedes medir:
- 📊 Total de leads capturados desde Anytimebot
- 📊 Total de citas sincronizadas
- 📊 Total de mensajes intercambiados
- 📊 Tiempo promedio de respuesta
- 📊 Tasa de conversión de chat a cita
- 📊 Tasa de cancelación vs reprogramación
- 📊 Satisfacción post-cita

---

## 💡 Tips de Uso

1. **Configura las plantillas de automatización** primero para aprovechar al máximo los webhooks
2. **Monitorea el audit log** para verificar que los webhooks se reciben correctamente
3. **Personaliza los templates de email** con la identidad de tu marca
4. **Usa las tags automáticas** para segmentar leads por canal
5. **Revisa el score de leads** que llegan por WhatsApp para priorizar seguimiento

---

## 🆘 Soporte y Troubleshooting

### Webhook no se recibe
1. Verifica que la URL esté correctamente configurada en Anytimebot
2. Revisa los logs en la consola del navegador (F12)
3. Verifica que la integración esté activa en Volkern

### Lead no se asocia correctamente
1. Verifica el formato del número de teléfono
2. Asegúrate de que el lead tenga el número registrado
3. Revisa el audit log para ver qué lead se creó/actualizó

### Mensaje no se envía
1. Verifica que el username de Anytimebot sea correcto
2. Asegúrate de que el número de destino esté en formato correcto
3. Revisa los logs de la API de Anytimebot

---

## ✅ Checklist de Implementación

- ☑️ Configurar webhooks en Anytimebot
- ☑️ Activar integración en Volkern CRM
- ☑️ Probar recepción de citas
- ☑️ Probar recepción de mensajes
- ☑️ Probar envío de mensajes desde CRM
- ☑️ Activar plantillas de automatización
- ☑️ Personalizar templates de email
- ☑️ Capacitar al equipo en el módulo de Mensajes
- ☑️ Configurar horarios de atención
- ☑️ Monitorear primeras interacciones

---

¡Todo listo para ofrecer una experiencia completa de atención al cliente! 🎉
