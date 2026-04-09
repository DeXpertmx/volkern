
# Fix: Plaudern Integration Test - Missing Authentication in Health Check

## 📋 Resumen del Problema

Los usuarios recibían un **error 400 (Bad Request)** al probar la conexión con Plaudern usando el botón "Probar Conexión" en el módulo de integraciones.

```
POST https://volkern.app/api/integraciones/plaudern/test 400 (Bad Request)
```

## 🔍 Análisis del Problema

### Causa Raíz

La función `checkPlaudernHealth()` en `/lib/plaudern.ts` estaba realizando una llamada al endpoint de health check de Plaudern **sin autenticación**:

```typescript
// ❌ ANTES (Sin autenticación)
export async function checkPlaudernHealth(integrationId?: string) {
  const response = await fetch(
    `https://plaudern.abacusai.app/api/integrations/plaudern/${intId}/health`,
    {
      method: 'GET',
      // ❌ NO enviaba el Bearer Token
    }
  );
}
```

### Por Qué Fallaba

Según la documentación de Plaudern API, **TODOS** los endpoints requieren autenticación con JWT Token (Bearer Token):

```
Autenticación: Bearer Token (JWT)
```

Los endpoints disponibles son:
- `GET /api/integrations/plaudern/volkern-prod` - **Requiere Bearer Token**
- `POST /api/integrations/plaudern/volkern-prod/chat` - **Requiere Bearer Token**
- `POST /api/integrations/plaudern/volkern-prod/webhooks` - **Requiere Bearer Token**
- `GET /api/integrations/plaudern/volkern-prod/health` - **Requiere Bearer Token** ⚠️

Al no enviar el token de autenticación, Plaudern rechazaba la solicitud con un error 400.

---

## ✅ Solución Implementada

### 1. Actualización de `checkPlaudernHealth()` en `/lib/plaudern.ts`

**Cambios realizados:**

```typescript
// ✅ AHORA (Con autenticación completa)
export async function checkPlaudernHealth(
  apiKey: string,  // ✅ Ahora requiere API Key
  integrationId?: string
): Promise<{ status: string; message: string }> {
  try {
    const intId = integrationId || DEFAULT_INTEGRATION_ID;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(
      `${PLAUDERN_BASE_URL}/api/integrations/plaudern/${intId}/health`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,  // ✅ Ahora envía el JWT Token
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Health check failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      status: data.status || 'ok',
      message: data.message || 'API is healthy',
    };
  } catch (error: any) {
    console.error('Error checking Plaudern health:', error);
    if (error.name === 'AbortError') {
      throw new Error('Health check timeout - Plaudern API no responde');
    }
    throw new Error(`Health check error: ${error.message}`);
  }
}
```

**Mejoras Implementadas:**

- ✅ **Autenticación con Bearer Token**: Ahora envía el JWT Token en el header `Authorization`
- ✅ **Control de Timeout**: Usa `AbortController` para timeout de 30 segundos
- ✅ **Manejo de Errores Mejorado**: Captura y reporta errores específicos
- ✅ **Logs Detallados**: Ayuda a debugging con `console.error`

---

### 2. Actualización del Endpoint de Test

**Archivo:** `/app/api/integraciones/plaudern/test/route.ts`

**Cambio en la llamada:**

```typescript
// ❌ ANTES
const health = await checkPlaudernHealth(finalIntegrationId);

// ✅ AHORA
const health = await checkPlaudernHealth(finalApiKey, finalIntegrationId);
```

**Logs de Debugging Añadidos:**

```typescript
case 'connection':
  try {
    console.log(`🔍 Testing Plaudern connection with Integration ID: ${finalIntegrationId}`);
    
    const health = await checkPlaudernHealth(finalApiKey, finalIntegrationId);
    console.log(`✓ Health check passed:`, health);
    
    const bots = await getPlaudernBots(finalApiKey, finalIntegrationId);
    console.log(`✓ Found ${bots.length} bots`);

    return NextResponse.json({
      success: true,
      message: 'Conexión exitosa con Plaudern',
      integrationId: finalIntegrationId,
      health,
      bots: [...]
    });
  } catch (error: any) {
    console.error('❌ Error en prueba de conexión:', error);
    return NextResponse.json({
      success: false,
      error: 'Error al conectar con Plaudern',
      details: error.message,
      hint: 'Verifica que tu API Key (JWT Token) sea correcta...',
    }, { status: 400 });
  }
```

**Beneficios:**
- 🔍 **Logs de Debugging**: Facilita identificar problemas
- ✅ **Validación Clara**: Verifica cada paso del proceso
- 📝 **Mensajes Descriptivos**: Ayuda al usuario a entender qué sucede

---

## 📊 Flujo Actualizado

### Flujo Completo de Prueba de Conexión

```
Usuario → Click en "Probar Conexión"
           ↓
Frontend → POST /api/integraciones/plaudern/test
           Body: { 
             testType: 'connection',
             apiKey: 'eyJhbGci...',
             integrationId: 'volkern-prod'
           }
           ↓
Backend → Verifica autenticación del usuario
           ↓
Backend → Llama a checkPlaudernHealth(apiKey, integrationId)
           ↓
           🔐 Headers enviados:
              Authorization: Bearer eyJhbGci...
              Content-Type: application/json
           ↓
Plaudern API → GET /api/integrations/plaudern/volkern-prod/health
                ✅ Valida JWT Token
                ✅ Retorna { status: 'ok', message: '...' }
           ↓
Backend → Llama a getPlaudernBots(apiKey, integrationId)
           ↓
           🔐 Headers enviados:
              Authorization: Bearer eyJhbGci...
           ↓
Plaudern API → GET /api/integrations/plaudern/volkern-prod
                ✅ Valida JWT Token
                ✅ Retorna { bots: [...] }
           ↓
Backend → Retorna resultado exitoso
           {
             success: true,
             message: 'Conexión exitosa con Plaudern',
             integrationId: 'volkern-prod',
             health: { status: 'ok', ... },
             bots: [...]
           }
           ↓
Frontend → ✅ Muestra toast de éxito
```

---

## 🧪 Casos de Prueba

### Caso 1: Prueba Exitosa con Token Válido

**Configuración:**
```json
{
  "API Key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "Integration ID": "volkern-prod",
  "Webhook Secret": "secret-seguro"
}
```

**Request:**
```bash
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "eyJhbGci...",
  "integrationId": "volkern-prod"
}
```

**Response Esperada:**
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
      "name": "Mi Bot de Atención",
      "status": "active"
    }
  ]
}
```

**Logs en Consola:**
```
🔍 Testing Plaudern connection with Integration ID: volkern-prod
✓ Health check passed: { status: 'ok', message: 'API is healthy' }
✓ Found 1 bots
```

---

### Caso 2: Token JWT Inválido

**Request:**
```bash
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "invalid-token",
  "integrationId": "volkern-prod"
}
```

**Response Esperada:**
```json
{
  "success": false,
  "error": "Error al conectar con Plaudern",
  "details": "Health check failed (401): Unauthorized",
  "hint": "Verifica que tu API Key (JWT Token) sea correcta, que tenga los permisos necesarios y que el servicio de Plaudern esté disponible. El token debe empezar con \"eyJ...\" y tener formato JWT válido."
}
```

**Logs en Consola:**
```
🔍 Testing Plaudern connection with Integration ID: volkern-prod
❌ Error en prueba de conexión: Health check failed (401): Unauthorized
```

---

### Caso 3: Token JWT Expirado

**Request:**
```bash
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired...",
  "integrationId": "volkern-prod"
}
```

**Response Esperada:**
```json
{
  "success": false,
  "error": "Error al conectar con Plaudern",
  "details": "Health check failed (401): Token expired",
  "hint": "Verifica que tu API Key (JWT Token) sea correcta, que tenga los permisos necesarios y que el servicio de Plaudern esté disponible. El token debe empezar con \"eyJ...\" y tener formato JWT válido."
}
```

**Solución:** Obtener un nuevo JWT Token desde Plaudern:
```bash
curl -X POST https://plaudern.abacusai.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.com","password":"tupassword"}'
```

---

### Caso 4: Integration ID Incorrecto

**Request:**
```bash
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "eyJhbGci...",
  "integrationId": "invalid-integration"
}
```

**Response Esperada:**
```json
{
  "success": false,
  "error": "Error al conectar con Plaudern",
  "details": "Health check failed (404): Integration not found",
  "hint": "Verifica que tu API Key (JWT Token) sea correcta, que tenga los permisos necesarios y que el servicio de Plaudern esté disponible. El token debe empezar con \"eyJ...\" y tener formato JWT válido."
}
```

**Solución:** Usar el Integration ID correcto: `volkern-prod`

---

### Caso 5: Plaudern API No Disponible

**Request:**
```bash
POST /api/integraciones/plaudern/test
{
  "testType": "connection",
  "apiKey": "eyJhbGci...",
  "integrationId": "volkern-prod"
}
```

**Response Esperada:**
```json
{
  "success": false,
  "error": "Error al conectar con Plaudern",
  "details": "Health check timeout - Plaudern API no responde",
  "hint": "Verifica que tu API Key (JWT Token) sea correcta, que tenga los permisos necesarios y que el servicio de Plaudern esté disponible. El token debe empezar con \"eyJ...\" y tener formato JWT válido."
}
```

**Logs en Consola:**
```
🔍 Testing Plaudern connection with Integration ID: volkern-prod
Error checking Plaudern health: AbortError
❌ Error en prueba de conexión: Health check timeout - Plaudern API no responde
```

---

## 📝 Guía para el Usuario

### Pasos para Probar la Conexión

#### 1. Obtener JWT Token

Si aún no tienes tu JWT Token, obtenlo desde Plaudern:

**Opción A: API (cURL)**
```bash
curl -X POST https://plaudern.abacusai.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu@email.com",
    "password": "tupassword"
  }'
```

**Respuesta:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Opción B: Dashboard de Plaudern**
1. Ve a https://plaudern.abacusai.app/dashboard
2. Inicia sesión
3. Ve a "Configuración" → "API Keys"
4. Copia tu JWT Token

---

#### 2. Configurar en Volkern CRM

1. Ve a **Dashboard → Integraciones**
2. Busca **Plaudern Chatbot**
3. Haz clic en **Configurar**
4. Llena los campos:
   - **API Key de Plaudern (JWT Token)**: `eyJhbGci...` (tu JWT completo)
   - **Integration ID**: `volkern-prod`
   - **Webhook Secret** (opcional): `secret-seguro`
5. Haz clic en **Probar Conexión**

---

#### 3. Resultado Esperado

**Si todo está bien:**
- ✅ Toast verde: "Conexión exitosa con Plaudern"
- ✅ Verás la lista de bots disponibles
- ✅ Estado de salud del API

**Si hay error:**
- ❌ Toast rojo con el mensaje de error
- ℹ️ Revisa el mensaje de "hint" para solucionar

---

## 🔧 Troubleshooting

### Error: "Health check failed (401): Unauthorized"

**Causa:** JWT Token inválido o expirado

**Solución:**
1. Verifica que el token empiece con `eyJ...`
2. Verifica que sea un JWT válido completo (3 partes separadas por `.`)
3. Obtén un nuevo token desde Plaudern (los JWT expiran)
4. Copia el token completo sin espacios adicionales

---

### Error: "Health check failed (404): Integration not found"

**Causa:** Integration ID incorrecto

**Solución:**
1. Verifica que uses `volkern-prod` como Integration ID
2. Si usas otro, asegúrate de que exista en tu cuenta de Plaudern

---

### Error: "Health check timeout - Plaudern API no responde"

**Causa:** Plaudern API está caído o hay problemas de red

**Solución:**
1. Verifica que https://plaudern.abacusai.app esté accesible
2. Espera unos minutos y vuelve a intentar
3. Contacta al soporte de Plaudern si el problema persiste

---

### Error: "No hay integración configurada"

**Causa:** No has guardado la configuración antes de probar

**Solución:**
1. Primero haz clic en **Guardar**
2. Luego haz clic en **Probar Conexión**

---

## 🎯 Ventajas de la Solución

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Autenticación** | ❌ Sin token | ✅ Bearer Token correcto |
| **Manejo de Errores** | ⚠️ Genérico | ✅ Específico y descriptivo |
| **Debugging** | 🔍 Sin logs | ✅ Logs detallados |
| **Timeout** | ⏱️ Sin control | ✅ 30 segundos |
| **Experiencia Usuario** | 😕 Confusa | ✅ Clara y guiada |

---

## 📚 Documentación Técnica

### Estructura del JWT Token

Un JWT válido tiene 3 partes separadas por puntos:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.      ← Header
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4...  ← Payload
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c    ← Signature
```

**Validación del Token:**
- ✅ Debe empezar con `eyJ`
- ✅ Debe tener exactamente 3 partes
- ✅ Cada parte debe ser Base64URL válida
- ✅ No debe estar expirado

---

### Headers Enviados en Todas las Requests

```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
}
```

Estos headers son **obligatorios** para todos los endpoints de Plaudern.

---

### Endpoints de Plaudern que Requieren Autenticación

| Endpoint | Método | Autenticación | Propósito |
|----------|--------|---------------|-----------|
| `/api/integrations/plaudern/{id}/health` | GET | ✅ Bearer Token | Health check |
| `/api/integrations/plaudern/{id}` | GET | ✅ Bearer Token | Listar bots |
| `/api/integrations/plaudern/{id}/chat` | POST | ✅ Bearer Token | Enviar mensaje |
| `/api/integrations/plaudern/{id}/webhooks` | POST | ✅ Bearer Token | Configurar webhooks |

**IMPORTANTE:** Ningún endpoint funciona sin el Bearer Token.

---

## ✅ Checklist de Verificación

- [x] `checkPlaudernHealth()` ahora requiere y usa `apiKey`
- [x] Endpoint de test pasa `apiKey` a `checkPlaudernHealth()`
- [x] Headers de autenticación incluyen `Bearer Token`
- [x] Manejo de timeout con `AbortController`
- [x] Logs de debugging detallados
- [x] Mensajes de error descriptivos con hints
- [x] Proyecto compila sin errores TypeScript
- [x] Documentación completa actualizada

---

## 🚀 Próximos Pasos Recomendados

### Para el Usuario

1. ✅ **Obtén tu JWT Token** desde Plaudern Dashboard
2. ✅ **Configura la integración** en Volkern CRM
3. ✅ **Prueba la conexión** con el botón "Probar Conexión"
4. ✅ **Crea tu primer bot** desde Dashboard → Plaudern
5. ✅ **Configura webhooks** para sincronización automática

### Para el Equipo de Desarrollo

#### Fase 1 (Completada ✅)
- ✅ Autenticación correcta en todos los endpoints
- ✅ Manejo de errores mejorado
- ✅ Logs de debugging implementados

#### Fase 2 (Futuro)
- 🔜 Auto-refresh de JWT Tokens expirados
- 🔜 Almacenamiento seguro de JWT Token (encrypted)
- 🔜 Notificaciones cuando el token está por expirar
- 🔜 Panel de métricas de uso de API de Plaudern
- 🔜 Webhook signature validation
- 🔜 Rate limiting en requests a Plaudern

---

## 📁 Archivos Modificados

```
✅ /lib/plaudern.ts
   - Actualizada función checkPlaudernHealth()
   - Agregada autenticación con Bearer Token
   - Mejorado manejo de errores y timeout

✅ /app/api/integraciones/plaudern/test/route.ts
   - Actualizado para pasar apiKey a checkPlaudernHealth()
   - Agregados logs de debugging detallados
   - Mejorados mensajes de error con hints

📄 /PLAUDERN_AUTH_FIX.md (Nuevo)
   - Documentación completa del fix
   - Guías de troubleshooting
   - Casos de prueba
```

---

## 💡 Lecciones Aprendidas

1. **Siempre verificar requisitos de autenticación**: Aunque un endpoint parezca de "health check", puede requerir autenticación.

2. **Logs son esenciales**: Los logs con emojis (`🔍`, `✓`, `❌`) facilitan enormemente el debugging en producción.

3. **Mensajes descriptivos salvan tiempo**: Un buen mensaje de error con "hint" ahorra horas de soporte.

4. **Timeouts son obligatorios**: Cualquier llamada a API externa debe tener timeout para evitar hangs.

5. **Documentación exhaustiva previene problemas**: Esta guía ayudará a futuros usuarios y desarrolladores.

---

¡Integración de Plaudern ahora completamente funcional con autenticación correcta! 🎉
