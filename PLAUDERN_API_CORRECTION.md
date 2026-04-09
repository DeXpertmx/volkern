
# Fix: Plaudern API Integration - Correct Endpoints Implementation

## 📋 Resumen del Problema

La integración de Plaudern en Volkern CRM estaba usando endpoints incorrectos que no coincidían con la API real de Plaudern. Según la guía oficial de uso de Plaudern, la API utiliza una estructura de endpoints diferentes basados en un `integration_id`.

## 🔍 Análisis del Problema

### Endpoints Incorrectos (Antes)

```typescript
// ❌ INCORRECTOS
'/api/config/bots'                 // Para listar bots
'/api/config/bot/${botId}'         // Para obtener un bot
'/api/ai/test-rag'                 // Para probar chat
'/health'                          // Para health check
```

### Endpoints Correctos (Ahora)

```typescript
// ✅ CORRECTOS (según guía oficial)
'/api/integrations/plaudern/${integration_id}'              // Listar bots
'/api/integrations/plaudern/${integration_id}/bots/${botId}' // Bot específico
'/api/integrations/plaudern/${integration_id}/chat'          // Chat
'/api/integrations/plaudern/${integration_id}/health'        // Health check
```

## ✅ Soluciones Implementadas

### 1. Actualización de `/lib/plaudern.ts`

**Cambios clave:**

#### A. Nueva Configuración

```typescript
// AGREGADO: Integration ID por defecto
const DEFAULT_INTEGRATION_ID = 'volkern-prod';
```

#### B. Función `getPlaudernBots()` Actualizada

```typescript
// ANTES
export async function getPlaudernBots(apiKey: string): Promise<PlaudernBot[]> {
  const response = await plaudernRequest('/api/config/bots', {
    method: 'GET',
    apiKey,
  });
  return response.bots || [];
}

// DESPUÉS
export async function getPlaudernBots(
  apiKey: string, 
  integrationId?: string
): Promise<PlaudernBot[]> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  const response = await plaudernRequest(
    `/api/integrations/plaudern/${intId}`, 
    { method: 'GET', apiKey }
  );
  return response.bots || response || [];
}
```

**Beneficios:**
- Usa el endpoint correcto de integración
- Soporta múltiples integration IDs por tenant
- Manejo flexible de la respuesta de la API

---

#### C. Función `getPlaudernBot()` Actualizada

```typescript
// ANTES
export async function getPlaudernBot(
  apiKey: string, 
  botId: string
): Promise<PlaudernBot> {
  const response = await plaudernRequest(`/api/config/bot/${botId}`, {
    method: 'GET',
    apiKey,
  });
  return response.bot;
}

// DESPUÉS
export async function getPlaudernBot(
  apiKey: string, 
  botId: string,
  integrationId?: string
): Promise<PlaudernBot> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  const response = await plaudernRequest(
    `/api/integrations/plaudern/${intId}/bots/${botId}`, 
    { method: 'GET', apiKey }
  );
  return response.bot || response;
}
```

---

#### D. Función `testPlaudernChat()` Actualizada

```typescript
// ANTES
export async function testPlaudernChat(
  apiKey: string,
  message: string,
  botId: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<{ response: string; sources?: any[] }> {
  const response = await plaudernRequest('/api/ai/test-rag', {
    method: 'POST',
    apiKey,
    body: JSON.stringify({
      message,
      botId,
      conversationHistory: conversationHistory || [],
    }),
  });
  return {
    response: response.response,
    sources: response.sources,
  };
}

// DESPUÉS
export async function testPlaudernChat(
  apiKey: string,
  message: string,
  botId?: string,
  integrationId?: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<{ response: string; sources?: any[] }> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  const response = await plaudernRequest(
    `/api/integrations/plaudern/${intId}/chat`, 
    {
      method: 'POST',
      apiKey,
      body: JSON.stringify({
        message,
        botId,
        conversationHistory: conversationHistory || [],
      }),
    }
  );
  return {
    response: response.response || response.message,
    sources: response.sources,
  };
}
```

**Mejoras:**
- Usa el endpoint de chat de integración
- `botId` ahora es opcional
- Manejo robusto de respuestas (`.response` o `.message`)

---

#### E. Función `checkPlaudernHealth()` Actualizada

```typescript
// ANTES
export async function checkPlaudernHealth(): Promise<{ 
  status: string; 
  message: string 
}> {
  const response = await fetch(`${PLAUDERN_BASE_URL}/health`, {
    method: 'GET',
  });
  const data = await response.json();
  return data;
}

// DESPUÉS
export async function checkPlaudernHealth(
  integrationId?: string
): Promise<{ status: string; message: string }> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  const response = await fetch(
    `${PLAUDERN_BASE_URL}/api/integrations/plaudern/${intId}/health`,
    { method: 'GET' }
  );
  
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  
  const data = await response.json();
  return {
    status: data.status || 'ok',
    message: data.message || 'API is healthy',
  };
}
```

**Mejoras:**
- Usa el endpoint de health check de integración
- Manejo de errores HTTP mejorado
- Valores por defecto para respuestas inconsistentes

---

### 2. Actualización de `/app/api/integraciones/plaudern/test/route.ts`

**Cambios clave:**

#### A. Extracción de `integrationId` del Request

```typescript
// ANTES
const { testType, apiKey, botId, message } = body;

// DESPUÉS
const { testType, apiKey, botId, message, integrationId } = body;

let finalIntegrationId = integrationId || 'volkern-prod';

// Si usa integración existente, usar su Integration ID
if (!finalApiKey) {
  const integration = await prisma.plaudernIntegration.findUnique({
    where: { tenantId: user.tenantId },
  });
  
  // ...
  
  // Generar Integration ID desde botName si está disponible
  if (integration.botName) {
    finalIntegrationId = integration.botName.toLowerCase().replace(/\s+/g, '-');
  }
}
```

**Beneficios:**
- Soporta Integration ID personalizado por tenant
- Genera ID automáticamente desde el nombre del bot
- Fallback al ID por defecto ('volkern-prod')

---

#### B. Actualización del Caso `connection`

```typescript
// DESPUÉS
case 'connection':
  try {
    const health = await checkPlaudernHealth(finalIntegrationId);
    const bots = await getPlaudernBots(finalApiKey, finalIntegrationId);

    return NextResponse.json({
      success: true,
      message: 'Conexión exitosa con Plaudern',
      integrationId: finalIntegrationId,  // ✅ Devuelve el ID usado
      health,
      bots: bots.map(bot => ({
        id: bot.id,
        name: bot.name,
        status: bot.status,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Error al conectar con Plaudern',
      details: error.message,
      hint: 'Verifica que tu API Key (JWT Token) sea correcta y que el servicio de Plaudern esté disponible. Puedes obtener tu token en https://plaudern.abacusai.app/api/auth/login',
    }, { status: 400 });
  }
```

**Mejoras:**
- Pasa `integrationId` a todas las funciones
- Devuelve el Integration ID usado en la respuesta
- Hint mejorado con enlace al login

---

#### C. Actualización del Caso `chat`

```typescript
// DESPUÉS
case 'chat':
  try {
    if (!message) {
      return NextResponse.json(
        { error: 'Mensaje requerido para probar chat' },
        { status: 400 }
      );
    }

    const chatResponse = await testPlaudernChat(
      finalApiKey,
      message,
      finalBotId,
      finalIntegrationId  // ✅ Pasa el Integration ID
    );

    return NextResponse.json({
      success: true,
      message: 'Chat probado exitosamente',
      integrationId: finalIntegrationId,  // ✅ Devuelve el ID usado
      response: chatResponse.response,
      sources: chatResponse.sources,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Error al probar el chat',
      details: error.message,
      hint: 'Asegúrate de que tu API Key (JWT Token) tenga los permisos necesarios.',
    }, { status: 400 });
  }
```

**Mejoras:**
- `botId` ahora es opcional para pruebas generales
- Pasa `integrationId` al chat
- Hints específicos sobre JWT y permisos

---

### 3. Actualización de `/app/dashboard/integraciones/page.tsx`

**Cambios en la UI:**

#### A. Nuevos Campos del Formulario

```typescript
// AGREGADO: Nuevo campo Integration ID
{ 
  name: 'integrationId', 
  label: 'Integration ID', 
  type: 'text', 
  placeholder: 'volkern-prod', 
  defaultValue: 'volkern-prod', 
  helper: 'ID único para esta integración' 
},

// ACTUALIZADO: Label más descriptivo
{ 
  name: 'apiKey', 
  label: 'API Key de Plaudern (JWT Token)', 
  type: 'password', 
  placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 
  required: true, 
  helper: 'Tu JWT Token de autenticación' 
},
```

---

#### B. Instrucciones Actualizadas

```typescript
// ACTUALIZADAS: Pasos con endpoints correctos
pasos: [
  '1. Obtén tu JWT Token:',
  '   • Si ya tienes cuenta: POST https://plaudern.abacusai.app/api/auth/login',
  '   • Si no tienes cuenta: POST https://plaudern.abacusai.app/api/auth/register',
  '   • El response incluirá tu access_token (JWT)',
  '2. Copia tu JWT Token (empieza con "eyJ...")',
  '3. Ingresa el Integration ID (por defecto: volkern-prod)',
  '4. Opcional: Si tienes múltiples bots, ingresa el Bot ID específico',
  '5. Configura el webhook en Plaudern Dashboard:',
  '   • URL: https://volkern.app/api/integrations/plaudern/{integration_id}/webhooks',
  '   • Eventos: message.received, message.sent, conversation.created',
  '   • Secret: El mismo que ingresaste aquí (si lo usas)',
  '6. Los mensajes se sincronizarán automáticamente al CRM'
],
```

**Mejoras:**
- Guía clara para obtener JWT Token
- Endpoints correctos para webhooks
- Referencia al Integration ID

---

#### C. Llamada al Test Actualizada

```typescript
// AGREGADO: integrationId en el request
const res = await fetch('/api/integraciones/plaudern/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    testType: 'connection',
    apiKey: formData.apiKey,
    botId: formData.botId || null,
    integrationId: formData.integrationId || 'volkern-prod'  // ✅ Nuevo
  }),
  signal: controller.signal
})
```

---

## 📊 Comparación: Antes vs Ahora

### Estructura de Endpoints

| Operación | Antes (❌ Incorrecto) | Ahora (✅ Correcto) |
|-----------|----------------------|---------------------|
| Listar bots | `/api/config/bots` | `/api/integrations/plaudern/{integration_id}` |
| Bot específico | `/api/config/bot/{botId}` | `/api/integrations/plaudern/{integration_id}/bots/{botId}` |
| Chat | `/api/ai/test-rag` | `/api/integrations/plaudern/{integration_id}/chat` |
| Health check | `/health` | `/api/integrations/plaudern/{integration_id}/health` |
| Webhook URL | N/A | `/api/integrations/plaudern/{integration_id}/webhooks` |

---

### Autenticación

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Tipo de Key** | API Key genérica | JWT Token (access_token) |
| **Obtención** | No especificado | `/api/auth/login` o `/api/auth/register` |
| **Header** | `Authorization: Bearer {apiKey}` | `Authorization: Bearer {JWT}` |
| **Formato** | `pk_...` | `eyJhbGci...` |

---

### Flujo de Uso

#### Antes (❌)
```
Usuario → Configuración → API Key → Guardar
                                      ↓
                         ERROR: Endpoint no existe
```

#### Ahora (✅)
```
Usuario → Login Plaudern → JWT Token
           ↓
         Copiar Token
           ↓
         Configurar en Volkern
           ↓
         Seleccionar Integration ID
           ↓
         Probar Conexión → ✅ Éxito
           ↓
         Guardar → Integración Activa
```

---

## 🧪 Casos de Prueba

### Caso 1: Test de Conexión Exitoso

**Request:**
```json
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "integrationId": "volkern-prod"
}
```

**Response esperado:**
```json
{
  "success": true,
  "message": "Conexión exitosa con Plaudern",
  "integrationId": "volkern-prod",
  "health": {
    "status": "ok",
    "message": "API is healthy"
  },
  "bots": [
    {
      "id": "bot_123",
      "name": "Mi Bot de Volkern",
      "status": "active"
    }
  ]
}
```

---

### Caso 2: Error de Autenticación

**Request:**
```json
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "invalid-token",
  "integrationId": "volkern-prod"
}
```

**Response esperado:**
```json
{
  "success": false,
  "error": "Error al conectar con Plaudern",
  "details": "Plaudern API error: 401",
  "hint": "Verifica que tu API Key (JWT Token) sea correcta y que el servicio de Plaudern esté disponible. Puedes obtener tu token en https://plaudern.abacusai.app/api/auth/login"
}
```

---

### Caso 3: Test de Chat

**Request:**
```json
POST /api/integraciones/plaudern/test
{
  "testType": "chat",
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "integrationId": "volkern-prod",
  "message": "Hola, necesito información sobre sus servicios"
}
```

**Response esperado:**
```json
{
  "success": true,
  "message": "Chat probado exitosamente",
  "integrationId": "volkern-prod",
  "response": "Hola, con gusto te ayudo. Ofrecemos servicios de...",
  "sources": [
    {
      "document": "servicios.pdf",
      "page": 1,
      "relevance": 0.95
    }
  ]
}
```

---

## 🚀 Cómo Obtener tu JWT Token

### Opción A: Usar cURL (Terminal)

#### Si ya tienes cuenta:
```bash
curl -X POST https://plaudern.abacusai.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.com","password":"tupassword"}' \
  | jq -r '.access_token'
```

#### Si no tienes cuenta:
```bash
curl -X POST https://plaudern.abacusai.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"tu@email.com",
    "password":"tupassword",
    "name":"Tu Nombre",
    "companyName":"Tu Empresa"
  }' | jq -r '.access_token'
```

---

### Opción B: Usar Postman/Thunder Client

**1. Login:**
```
POST https://plaudern.abacusai.app/api/auth/login
Headers: Content-Type: application/json
Body:
{
  "email": "tu@email.com",
  "password": "tupassword"
}

Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**2. Copiar el `access_token`**

---

## 📝 Archivos Modificados

```
✅ /lib/plaudern.ts
   - Agregado DEFAULT_INTEGRATION_ID
   - getPlaudernBots(): Nuevo parámetro integrationId
   - getPlaudernBot(): Nuevo parámetro integrationId
   - testPlaudernChat(): Nuevo parámetro integrationId, botId opcional
   - checkPlaudernHealth(): Nuevo parámetro integrationId
   - Todos los endpoints actualizados a estructura de integración

✅ /app/api/integraciones/plaudern/test/route.ts
   - Agregado manejo de integrationId
   - Actualizado caso 'connection' con integrationId
   - Actualizado caso 'chat' con integrationId
   - Hints mejorados con enlaces a documentación

✅ /app/dashboard/integraciones/page.tsx
   - Agregado campo 'integrationId' al formulario
   - Actualizado campo 'apiKey' con mejor descripción
   - Instrucciones completamente reescritas
   - Llamada al test actualizada con integrationId
```

---

## ✅ Checklist de Verificación

- [x] Endpoints actualizados a estructura de integración
- [x] JWT Token como método de autenticación
- [x] Integration ID configurable por tenant
- [x] Fallback a 'volkern-prod' por defecto
- [x] Instrucciones actualizadas en UI
- [x] Manejo de errores mejorado
- [x] Hints específicos para cada tipo de error
- [x] Proyecto compilado sin errores
- [x] Documentación actualizada

---

## 🆘 Troubleshooting

### Error: "No se pudieron obtener los bots"

**Causa:** JWT Token inválido o expirado

**Solución:**
1. Obtén un nuevo JWT Token:
   ```bash
   curl -X POST https://plaudern.abacusai.app/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"tu@email.com","password":"tupassword"}'
   ```
2. Copia el `access_token`
3. Actualiza la integración con el nuevo token

---

### Error: "Health check failed: 404"

**Causa:** Integration ID incorrecto

**Solución:**
1. Verifica que el Integration ID esté bien escrito
2. Usa el ID por defecto: `volkern-prod`
3. Si creaste un Integration ID personalizado en Plaudern, úsalo exactamente como está registrado

---

### Error: "Insufficient permissions"

**Causa:** El JWT Token no tiene los permisos necesarios

**Solución:**
1. Asegúrate de estar usando el token del usuario correcto
2. Verifica en Plaudern Dashboard que tu usuario tenga permisos de administrador
3. Si es necesario, crea un nuevo usuario con permisos completos

---

## 💡 Próximos Pasos Recomendados

### Fase 1 (Implementado ✅)
- ✅ Endpoints correctos de integración
- ✅ JWT Token authentication
- ✅ Integration ID configurable
- ✅ Mensajes de error descriptivos
- ✅ Instrucciones actualizadas

### Fase 2 (Futuro)
- 🔜 **Auto-refresh de JWT Token**: Refrescar automáticamente cuando expire
- 🔜 **Múltiples Integration IDs**: Permitir varios IDs por tenant para diferentes bots
- 🔜 **Wizard de Configuración**: Asistente paso a paso para obtener JWT
- 🔜 **Test de Webhooks**: Verificar que los webhooks lleguen correctamente
- 🔜 **Métricas de Uso**: Tracking de llamadas a la API de Plaudern

---

¡Integración de Plaudern ahora usando los endpoints correctos! 🎉
