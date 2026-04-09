
# 🔄 Integración de Plaudern con Volkern CRM mediante Webhooks

## 📋 Resumen

Esta guía documenta la implementación correcta de la integración de Plaudern con Volkern CRM mediante **webhooks bidireccionales**, según la documentación oficial de Plaudern.

---

## ✅ Estado Actual de la Implementación

### Endpoints Implementados en Volkern

✅ **Webhook Receptor de Plaudern**: `/api/webhooks/plaudern/mensajes`
- Recibe notificaciones de Plaudern cuando:
  - Un bot envía un mensaje (`message.sent`)
  - Se recibe un mensaje (`message.received`)  
  - Se crea una conversación (`conversation.created`)
  - Se actualiza una conversación (`conversation.updated`)

✅ **API de Configuración**: `/api/integraciones/plaudern`
- GET: Obtiene configuración actual
- POST: Crea/actualiza configuración
- DELETE: Elimina configuración

✅ **API de Prueba**: `/api/integraciones/plaudern/test`
- Prueba de conexión (`connection`)
- Prueba de chat (`chat`)

---

## 🔧 Configuración en Plaudern Dashboard

### 1. Obtener JWT Token

**Opción A: API (cURL)**
```bash
curl -X POST https://plaudern.abacusai.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@plaudern.com",
    "password": "Demo2024!"
  }'
```

**Respuesta:**
```json
{
  "access_token": "eyJhbGci0iJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "email": "demo@plaudern.com",
    "name": "Demo User"
  }
}
```

**Token de Demo (Válido hasta 2024-12-31):**
```
eyJhbGci0iJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwNTYxNGFlYi1lYjhiLTQyZjAtYjNhMyOxZmZjMDhhNz
```

---

### 2. Configurar Webhook en Plaudern

**URL del Webhook de Volkern:**
```
https://volkern.app/api/webhooks/plaudern/mensajes
```

**Headers (Opcional):**
```
x-plaudern-signature: <firma-hmac-si-configuraste-secret>
```

**Eventos a Suscribir:**
- ☑️ `message.sent` - Bot envía mensaje
- ☑️ `message.received` - Usuario envía mensaje
- ☑️ `conversation.created` - Nueva conversación
- ☑️ `conversation.updated` - Conversación actualizada

---

## 🚀 Configuración en Volkern CRM

### 1. Acceder al Módulo de Integraciones

1. Ve a **Dashboard → Integraciones**
2. Busca **Plaudern Chatbot**
3. Haz clic en **Configurar**

### 2. Completar el Formulario

| Campo | Valor | Descripción |
|-------|-------|-------------|
| **API Key de Plaudern (JWT Token)** | `eyJhbGci...` | Token JWT completo obtenido del login |
| **Integration ID** | `volkern-prod` | ID de integración (por defecto) |
| **Bot ID** (opcional) | `562c1fe8-...` | ID del bot específico a usar |
| **Webhook Secret** (recomendado) | `secret-seguro` | Secreto para validar webhooks con HMAC |
| **¿Sincronizar conversaciones?** | ☑️ Sí | Crear conversaciones en CRM |
| **¿Sincronizar mensajes?** | ☑️ Sí | Guardar mensajes en CRM |
| **¿Crear leads automáticamente?** | ☑️ Sí | Crear leads desde nuevos contactos |
| **Fuente de leads** | `plaudern-chatbot` | Etiqueta de fuente |
| **Estado de leads nuevos** | `nuevo` | Estado inicial |
| **¿Asignación automática?** | ☑️ Sí (opcional) | Asignar a usuario |

### 3. Probar la Conexión

Haz clic en **"Probar Conexión"** para verificar:
- ✅ Health check de Plaudern API (sin autenticación)
- ✅ Listado de bots (con JWT Token)

---

## 📊 Flujo de Integración Completo

```
┌──────────────────────────────────────────────────────────────────┐
│                     VOLKERN CRM                                  │
│                                                                  │
│  1. Usuario envía mensaje en Volkern                           │
│  2. Volkern llama a:                                            │
│     POST /api/integrations/plaudern/volkern-prod/chat          │
│     Headers: Authorization: Bearer {JWT_TOKEN}                  │
│     Body: { message, userPhone, userName, conversationId }     │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                  PLAUDERN API                                    │
│                                                                  │
│  3. Plaudern procesa mensaje con IA                            │
│  4. Plaudern responde (HTTP Response)                           │
│     { success, response, action, sources, conversationId }      │
│                                                                  │
│  5. Plaudern envía webhook automático a:                        │
│     https://volkern.app/api/webhooks/plaudern/mensajes         │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                 VOLKERN WEBHOOK RECEIVER                         │
│                                                                  │
│  6. Volkern recibe webhook con:                                 │
│     {                                                            │
│       eventType: "message.sent",                                │
│       botId: "...",                                              │
│       conversationId: "...",                                     │
│       message: { id, content, type, timestamp },                 │
│       customer: { phone, name }                                  │
│     }                                                            │
│                                                                  │
│  7. Volkern procesa:                                             │
│     ✅ Busca/crea lead por teléfono                              │
│     ✅ Busca/crea conversación                                   │
│     ✅ Guarda mensaje en base de datos                           │
│     ✅ Actualiza score del lead                                  │
│     ✅ Actualiza última actividad                                │
│                                                                  │
│  8. Usuario ve respuesta en Volkern UI                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Pruebas de Integración

### Test 1: Health Check (Sin Autenticación)

```bash
curl https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod/health
```

**Respuesta Esperada:**
```json
{
  "status": "ok",
  "service": "Plaudern Chatbot API",
  "version": "1.0.0",
  "integrationId": "volkern-prod",
  "timestamp": "2025-11-20T00:00:00.000Z"
}
```

---

### Test 2: Listar Bots (Con JWT Token)

```bash
curl -H "Authorization: Bearer eyJhbGci..." \
  https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod
```

**Respuesta Esperada:**
```json
[
  {
    "id": "562c1fe8-2b64-4c10-951d-52ee7ed20b85",
    "name": "Mi Bot de Ventas",
    "status": "active",
    "personality": "Eres un asistente de ventas profesional",
    "greetingMessage": "¡Hola! ¿En qué puedo ayudarte?",
    "createdAt": "2025-11-19T16:38:38.703Z"
  }
]
```

---

### Test 3: Enviar Mensaje al Bot (Con JWT Token)

```bash
curl -X POST \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hola desde Volkern",
    "userPhone": "+573001234567",
    "userName": "Juan Pérez",
    "conversationId": "conv-123"
  }' \
  https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod/chat
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "response": "¡Hola Juan! Con gusto te ayudo.",
  "action": { "type": "none" },
  "sources": [],
  "botId": "562c1fe8-2b64-4c10-951d-52ee7ed20b85",
  "conversationId": "conv-123",
  "timestamp": "2025-11-20T00:00:00.000Z"
}
```

**⚠️ IMPORTANTE**: Este endpoint también envía automáticamente un webhook a Volkern con la respuesta del bot.

---

### Test 4: Webhook de Plaudern a Volkern

**Plaudern envía automáticamente:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-plaudern-signature: <hmac-signature>" \
  -d '{
    "eventType": "message.sent",
    "botId": "562c1fe8-...",
    "conversationId": "conv-123",
    "message": {
      "id": "msg-173206760000",
      "content": "¡Hola Juan! Con gusto te ayudo.",
      "messageType": "text",
      "timestamp": "2025-11-20T00:00:00.000Z"
    },
    "customer": {
      "phone": "+573001234567",
      "name": "Juan Pérez"
    },
    "timestamp": "2025-11-20T00:00:00.000Z"
  }' \
  https://volkern.app/api/webhooks/plaudern/mensajes
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "message": "Webhook procesado exitosamente"
}
```

---

## 🔐 Seguridad con HMAC

### Configurar Webhook Secret

1. En Volkern, configura un **Webhook Secret** (ej: `secret-seguro`)
2. Plaudern enviará webhooks con header `x-plaudern-signature`
3. Volkern validará la firma HMAC SHA-256

### Validación de Firma (Automática)

El endpoint `/api/webhooks/plaudern/mensajes` valida automáticamente la firma si está configurado el `webhookSecret` en la integración:

```typescript
const signature = request.headers.get('x-plaudern-signature') || '';
const isValid = validatePlaudernWebhook(body, signature, integration.webhookSecret);

if (!isValid) {
  return NextResponse.json({ error: 'Firma de webhook inválida' }, { status: 401 });
}
```

---

## 🎯 Casos de Uso

### Caso 1: Cliente Envía Mensaje por Primera Vez

1. **Cliente** envía mensaje desde WhatsApp/Plaudern
2. **Plaudern** procesa mensaje con IA y responde
3. **Plaudern** envía webhook a Volkern
4. **Volkern**:
   - ✅ Crea nuevo lead automáticamente
   - ✅ Crea conversación
   - ✅ Guarda mensaje entrante
   - ✅ Guarda respuesta del bot
   - ✅ Asigna score inicial (10 puntos)
   - ✅ Etiqueta como `plaudern, chatbot`
5. **Equipo** ve nuevo lead en CRM con historial completo

---

### Caso 2: Cliente Existente Continúa Conversación

1. **Cliente** envía nuevo mensaje
2. **Plaudern** envía webhook
3. **Volkern**:
   - ✅ Identifica lead existente por teléfono
   - ✅ Actualiza conversación existente
   - ✅ Incrementa score (+5 puntos por interacción)
   - ✅ Actualiza fecha de última actividad
   - ✅ Incrementa contador de mensajes no leídos
4. **Equipo** recibe notificación de nueva actividad

---

### Caso 3: Equipo Responde Manualmente desde Volkern

1. **Equipo** envía mensaje desde módulo "Mensajes"
2. **Volkern** llama a Plaudern API `/chat`
3. **Plaudern** procesa y responde (si es necesario)
4. **Plaudern** envía webhook de vuelta
5. **Volkern** sincroniza respuesta automáticamente

---

## 📝 Estructura de Datos

### Webhook Payload de Plaudern

```typescript
interface PlaudernWebhookPayload {
  eventType: 'message.received' | 'message.sent' | 'conversation.created' | 'conversation.updated';
  botId: string;
  conversationId: string;
  message?: {
    id: string;
    content: string;
    messageType: 'text' | 'image' | 'document' | 'audio' | 'video';
    mediaUrl?: string;
    timestamp: string;
  };
  customer: {
    phone: string;
    name?: string;
    metadata?: Record<string, any>;
  };
  metadata?: Record<string, any>;
}
```

### Lead Creado desde Plaudern

```typescript
{
  nombre: "Juan Pérez",
  telefono: "+573001234567",
  email: "+573001234567@plaudern.temp", // Email temporal
  fuente: "plaudern-chatbot",
  estado: "nuevo",
  scoreValue: 10,
  tags: "plaudern,chatbot",
  notas: "Lead creado automáticamente desde Plaudern\n\nBot: Mi Bot de Ventas\nConversación ID: conv-123",
  metadataExterna: {
    plaudernConversationId: "conv-123",
    plaudernBotId: "562c1fe8-...",
    plaudernCustomerMetadata: { ... }
  },
  fechaUltimaActividad: "2025-11-20T00:00:00.000Z",
  asignadoA: "user-id" // Si asignación automática está habilitada
}
```

---

## 🐛 Troubleshooting

### Error 400: "Missing or invalid Authorization header"

**Causa**: Token JWT no enviado o formato incorrecto

**Solución**:
```bash
# ✅ Correcto
Authorization: Bearer eyJhbGci...

# ❌ Incorrecto
Authorization: eyJhbGci...
API-Key: eyJhbGci...
```

---

### Error 401: "Invalid API Key" o "Firma de webhook inválida"

**Causa**: Token expirado, inválido o firma HMAC incorrecta

**Soluciones**:
1. Obtener nuevo token: `POST /api/auth/login`
2. Verificar que `webhookSecret` en Volkern coincida con Plaudern
3. Verificar formato de firma: `x-plaudern-signature` header

---

### Error 404: "Integración no encontrada"

**Causa**: Webhook recibido pero no hay integración de Plaudern configurada o está inactiva

**Soluciones**:
1. Configurar integración en Dashboard → Integraciones → Plaudern
2. Verificar que campo `activo` esté en `true`
3. Verificar que `botId` en el webhook coincida con el configurado

---

### Webhook no llega a Volkern

**Causa**: URL incorrecta o servicio no disponible

**Soluciones**:
1. Verificar URL del webhook en configuración de Plaudern:
   - ✅ Correcto: `https://volkern.app/api/webhooks/plaudern/mensajes`
   - ❌ Incorrecto: `https://volkern.app/api/webhooks/cmhmjkvra0000p99kz0pjz7k5`
2. Verificar que Volkern esté accesible públicamente
3. Revisar logs de Volkern en la consola del servidor
4. Probar manualmente con cURL

---

### Lead no se crea automáticamente

**Causa**: Opción `crearLeadsAutomatico` desactivada

**Solución**:
1. Ve a Dashboard → Integraciones → Plaudern
2. Activa ☑️ **"¿Crear leads automáticamente?"**
3. Guarda la configuración

---

## 📊 Métricas y Monitoreo

### Estadísticas Disponibles en Volkern

La integración de Plaudern rastrea:

- **Total Conversaciones Sincronizadas**: Contador de conversaciones únicas
- **Total Mensajes Procesados**: Contador de todos los mensajes (entrantes + salientes)
- **Última Sincronización**: Timestamp del último webhook procesado
- **Total Mensajes Sincronizados**: Contador específico de mensajes guardados en DB

### Ver Estadísticas

```sql
SELECT 
  totalConversacionesSincronizadas,
  totalMensajesProcesados,
  totalMensajesSincronizados,
  ultimaSincronizacion,
  activo
FROM "PlaudernIntegration"
WHERE tenantId = 'tu-tenant-id';
```

---

## 🔄 Actualizaciones y Cambios Implementados

### ✅ Cambio 1: Health Check Sin Autenticación

**Antes:**
```typescript
// ❌ Requería API Key
export async function checkPlaudernHealth(apiKey: string, integrationId?: string) {
  headers: {
    'Authorization': `Bearer ${apiKey}`, // ❌ No debería requerirse
  }
}
```

**Ahora:**
```typescript
// ✅ NO requiere autenticación (según documentación oficial)
export async function checkPlaudernHealth(integrationId?: string) {
  headers: {
    'Content-Type': 'application/json',
    // ✓ NO se envía Authorization
  }
}
```

---

### ✅ Cambio 2: Endpoint de Test Actualizado

**Archivo**: `/app/api/integraciones/plaudern/test/route.ts`

```typescript
case 'connection':
  try {
    // 1. Health check (NO requiere autenticación) ✅
    const health = await checkPlaudernHealth(finalIntegrationId);
    
    // 2. Listar bots (SÍ requiere autenticación con JWT) ✅
    const bots = await getPlaudernBots(finalApiKey, finalIntegrationId);

    return NextResponse.json({
      success: true,
      message: 'Conexión exitosa con Plaudern',
      integrationId: finalIntegrationId,
      health,
      bots: [...]
    });
  } catch (error: any) {
    // Errores manejados correctamente
  }
```

---

### ✅ Cambio 3: Webhook Receptor Robusto

**Archivo**: `/app/api/webhooks/plaudern/mensajes/route.ts`

**Características:**
- ✅ Validación de firma HMAC (opcional)
- ✅ Procesamiento por tipo de evento:
  - `message.received`: Cliente envió mensaje
  - `message.sent`: Bot respondió
  - `conversation.created`: Nueva conversación
  - `conversation.updated`: Conversación actualizada
- ✅ Creación automática de leads
- ✅ Sincronización de conversaciones y mensajes
- ✅ Actualización de scores
- ✅ Registro en audit log
- ✅ Estadísticas actualizadas

---

## 📁 Archivos Modificados/Creados

```
✅ /lib/plaudern.ts
   - checkPlaudernHealth() actualizado (sin auth requerida)
   - Logs de debugging mejorados

✅ /app/api/integraciones/plaudern/test/route.ts
   - Actualizado para no pasar apiKey a health check
   - Comentarios explicativos añadidos

✅ /app/api/webhooks/plaudern/mensajes/route.ts
   - Endpoint webhook receptor (ya existía)
   - Maneja todos los eventos de Plaudern
   - Validación HMAC implementada

✅ /app/api/integraciones/plaudern/route.ts
   - GET/POST/DELETE para configuración
   - Permite guardar sin bots (con advertencia)

📄 /PLAUDERN_WEBHOOK_INTEGRATION.md (Nuevo)
   - Documentación completa de integración mediante webhooks
   - Guías de prueba y troubleshooting
```

---

## 🚀 Próximos Pasos para el Usuario

### 1. Configurar en Plaudern Dashboard

1. Ir a https://plaudern.abacusai.app/dashboard
2. Navegar a **Configuración → Webhooks**
3. Agregar nuevo webhook:
   - **URL**: `https://volkern.app/api/webhooks/plaudern/mensajes`
   - **Eventos**: `message.sent`, `message.received`, `conversation.created`, `conversation.updated`
   - **Secret** (opcional pero recomendado): `secret-seguro`
4. Guardar configuración

### 2. Configurar en Volkern CRM

1. Ir a **Dashboard → Integraciones**
2. Buscar **Plaudern Chatbot**
3. Completar formulario con datos de arriba
4. Hacer clic en **"Probar Conexión"** para verificar
5. Guardar configuración

### 3. Verificar Funcionamiento

1. Enviar mensaje de prueba desde Plaudern
2. Verificar que llega el webhook a Volkern (revisar logs)
3. Confirmar que se crea el lead en CRM
4. Verificar que la conversación y mensajes se sincronizan

### 4. Monitorear Logs

**En el servidor de Volkern:**
```bash
# Ver logs en tiempo real
tail -f /var/log/volkern-crm.log

# Buscar logs de webhooks de Plaudern
grep "📨 Webhook recibido de Plaudern" /var/log/volkern-crm.log

# Buscar errores
grep "❌" /var/log/volkern-crm.log
```

---

## ✅ Checklist de Implementación

- [x] Health check actualizado (sin autenticación requerida)
- [x] Endpoint de test actualizado
- [x] Webhook receptor implementado
- [x] Validación HMAC implementada
- [x] Creación automática de leads
- [x] Sincronización de conversaciones y mensajes
- [x] Actualización de scores y actividad
- [x] Audit logging completo
- [x] Documentación detallada
- [ ] **Usuario configura webhook en Plaudern Dashboard**
- [ ] **Usuario configura integración en Volkern CRM**
- [ ] **Pruebas end-to-end realizadas**

---

## 💡 Recomendaciones Finales

1. **Usar Webhook Secret**: Siempre configura un `webhookSecret` para validar webhooks con HMAC
2. **Monitorear Logs**: Revisa logs regularmente para detectar problemas temprano
3. **Actualizar JWT Tokens**: Los tokens expiran, obtén nuevos cuando sea necesario
4. **Probar con Casos Reales**: Simula conversaciones reales para verificar el flujo completo
5. **Configurar Asignación Automática**: Asigna leads automáticamente a un usuario para seguimiento inmediato

---

¡Integración de Plaudern con Volkern CRM mediante Webhooks completamente documentada! 🎉
