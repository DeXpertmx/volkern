
# 🔔 Sistema de Webhooks de Entrada - Volkern CRM

## 📋 Resumen

Se ha implementado un **sistema completo de webhooks de entrada genéricos** que permite a Volkern CRM recibir datos desde plataformas de automatización como n8n, Make, Zapier, Integromat y cualquier servicio externo que soporte webhooks.

---

## ✨ Características Principales

### 1. **URLs Únicas y Seguras**
- Cada webhook tiene un **UUID único** en la URL
- Soporte opcional de **validación HMAC SHA-256** para seguridad
- Monitoreo de IP y User-Agent de cada request

### 2. **Acciones Configurables**
El sistema soporta 5 tipos de acciones diferentes:

| Acción | Descripción | Uso Principal |
|--------|-------------|---------------|
| **Crear Lead** | Crea un nuevo lead o actualiza uno existente | Captura de leads desde formularios externos |
| **Actualizar Lead** | Actualiza información de un lead existente | Enriquecimiento de datos desde servicios externos |
| **Crear Tarea** | Crea una tarea asociada a un lead | Automatización de seguimiento |
| **Disparar Automatización** | Ejecuta un workflow automatizado | Flujos de trabajo complejos |
| **Webhook Personalizado** | Solo registra el evento para procesamiento manual | Casos de uso específicos |

### 3. **Mapeo Flexible de Campos**
- Configura qué campos del payload corresponden a los datos del lead
- Soporte para **dot notation** (ej: `user.contact.email`)
- Mapeo personalizado para campos adicionales

### 4. **Monitoreo y Logs Completos**
- Historial detallado de todas las entregas
- Registro de payloads, headers y respuestas
- Estadísticas de uso y rendimiento
- Identificación de errores con mensajes descriptivos

### 5. **Testing Integrado**
- Función de prueba desde el dashboard
- Payload de ejemplo pre-configurado
- Validación inmediata de configuración

---

## 🏗️ Arquitectura del Sistema

### Modelos de Base de Datos

#### `IncomingWebhook`
```prisma
model IncomingWebhook {
  id          String  @id @default(uuid())
  tenantId    String
  userId      String
  nombre      String
  descripcion String?
  activo      Boolean @default(true)
  accion      String  @default("crear_lead")
  
  // Mapeo de campos
  mapeoNombre     String?
  mapeoEmail      String?
  mapeoTelefono   String?
  mapeoEmpresa    String?
  mapeoNotas      String?
  mapeoCustom     Json?
  
  // Automatización
  automationId String?
  
  // Seguridad
  secretKey   String?
  
  // Estadísticas
  totalRecibidos  Int      @default(0)
  ultimoRecibido  DateTime?
}
```

#### `IncomingWebhookDelivery`
```prisma
model IncomingWebhookDelivery {
  id            String  @id @default(cuid())
  webhookId     String
  tenantId      String
  
  // Datos de la request
  metodo        String  @default("POST")
  headers       Json?
  payload       Json
  ipAddress     String?
  userAgent     String?
  
  // Procesamiento
  estado        String  @default("exitoso")
  errorMensaje  String?
  
  // Resultados
  leadCreado    String?
  tareaCreada   String?
  automationRun String?
  
  fechaRecepcion DateTime @default(now())
}
```

---

## 🚀 Uso del Sistema

### 1. Crear un Webhook

1. **Acceder al Dashboard**
   - Ve a **Integraciones → Webhooks de Entrada**
   - O directamente: `/dashboard/integraciones/webhooks`

2. **Hacer clic en "Nuevo Webhook"**

3. **Configurar el Webhook**
   ```
   Nombre: Leads desde n8n
   Descripción: Captura de leads desde formulario de contacto
   Acción: Crear Lead
   ```

4. **Mapear Campos** (para Crear/Actualizar Lead)
   ```
   Campo Nombre: nombre
   Campo Email: email
   Campo Teléfono: telefono
   Campo Empresa: empresa
   Campo Notas: mensaje
   ```

5. **Seguridad (Opcional)**
   - ✅ Marcar "Generar Secret Key"
   - Se generará un secret automáticamente para validación HMAC

6. **Guardar**
   - Se generará una URL única
   - Ejemplo: `https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad`

---

### 2. Usar el Webhook en n8n

#### Paso 1: Agregar nodo "HTTP Request"
```javascript
{
  "method": "POST",
  "url": "https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "nombre": "{{ $json.nombre }}",
    "email": "{{ $json.email }}",
    "telefono": "{{ $json.telefono }}",
    "empresa": "{{ $json.empresa }}",
    "mensaje": "{{ $json.mensaje }}"
  }
}
```

#### Paso 2: Con Validación HMAC (Recomendado)
```javascript
// En n8n, agregar un nodo "Function" antes del HTTP Request
const crypto = require('crypto');

const payload = JSON.stringify({
  nombre: $input.item.json.nombre,
  email: $input.item.json.email,
  telefono: $input.item.json.telefono,
  empresa: $input.item.json.empresa,
  mensaje: $input.item.json.mensaje
});

const secret = 'TU_SECRET_KEY_AQUI'; // Cópialo desde Volkern
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

return {
  json: {
    payload: JSON.parse(payload),
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`
    }
  }
};
```

---

### 3. Usar el Webhook en Make (Integromat)

#### Configuración Básica
1. Agregar módulo "HTTP → Make a Request"
2. **URL**: Tu URL del webhook
3. **Method**: POST
4. **Body Type**: Raw
5. **Content Type**: JSON (application/json)
6. **Request Content**:
```json
{
  "nombre": "{{1.nombre}}",
  "email": "{{1.email}}",
  "telefono": "{{1.telefono}}",
  "empresa": "{{1.empresa}}",
  "mensaje": "{{1.mensaje}}"
}
```

#### Con Validación HMAC
Usar un módulo personalizado o función para generar la firma.

---

### 4. Usar el Webhook en Zapier

1. Agregar acción "Webhooks by Zapier → POST"
2. **URL**: Tu URL del webhook
3. **Payload Type**: JSON
4. **Data**:
   ```
   nombre: {{nombre}}
   email: {{email}}
   telefono: {{telefono}}
   empresa: {{empresa}}
   mensaje: {{mensaje}}
   ```

---

### 5. Usar con cURL (Testing Manual)

```bash
# Sin validación HMAC
curl -X POST https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "telefono": "+52 55 1234 5678",
    "empresa": "Empresa XYZ",
    "mensaje": "Solicito información sobre sus servicios"
  }'
```

```bash
# Con validación HMAC
SECRET="tu-secret-key-aqui"
PAYLOAD='{"nombre":"Juan Pérez","email":"juan@example.com"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

---

## 🔧 Configuración Avanzada

### Dot Notation para Campos Anidados

Si tu payload tiene esta estructura:
```json
{
  "user": {
    "contact": {
      "firstName": "Juan",
      "email": "juan@example.com"
    },
    "company": {
      "name": "Empresa XYZ"
    }
  }
}
```

Configura el mapeo así:
```
Campo Nombre: user.contact.firstName
Campo Email: user.contact.email
Campo Empresa: user.company.name
```

---

### Disparar Automatizaciones

1. **Crear Webhook con Acción "Disparar Automatización"**
2. **Seleccionar una automatización existente**
3. El webhook enviará estos datos al workflow:
   ```json
   {
     "trigger": "webhook_recibido",
     "webhookData": { /* tu payload */ },
     "webhookId": "f1c1a0ea-...",
     "tenantId": "..."
   }
   ```

4. **En el workflow, puedes acceder a los datos**:
   - `{{webhookData.nombre}}`
   - `{{webhookData.email}}`
   - etc.

---

### Validación HMAC Paso a Paso

#### 1. Generar Secret Key
- Al crear el webhook, marca "Generar Secret Key"
- Copia el secret generado (se muestra solo una vez)

#### 2. Calcular la Firma
```javascript
// Node.js
const crypto = require('crypto');
const payload = JSON.stringify(data);
const secret = 'TU_SECRET_KEY';
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');
```

```python
# Python
import hmac
import hashlib
import json

payload = json.dumps(data)
secret = 'TU_SECRET_KEY'
signature = hmac.new(
    secret.encode(),
    payload.encode(),
    hashlib.sha256
).hexdigest()
```

#### 3. Enviar Header
```
X-Webhook-Signature: sha256=<firma_calculada>
```

---

## 📊 Monitoreo y Logs

### Ver Entregas de un Webhook

1. Ve a la página de webhooks
2. Haz clic en **"Ver Entregas (X)"** en el webhook deseado
3. Verás:
   - ✅ **Entregas exitosas**: Con detalles del lead/tarea creado
   - ❌ **Entregas fallidas**: Con mensaje de error específico
   - 📋 **Payload completo**: Para debugging

### Estadísticas Disponibles

- **Total Recibidos**: Número total de webhooks procesados
- **Último Recibido**: Timestamp del último webhook
- **Tasa de Éxito**: Porcentaje de entregas exitosas
- **Leads Creados**: Leads generados desde este webhook
- **Automatizaciones Disparadas**: Workflows ejecutados

---

## 🐛 Troubleshooting

### Error 404 - Webhook No Encontrado
- ✅ Verifica que la URL sea correcta
- ✅ Asegúrate de que el webhook no haya sido eliminado
- ✅ Revisa que el UUID en la URL sea válido

### Error 401 - Firma Inválida
- ✅ Verifica que estés usando el secret correcto
- ✅ Asegúrate de calcular la firma sobre el payload exacto
- ✅ Usa el formato `sha256=<hash>` en el header

### Error 403 - Webhook Inactivo
- ✅ Activa el webhook desde el dashboard
- ✅ El botón de activar/desactivar está junto al nombre del webhook

### Error 500 - Error al Procesar
- ✅ Revisa los logs de entregas para ver el mensaje de error
- ✅ Verifica que el payload tenga la estructura correcta
- ✅ Asegúrate de que los campos mapeados existan en el payload

### Lead No Se Crea
- ✅ Verifica que el payload contenga `email` o `telefono`
- ✅ Revisa el mapeo de campos en la configuración
- ✅ Asegúrate de que los valores no sean `null` o vacíos

---

## 🎯 Casos de Uso

### 1. Captura de Leads desde Formulario Web
```
Acción: Crear Lead
Mapeo: nombre, email, telefono, mensaje
Uso: Formularios de contacto, landing pages, popups
```

### 2. Enriquecimiento de Leads con Hunter.io
```
Acción: Actualizar Lead
Mapeo: email (para buscar), empresa, linkedinUrl
Uso: Agregar datos profesionales a leads existentes
```

### 3. Notificaciones de Eventos Externos
```
Acción: Disparar Automatización
Automatización: "Notificar Equipo de Nuevo Lead"
Uso: Enviar notificaciones por Slack/Email cuando llega un lead
```

### 4. Integración con CRM Externo
```
Acción: Crear Lead
Mapeo: Custom fields desde tu CRM
Uso: Sincronización bidireccional de leads
```

### 5. Procesamiento de Pagos
```
Acción: Crear Tarea
Mapeo: email (del pagador), monto, concepto
Uso: Crear tarea de seguimiento post-pago
```

---

## 🔐 Mejores Prácticas de Seguridad

### 1. **Siempre Usa Secret Keys**
- Genera un secret único para cada webhook
- Nunca compartas el secret públicamente
- Rota los secrets periódicamente

### 2. **Valida el Origen**
- Revisa la IP de origen si es posible
- Usa HTTPS siempre
- Implementa rate limiting en tu lado si es necesario

### 3. **Monitorea Actividad Sospechosa**
- Revisa entregas fallidas frecuentes
- Alerta sobre firmas inválidas repetidas
- Monitorea el volumen de requests

### 4. **Limita el Acceso**
- Solo comparte la URL con servicios confiables
- Desactiva webhooks que no uses
- Elimina webhooks antiguos

---

## 📈 Métricas y KPIs

El sistema de webhooks permite medir:
- 📊 **Conversión**: % de webhooks que crean leads exitosamente
- ⏱️ **Latencia**: Tiempo de procesamiento promedio
- ✅ **Confiabilidad**: Tasa de éxito de entregas
- 🔄 **Uso**: Webhooks más activos
- 🎯 **Efectividad**: Leads generados por fuente

---

## 🚀 Próximas Mejoras Sugeridas

### Fase 2 (Opcional)
- 🔜 Retry automático en caso de fallo
- 🔜 Webhooks condicionales (filtros)
- 🔜 Transformaciones de datos (JavaScript inline)
- 🔜 Rate limiting por webhook
- 🔜 Webhooks salientes (outgoing)
- 🔜 Templates de payload
- 🔜 Webhooks con autenticación OAuth

---

## 📞 Soporte

Para problemas o preguntas:
1. Revisa los logs de entregas en el dashboard
2. Consulta esta documentación
3. Prueba con el botón "Probar" en el dashboard
4. Verifica la configuración de mapeo de campos

---

## ✅ Checklist de Implementación

- [x] Modelo de datos en Prisma
- [x] Endpoint genérico `/api/webhook/[webhookId]`
- [x] APIs CRUD para gestión
- [x] UI en dashboard
- [x] Validación HMAC
- [x] Sistema de logs y entregas
- [x] Testing integrado
- [x] Documentación completa

---

## 🎉 ¡Sistema Listo!

El sistema de webhooks de entrada está **100% funcional** y listo para usar. Puedes empezar a recibir datos desde cualquier plataforma externa de inmediato.

**URL de Acceso**: `https://volkern.app/dashboard/integraciones/webhooks`

---

¿Necesitas ayuda? Consulta los ejemplos prácticos en esta guía o prueba el webhook desde el dashboard con el botón "Probar". 🚀
