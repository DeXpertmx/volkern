
# 🔧 Guía de Diagnóstico: Evolution API + Volkern CRM

## 📋 Resumen del Problema

El sistema de WhatsApp multi-instancia no estaba funcionando correctamente. Se han implementado las siguientes mejoras:

### ✅ Correcciones Implementadas

1. **Mejorado manejo de QR Code** - Soporta múltiples formatos de respuesta de Evolution API
2. **Webhook receiver mejorado** - Mejor logging y manejo de eventos
3. **Endpoint de diagnóstico** - Nuevo endpoint para probar la conexión
4. **Logs detallados** - Trazabilidad completa de todos los eventos

---

## 🧪 Endpoint de Diagnóstico

Hemos creado un endpoint especial para diagnosticar problemas con Evolution API:

**URL:** `/api/integraciones/test-evolution`

### Cómo Usar el Endpoint de Diagnóstico

#### Opción 1: Prueba Básica (Recomendado)

```bash
curl -X POST https://volkern.app/api/integraciones/test-evolution \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=TU_SESSION_TOKEN" \
  -d '{"action": "basic"}'
```

Esta prueba verificará:
- ✅ Conexión con Evolution API
- ✅ Validez del API key
- ✅ Estado de tu instancia actual (si existe)
- ✅ Configuración de webhooks

#### Opción 2: Prueba Completa (Incluye Creación de Instancia)

```bash
curl -X POST https://volkern.app/api/integraciones/test-evolution \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=TU_SESSION_TOKEN" \
  -d '{"action": "create-test"}'
```

Esta prueba hará todo lo anterior más:
- ✅ Intentará crear una instancia de prueba
- ✅ Verificará que la instancia se crea correctamente
- ✅ Eliminará automáticamente la instancia de prueba

### Interpretación de Resultados

#### ✅ Resultado Exitoso

```json
{
  "success": true,
  "results": {
    "config": {
      "url": "https://api.dimension.expert",
      "hasApiKey": true,
      "apiKeyLength": 35
    },
    "tests": {
      "connectivity": {
        "success": true,
        "status": 200,
        "message": "Conexión exitosa",
        "instanceCount": 0
      },
      "userInstance": {
        "hasInstance": false
      },
      "webhookUrl": {
        "url": "https://volkern.app",
        "testEndpoint": "https://volkern.app/api/webhook/evolution/test-instance"
      }
    }
  }
}
```

#### ❌ Error de Conectividad

```json
{
  "tests": {
    "connectivity": {
      "success": false,
      "status": 401,
      "error": "Unauthorized"
    }
  }
}
```

**Solución:** Verifica que el API key de Evolution API sea correcto en las variables de entorno.

#### ❌ Error de Autenticación

```json
{
  "tests": {
    "connectivity": {
      "success": false,
      "status": 403,
      "error": "Invalid API key"
    }
  }
}
```

**Solución:** El API key no es válido. Obtén uno nuevo desde tu panel de Evolution API.

---

## 🔍 Paso a Paso: Cómo Diagnosticar Problemas

### Paso 1: Verificar Configuración de Evolution API

1. Abre la consola del navegador (F12)
2. Ve a **Dashboard → Configuración → Mi WhatsApp**
3. Haz clic en **"Conectar WhatsApp"**
4. Observa los logs en la consola:

```
🔧 Evolution API Configuration: {
  url: 'https://api.dimension.expert',
  hasApiKey: true,
  apiKeyLength: 35
}
```

Si ves `hasApiKey: false`, significa que falta el API key.

### Paso 2: Verificar Creación de Instancia

Cuando hagas clic en "Conectar WhatsApp", deberías ver:

```
🚀 Iniciando creación de instancia para usuario: user_xxx
📝 Nombre de instancia generado: Arktech1234
🌐 Endpoint Evolution API: https://api.dimension.expert/instance/create
📤 Request body: {"instanceName":"Arktech1234","qrcode":true,"integration":"WHATSAPP-BAILEYS"}
📥 Response status: 200 (o 201)
✅ Instancia creada en Evolution API
```

#### ❌ Error Común: "Error al crear instancia"

**Logs:**
```
❌ Error al crear instancia en Evolution API: {"message":"Invalid API key"}
📥 Response status: 401
```

**Solución:**
1. Verifica el API key en `.env`:
   ```bash
   EVOLUTION_API_KEY=AAF6FE6672CF-4584-BD64-D33D860ACD9D
   ```
2. Reinicia el servidor si cambiaste el `.env`

### Paso 3: Verificar Configuración de Webhooks

Después de crear la instancia, deberías ver:

```
🔗 Configurando webhooks para instancia: Arktech1234
🌐 Webhook URL: https://volkern.app/api/webhook/evolution/Arktech1234
📤 Webhook config: {
  "enabled": true,
  "url": "https://volkern.app/api/webhook/evolution/Arktech1234",
  "webhook_by_events": false,
  "webhook_base64": true,
  "events": [...]
}
📥 Webhook config response status: 200
✅ Webhooks configurados
```

#### ❌ Error Común: "Error al configurar webhooks"

**Logs:**
```
❌ Error al configurar webhooks: 404
⚠️ Continuando sin webhooks (puede configurarse después)
```

**Posibles Causas:**
1. La instancia no existe en Evolution API
2. El endpoint de webhooks no es el correcto
3. La URL de Volkern no es accesible desde Evolution API

**Solución:**
1. Verifica que https://volkern.app sea accesible públicamente
2. Configura los webhooks manualmente desde el panel de Evolution API

### Paso 4: Verificar Obtención de QR Code

Después de crear la instancia, deberías ver:

```
📱 Obteniendo QR Code para instancia: Arktech1234
🌐 Endpoint: https://i.ytimg.com/vi/ZcCtHKgnQCU/maxresdefault.jpg
📥 Response status: 200
📥 Response data: {...}
✅ QR Code obtenido exitosamente
```

#### ❌ Error Común: "QR Code no disponible"

**Logs:**
```
⚠️ QR Code no disponible en la respuesta
📝 Estructura de respuesta: {...}
```

**Solución:**
1. Espera unos segundos y haz clic en "Refrescar QR"
2. Verifica que la instancia esté en estado "connecting" en Evolution API
3. Si persiste, elimina la instancia y créala nuevamente

### Paso 5: Verificar Recepción de Webhooks

Cuando escanees el QR code, deberías ver en los logs del servidor:

```
📨 Webhook recibido para instancia: Arktech1234
📦 Evento: CONNECTION_UPDATE
📄 Datos completos: {"event":"CONNECTION_UPDATE","data":{"state":"open"}}
✅ Instancia encontrada en BD: xxx
🔍 Procesando CONNECTION_UPDATE...
🔄 Estado de conexión recibido: open
✅ Instancia conectada exitosamente
```

#### ❌ Error Común: "No se reciben webhooks"

**Posibles Causas:**
1. La URL de webhook no es accesible desde Evolution API
2. Los webhooks no están configurados correctamente
3. El firewall está bloqueando las peticiones

**Solución - Configuración Manual de Webhooks:**

1. Accede a tu panel de Evolution API
2. Selecciona tu instancia
3. Ve a la sección de "Webhooks"
4. Configura el webhook con estos datos:

```json
{
  "url": "https://volkern.app/api/webhook/evolution/[TU_INSTANCE_NAME]",
  "webhook_by_events": false,
  "webhook_base64": true,
  "events": [
    "QRCODE_UPDATED",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "CONNECTION_UPDATE"
  ]
}
```

5. Haz una prueba enviando un webhook de prueba

---

## 🛠️ Configuración Manual de Webhooks

Si la configuración automática falla, puedes configurar los webhooks manualmente:

### Usando cURL

```bash
curl -X POST https://api.dimension.expert/webhook/set/[INSTANCE_NAME] \
  -H "Content-Type: application/json" \
  -H "apikey: AAF6FE6672CF-4584-BD64-D33D860ACD9D" \
  -d '{
    "url": "https://volkern.app/api/webhook/evolution/[INSTANCE_NAME]",
    "webhook_by_events": false,
    "webhook_base64": true,
    "events": [
      "QRCODE_UPDATED",
      "CONNECTION_UPDATE",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE"
    ]
  }'
```

Reemplaza:
- `[INSTANCE_NAME]` con el nombre de tu instancia (ej: `Arktech1234`)
- El API key con tu clave real

### Verificar Configuración de Webhooks

```bash
curl https://api.dimension.expert/webhook/find/[INSTANCE_NAME] \
  -H "apikey: AAF6FE6672CF-4584-BD64-D33D860ACD9D"
```

Deberías recibir:

```json
{
  "enabled": true,
  "url": "https://volkern.app/api/webhook/evolution/Arktech1234",
  "webhookByEvents": false,
  "events": [...]
}
```

---

## 📊 Checklist de Verificación

Usa este checklist para verificar que todo esté configurado correctamente:

### Configuración de Evolution API
- [ ] Evolution API URL configurada: `https://api.dimension.expert`
- [ ] API Key configurado y válido
- [ ] API Key tiene permisos suficientes
- [ ] Evolution API es accesible desde Volkern

### Configuración de Volkern
- [ ] `EVOLUTION_API_URL` en `.env`
- [ ] `EVOLUTION_API_KEY` en `.env`
- [ ] `NEXTAUTH_URL` apunta a `https://volkern.app`
- [ ] El servidor está corriendo

### Instancia de WhatsApp
- [ ] Instancia se crea correctamente
- [ ] QR Code se genera
- [ ] Webhooks están configurados
- [ ] URL de webhook es accesible públicamente

### Conectividad
- [ ] https://volkern.app es accesible desde internet
- [ ] No hay firewall bloqueando Evolution API
- [ ] El puerto 443 está abierto
- [ ] SSL/TLS está configurado correctamente

---

## 🔧 Solución de Problemas Comunes

### Problema 1: "Error al crear instancia"

**Síntomas:**
- No se crea la instancia en Evolution API
- Error 401 o 403

**Solución:**
1. Verifica el API key:
   ```bash
   curl https://api.dimension.expert/instance/fetchInstances \
     -H "apikey: TU_API_KEY"
   ```
2. Si falla, obtén un nuevo API key desde el panel de Evolution API

### Problema 2: "QR Code no aparece"

**Síntomas:**
- La instancia se crea pero no hay QR
- El estado queda en "connecting"

**Solución:**
1. Espera 5-10 segundos
2. Haz clic en "Refrescar QR"
3. Si persiste, verifica los logs:
   ```
   📱 Obteniendo QR Code para instancia: xxx
   📥 Response data: {...}
   ```
4. La respuesta debe contener `base64`, `code` o `qrcode.base64`

### Problema 3: "No se actualiza el estado"

**Síntomas:**
- Escaneas el QR pero el estado no cambia a "conectado"
- No se reciben webhooks

**Solución:**
1. Verifica que los webhooks estén configurados:
   ```bash
   curl https://api.dimension.expert/webhook/find/[INSTANCE_NAME] \
     -H "apikey: TU_API_KEY"
   ```
2. Verifica que la URL de webhook sea correcta
3. Prueba el endpoint de webhook directamente:
   ```bash
   curl -X POST https://volkern.app/api/webhook/evolution/[INSTANCE_NAME] \
     -H "Content-Type: application/json" \
     -d '{"event":"CONNECTION_UPDATE","data":{"state":"open"}}'
   ```
4. Revisa los logs del servidor de Volkern

### Problema 4: "Webhooks no se reciben"

**Síntomas:**
- Evolution API envía webhooks pero Volkern no los recibe
- Los logs de Volkern no muestran webhooks entrantes

**Solución:**
1. Verifica que https://volkern.app sea accesible desde Evolution API:
   ```bash
   curl https://volkern.app/api/webhook/evolution/test
   ```
2. Verifica que no haya firewall bloqueando:
   - Revisa reglas de firewall en el servidor
   - Verifica que el puerto 443 esté abierto
3. Configura un webhook de prueba en Evolution API
4. Monitorea los logs del servidor de Volkern en tiempo real

---

## 📝 Logs Útiles

### Ver Logs del Servidor

```bash
# Si usas PM2
pm2 logs

# Si usas Node.js directamente
# Los logs aparecerán en la consola

# Si usas Docker
docker logs volkern-crm
```

### Logs que Debes Buscar

**Creación de Instancia:**
```
🚀 Iniciando creación de instancia para usuario: xxx
✅ Instancia creada en Evolution API
```

**Configuración de Webhooks:**
```
🔗 Configurando webhooks para instancia: xxx
✅ Webhooks configurados
```

**Recepción de Webhooks:**
```
📨 Webhook recibido para instancia: xxx
📦 Evento: CONNECTION_UPDATE
✅ Instancia conectada exitosamente
```

---

## 🎯 Próximos Pasos

Si después de seguir esta guía el problema persiste:

1. **Ejecuta el endpoint de diagnóstico** y comparte los resultados
2. **Revisa los logs del servidor** y busca mensajes de error
3. **Verifica la configuración de Evolution API** en tu panel
4. **Prueba manualmente** la creación de instancias con cURL
5. **Contacta al soporte de Evolution API** si el problema está en su lado

---

## 📞 Información de Soporte

**Documentación de Evolution API:**
- https://doc.evolution-api.com

**Volkern CRM:**
- URL de la app: https://volkern.app
- Endpoint de diagnóstico: https://volkern.app/api/integraciones/test-evolution

**Credenciales Actuales:**
- Evolution API URL: `https://api.dimension.expert`
- Evolution API Key: `AAF6FE6672CF-4584-BD64-D33D860ACD9D`

---

## ✅ Verificación Final

Una vez que hayas seguido todos los pasos, verifica que:

1. [ ] El endpoint de diagnóstico retorna `success: true`
2. [ ] Puedes crear una instancia sin errores
3. [ ] El QR Code aparece correctamente
4. [ ] Al escanear el QR, el estado cambia a "conectado"
5. [ ] Puedes ver tu foto de perfil y nombre en la página de "Mi WhatsApp"
6. [ ] Los webhooks están configurados correctamente
7. [ ] Los mensajes se sincronizan correctamente

---

**Última actualización:** 13 de Noviembre de 2025  
**Versión:** 1.1.0  
**Estado:** En producción con mejoras de diagnóstico
