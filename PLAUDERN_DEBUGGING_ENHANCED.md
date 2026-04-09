
# 🔍 Mejora del Debugging en Plaudern Chatbot

## 📋 Resumen

Se han implementado mejoras significativas en el sistema de logging y debugging para identificar la causa raíz de los errores 500 en las operaciones de edición y eliminación de bots de Plaudern.

---

## ❌ Problema Reportado

El usuario reporta los siguientes errores persistentes:

```
DELETE https://volkern.app/api/plaudern/bots/[id] → 500 (Internal Server Error)
PUT https://volkern.app/api/plaudern/bots/[id] → 500 (Internal Server Error)
```

Estos errores ocurren a pesar de que el código fue corregido previamente para usar los endpoints correctos de Plaudern.

---

## 🔧 Mejoras Implementadas

### 1. **Enhanced Logging en `plaudernRequest()`**

**Archivo:** `/lib/plaudern.ts`

Se mejoró la función `plaudernRequest()` para capturar más detalles sobre cada solicitud HTTP:

```typescript
async function plaudernRequest(
  endpoint: string,
  options: RequestInit & { apiKey: string; timeout?: number }
): Promise<any> {
  // ...
  try {
    const fullUrl = `${PLAUDERN_BASE_URL}${endpoint}`;
    console.log(`🌐 Plaudern ${fetchOptions.method || 'GET'} Request: ${fullUrl}`);
    
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...fetchOptions.headers,
      },
      signal: controller.signal,
    });

    console.log(`📊 Plaudern Response Status: ${response.status} ${response.statusText}`);

    // Try to parse JSON response
    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.log(`📝 Plaudern Response (non-JSON):`, text);
      data = { rawResponse: text };
    }

    if (!response.ok) {
      const errorMessage = data.message || data.error || data.rawResponse || `Plaudern API error: ${response.status}`;
      console.error(`❌ Plaudern API Error:`, {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        errorData: data
      });
      throw new Error(errorMessage);
    }

    console.log(`✅ Plaudern Request Success:`, endpoint);
    return data;
  } catch (error: any) {
    // Enhanced error logging...
  }
}
```

**Mejoras:**
- ✅ Log de la URL completa de cada request
- ✅ Log del status HTTP y status text
- ✅ Manejo robusto de respuestas no-JSON
- ✅ Captura de `data.message`, `data.error`, o texto raw
- ✅ Log detallado de errores con contexto completo

---

### 2. **Enhanced Logging en `updatePlaudernBot()`**

**Archivo:** `/lib/plaudern.ts`

```typescript
export async function updatePlaudernBot(
  apiKey: string,
  botId: string,
  updates: Partial<PlaudernBot>,
  integrationId?: string
): Promise<PlaudernBot> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  
  try {
    console.log(`🔄 Updating bot ${botId} in integration ${intId}`);
    console.log(`📤 Update payload:`, JSON.stringify(updates));
    
    const response = await plaudernRequest(`/api/integrations/plaudern/${intId}/bots/${botId}`, {
      method: 'PUT',
      apiKey,
      body: JSON.stringify(updates),
    });

    console.log(`✓ Bot ${botId} updated successfully in integration ${intId}`);
    return response.bot || response;
  } catch (error: any) {
    console.error('❌ Error updating Plaudern bot:', {
      botId,
      integrationId: intId,
      errorMessage: error.message,
      errorStack: error.stack
    });
    // Re-throw with more context
    throw error;
  }
}
```

**Mejoras:**
- ✅ Log del `botId` y `integrationId` en uso
- ✅ Log del payload completo enviado a Plaudern
- ✅ Captura de error con contexto completo (botId, integrationId, message, stack)
- ✅ Re-throw del error original para mantener el mensaje de Plaudern

---

### 3. **Enhanced Logging en `deletePlaudernBot()`**

**Archivo:** `/lib/plaudern.ts`

```typescript
export async function deletePlaudernBot(
  apiKey: string,
  botId: string,
  integrationId?: string
): Promise<void> {
  const intId = integrationId || DEFAULT_INTEGRATION_ID;
  
  try {
    console.log(`🗑️  Deleting bot ${botId} from integration ${intId}`);
    console.log(`🔗 DELETE URL: ${PLAUDERN_BASE_URL}/api/integrations/plaudern/${intId}/bots/${botId}`);
    
    await plaudernRequest(`/api/integrations/plaudern/${intId}/bots/${botId}`, {
      method: 'DELETE',
      apiKey,
    });

    console.log(`✓ Bot ${botId} deleted successfully`);
  } catch (error: any) {
    console.error('❌ Error deleting Plaudern bot:', {
      botId,
      integrationId: intId,
      errorMessage: error.message,
      errorStack: error.stack
    });
    // Re-throw with more context
    throw error;
  }
}
```

**Mejoras:**
- ✅ Log de la URL completa del DELETE
- ✅ Log del `botId` y `integrationId` en uso
- ✅ Captura de error con contexto completo

---

## 📊 Información de Configuración Actual

Verificamos la configuración actual de Plaudern en la base de datos:

```javascript
{
  "id": "cmi6dkj2e0001o308m4x21pvk",
  "tenantId": "cmhmjkvra0000p99kz0pjz7k5",
  "botName": null,
  "activo": true,
  "botId": ""
}
```

**Observaciones:**
- `botName` es `null`, por lo que se usa el valor por defecto: `'volkern-prod'`
- La integración está activa
- No hay `botId` configurado por defecto

---

## 🔍 Próximos Pasos para Debugging

### Para el Usuario:

1. **Volver a intentar la operación**
   - Intenta editar o eliminar un bot
   - Los nuevos logs deberían aparecer en la consola del navegador (F12)

2. **Revisar los Logs del Servidor**
   - Si tienes acceso a los logs del servidor de Volkern, busca las líneas que contienen:
     - `🌐 Plaudern PUT/DELETE Request:`
     - `📊 Plaudern Response Status:`
     - `❌ Plaudern API Error:`

3. **Compartir el Error Específico**
   - Con los nuevos logs, el mensaje de error debería ser mucho más descriptivo
   - Copia el mensaje de error completo y compártelo

### Posibles Causas Raíz:

1. **API Key Inválido o Expirado**
   - El JWT token puede haber expirado
   - Solución: Reconectar la integración de Plaudern

2. **Bot ID No Existe en Plaudern**
   - El bot puede haber sido eliminado externamente
   - Solución: Verificar que el bot existe en Plaudern

3. **Integration ID Incorrecto**
   - El `integration_id` puede no coincidir con la configuración en Plaudern
   - Solución: Verificar el valor correcto en la configuración de Plaudern

4. **Permisos Insuficientes**
   - El JWT token puede no tener permisos para editar/eliminar bots
   - Solución: Verificar los scopes del token en Plaudern

5. **Endpoint Incorrecto**
   - Aunque corregimos los endpoints, Plaudern puede haber cambiado la estructura
   - Solución: Verificar la documentación actualizada de Plaudern

---

## 📝 Logs Esperados

### Para una operación exitosa de UPDATE:

```
🔄 Updating bot 7d786352-5e5d-429c-b8cb-1d93fd577e57 in integration volkern-prod
📤 Update payload: {"name":"Mi Bot","personality":"Amigable","greetingMessage":"Hola"}
🌐 Plaudern PUT Request: https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod/bots/7d786352-5e5d-429c-b8cb-1d93fd577e57
📊 Plaudern Response Status: 200 OK
✅ Plaudern Request Success: /api/integrations/plaudern/volkern-prod/bots/7d786352-5e5d-429c-b8cb-1d93fd577e57
✓ Bot 7d786352-5e5d-429c-b8cb-1d93fd577e57 updated successfully in integration volkern-prod
```

### Para una operación exitosa de DELETE:

```
🗑️  Deleting bot f169b839-7163-4087-a5fa-9a8689bf3110 from integration volkern-prod
🔗 DELETE URL: https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod/bots/f169b839-7163-4087-a5fa-9a8689bf3110
🌐 Plaudern DELETE Request: https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod/bots/f169b839-7163-4087-a5fa-9a8689bf3110
📊 Plaudern Response Status: 200 OK
✅ Plaudern Request Success: /api/integrations/plaudern/volkern-prod/bots/f169b839-7163-4087-a5fa-9a8689bf3110
✓ Bot f169b839-7163-4087-a5fa-9a8689bf3110 deleted successfully
```

### Para un error (ejemplo con JWT expirado):

```
🔄 Updating bot 7d786352-5e5d-429c-b8cb-1d93fd577e57 in integration volkern-prod
📤 Update payload: {"name":"Mi Bot","personality":"Amigable"}
🌐 Plaudern PUT Request: https://plaudern.abacusai.app/api/integrations/plaudern/volkern-prod/bots/7d786352-5e5d-429c-b8cb-1d93fd577e57
📊 Plaudern Response Status: 401 Unauthorized
❌ Plaudern API Error: {
  status: 401,
  statusText: 'Unauthorized',
  endpoint: '/api/integrations/plaudern/volkern-prod/bots/7d786352-5e5d-429c-b8cb-1d93fd577e57',
  errorData: { message: 'Token expired or invalid' }
}
❌ Error updating Plaudern bot: {
  botId: '7d786352-5e5d-429c-b8cb-1d93fd577e57',
  integrationId: 'volkern-prod',
  errorMessage: 'Token expired or invalid',
  errorStack: '...'
}
```

---

## ✅ Verificación

- [x] ✅ `plaudernRequest()` mejorado con logging detallado
- [x] ✅ `updatePlaudernBot()` con logs de payload y errores
- [x] ✅ `deletePlaudernBot()` con logs de URL y errores
- [x] ✅ Código compilado exitosamente
- [x] ✅ Manejo robusto de respuestas no-JSON
- [x] ✅ Re-throw de errores con contexto completo

---

## 🚀 Despliegue

La aplicación ha sido compilada exitosamente y está lista para ser desplegada a producción en `volkern.app`.

Los nuevos logs permitirán identificar exactamente qué está fallando en la comunicación con la API de Plaudern.

---

## 💡 Recomendación

**Por favor, intenta nuevamente las operaciones de editar o eliminar un bot.**

Con los nuevos logs, podremos ver:
1. La URL exacta que se está llamando
2. El status HTTP de respuesta de Plaudern
3. El mensaje de error específico de Plaudern
4. El stack trace completo

Esto nos permitirá identificar si el problema es:
- Autenticación (401/403)
- Recurso no encontrado (404)
- Error del servidor de Plaudern (500)
- Timeout
- Formato de datos incorrecto

---

**Fecha:** 2024-11-20  
**Status:** ✅ Logging Mejorado - Listo para Debugging  
**Próximo Paso:** Esperar logs del usuario para identificar causa raíz
